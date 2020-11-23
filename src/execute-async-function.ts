/**
 * https://github.com/KeithHenry/chromeExtensionAsync
 * 
 * Inject and execute a single async function or promise in a tab, resolving with the result.
 * @author Keith Henry <keith.henry@evolutionjobs.co.uk>
 * @license MIT
 **/

import ChromePromise from '../vendor/chrome-promise/chrome-promise';
const chromep = new ChromePromise();

interface InjectAsyncDetails {
  /** JavaScript or CSS code to inject.
   * Warning: Be careful using the code parameter. Incorrect use of it may open your extension to cross site scripting attacks. */
  code: string;
}

/** Wrap the async function in an await and a runtime.sendMessage with the result
 * @param action The async function to inject into the page.
 * @param uid Single use random ID.
 * @param params Array of additional parameters to pass.
 * @returns Execution details to pass to chrome.tabs.executeScript
 **/
function setupDetails(action: Function | string | { code?: string; file?: string }, uid: string, params: any[]): chrome.tabs.InjectDetails {
    // Wrap the async function in an await and a runtime.sendMessage with the result
    // This should always call runtime.sendMessage, even if an error is thrown
    const wrapAsyncSendMessage = (action: string | Function) => `(async function () {
    const result = { asyncFuncID: '${uid}' };
    try {
        result.content = await (${action})(${params.map((p) => JSON.stringify(p)).join(',')});
    }
    catch(x) {
        // Make an explicit copy of the Error properties
        result.error = { 
            message: x.message, 
            arguments: x.arguments, 
            type: x.type, 
            name: x.name, 
            stack: x.stack 
        };
    }
    finally {
        // Always call sendMessage, as without it this might loop forever
        chrome.runtime.sendMessage(result);
    }
})()`;
    // Apply this wrapper to the code passed
    const execArgs: chrome.tabs.InjectDetails = {};
    if (typeof action === 'function' || typeof action === 'string')
    // Passed a function or string, wrap it directly
        execArgs.code = wrapAsyncSendMessage(action);
    else if (action.code) {
    // Passed details object https://developer.chrome.com/extensions/tabs#method-executeScript
        execArgs.code = wrapAsyncSendMessage(action.code);
    } else if (action.file)
        throw Error(`Cannot execute ${action.file}. File based execute scripts are not supported.`);
    else
        throw Error(`Cannot execute ${JSON.stringify(action)}, it must be a function, string, or have a code property.`);
    return execArgs;
}

/** Create a promise that resolves when chrome.runtime.onMessage fires with the id
 * @param {string} id ID for the message we're expecting.
 * Messages without the ID will not resolve this promise.
 * @returns {Promise} Promise that resolves when chrome.runtime.onMessage.addListener fires. */
function promisifyRuntimeMessage(id: string): Promise<any> {
    // We don't have a reject because the finally in the script wrapper should ensure this always gets called.
    return new Promise((resolve) => {
        const listener = (request?: { asyncFuncID: string }) => {
            // Check that the message sent is intended for this listener
            if (request && request.asyncFuncID === id) {
                // Remove this listener
                chrome.runtime.onMessage.removeListener(listener);
                resolve(request);
            }
            // Return false as we don't want to keep this channel open https://developer.chrome.com/extensions/runtime#event-onMessage
            return false;
        };

        chrome.runtime.onMessage.addListener(listener);
    });
}

/** Create a promise that resolves when chrome.tabs.onUpdated fires with the id
 * @param {string} id ID for the tab we're expecting.
 * Tabs without the ID will not resolve or reject this promise.
 * @param {number} msTimeout Optional milliseconds to timeout when tab is loading
 * If this value is null or zero, it defaults to 120,000 ms (2 minutes).
 * @returns {Promise} Promise that resolves when chrome.tabs.onUpdated.addListener fires. */
function promisifyTabUpdate(id: number, msTimeout: number) {
    const mainPromise = new Promise((resolve, reject) => {
        const tabUpdatedListener = (
            tabId: number,
            changeInfo: chrome.tabs.TabChangeInfo,
            tab: chrome.tabs.Tab
        ) => {
        // The onUpdated event is called multiple times during a single load.
        // the status of 'complete' is called only once, when it is finished.
            if (tabId === id && changeInfo.status === 'complete') {
                removeListeners();
                resolve({ tabId: tabId, changeInfo: changeInfo, tab: tab });
            }
        };

        // This will happen when the tab or window is closed before it finishes loading
        const tabRemovedListener = (tabId: number/*, removeInfo: any*/) => {
            if (tabId === id) {
                removeListeners();
                reject(
                    new Error(
                        `The tab with id = ${tabId} was removed before it finished loading.`
                    )
                );
            }
        };

        // This will happen when the tab is replaced.  This is untested, not sure how to recreate it.
        const tabReplacedListener = (addedTabId: number, removedTabId: number) => {
            if (removedTabId === id) {
                removeListeners();
                reject(
                    new Error(
                        `The tab with id = ${removedTabId} was replaced before it finished loading.`
                    )
                );
            }
        };

        const removeListeners = () => {
            chrome.tabs.onUpdated.removeListener(tabUpdatedListener);
            chrome.tabs.onRemoved.removeListener(tabRemovedListener);
            chrome.tabs.onReplaced.removeListener(tabReplacedListener);
        };

        chrome.tabs.onUpdated.addListener(tabUpdatedListener);
        chrome.tabs.onRemoved.addListener(tabRemovedListener);
        chrome.tabs.onReplaced.addListener(tabReplacedListener);
    });

    // Although I have onRemoved and onReplaced events watching to reject the promise,
    // there is nothing in the chrome extension api documentation that guarantees this will be an exhaustive approach.
    // So to account for the unknown, I am adding an auto-timeout feature to reject the promise after 2 minutes.
    const timeoutPromise = new Promise((resolve, reject) => {
        let millisecondsToTimeout = 12e4; // 12e4 = 2 minutes
        if (!!msTimeout && typeof msTimeout === 'number' && msTimeout > 0) {
            millisecondsToTimeout = msTimeout;
        }
        setTimeout(() => {
            reject(
                new Error(
                    `The tab loading timed out after ${millisecondsToTimeout / 1000
                    } seconds.`
                )
            );
        }, millisecondsToTimeout);
    });

    return Promise.race([mainPromise, timeoutPromise]);
}

/** Execute an async function and return the result.
 * @param {number} tab Optional ID of the tab in which to run the script; defaults to the active tab of the current window.
 * @param {function|string|object} action The async function to inject into the page.
 * This must be marked as async or return a Promise.
 * This can be the details object expected by [executeScript]{@link https://developer.chrome.com/extensions/tabs#method-executeScript},
 * in which case the code property MUST be populated with a promise-returning function.
 * @param {any[]} params Parameters to serialise and pass to the action (using JSON.stringify)
 * @returns {Promise} Resolves when the injected async script has finished executing and holds the result of the script.
 * Rejects if an error is encountered setting up the function, if an error is thrown by the executing script, or if it times out. */

export const chrome_tabs_executeAsyncFunction = async function (
    tab: number,
    // eslint-disable-next-line no-unused-vars
    action: ((...p: any[]) => any) | string | InjectAsyncDetails,
    ...params: any[]
): Promise<any> {
    // Generate a random 4-char key to avoid clashes if called multiple times
    const uid = Math.floor((1 + Math.random()) * 0x100000000)
        .toString(16)
        .substring(1);

    // Write the script and serialise the params
    const details = setupDetails(action, uid, params);

    // Add a listener so that we know when the async script finishes
    const message = promisifyRuntimeMessage(uid);

    // This will return a serialised promise, which will be broken (http://stackoverflow.com/questions/43144485)
    await chromep.tabs.executeScript(tab, details);

    // Wait until we have the result message
    const { content, error } = await message;

    if (error)
        throw new Error(`Error thrown in execution script: ${error.message}.
Stack: ${error.stack}`);

    return content;
};

/** Creates a Promise that resolves only when the created tab is finished loading.
 * The normal chrome.tabs.create function executes its' callback before the tab finishes loading the page.
 * @param {object} createProperties same as the createProperties param for [chrome.tabs.create]{@link https://developer.chrome.com/extensions/tabs#method-create}.
 * @param {number} msTimeout Optional milliseconds to timeout when tab is loading
 * If this value is null or zero, it defaults to 120,000 ms (2 minutes).
 * @returns {Promise} Resolves when the created tab has finished loading and holds the result.
 * The result is an object containing the parameters passed to the callback for [chrome.tabs.onUpdated]{@link https://developer.chrome.com/extensions/tabs#event-onUpdated}.
 * Rejects if an error is encountered loading the tab, or if it times out. */
export const chrome_tabs_createAndWait = async function (
    createProperties: object,
    msTimeout: number
): Promise<any> {
    const tab = await chromep.tabs.create(createProperties);
    const tabLoadCompletePromise = promisifyTabUpdate(
    tab.id as number,
    msTimeout
    );
    const results = await tabLoadCompletePromise;
    return results;
};

/** Creates a Promise that resolves only when the tab is finished reloading.
 * The normal chrome.tabs.reload function executes its' callback before the tab finishes loading the page.
 * @param {integer} tabId same as the tabId parameter for [chrome.tabs.reload]{@link https://developer.chrome.com/extensions/tabs#method-reload}.
 * @param {object} reloadProperties Optional, same as the reloadProperties parameter for [chrome.tabs.reload]{@link https://developer.chrome.com/extensions/tabs#method-reload}.
 * @param {number} msTimeout Optional milliseconds to timeout when tab is loading
 * If this value is null or zero, it defaults to 120,000 ms (2 minutes).
 * @returns {Promise} Resolves when the tab has finished reloading and holds the result.
 * The result is an object containing the parameters passed to the callback for [chrome.tabs.onUpdated]{@link https://developer.chrome.com/extensions/tabs#event-onUpdated}.
 * Rejects if an error is encountered loading the tab, or if it times out. */
export const chrome_tabs_reloadAndWait = async function (
    tabId: number,
    reloadProperties: object,
    msTimeout: number
): Promise<any> {
    await chromep.tabs.reload(tabId, reloadProperties);
    const tabLoadCompletePromise = promisifyTabUpdate(tabId, msTimeout);
    const results = await tabLoadCompletePromise;
    return results;
};

