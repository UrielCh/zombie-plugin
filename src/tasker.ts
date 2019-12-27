import ChromePromise from '../vendor/chrome-promise';
import jsQR from '../vendor/jsqr';
import PluginStat, { PluginStatValue } from './PluginStat';
import ZFunction from './zFunction';
import ZUtils from './zUtils';
import { wait } from './common';

interface RegisterCommandMessage {
    command: string;
    url: string;
    name?: string;
    active?: boolean;
    pinned?: boolean;
    target: string;
    deps: Array<string | string[]>;
    depCss?: string[];
    action: string;
    closeIrrelevantTabs?: boolean;
}

interface ZTask {
    /**
     * action to execute
     */
    action: string;
    /**
     * javascript url to inject
     */
    deps: Array<string | string[]>;
    /**
     * css url to inject
     */
    depCss: string[];
    target: string;
}

const zFunction = ZFunction.Instance;

const chromep = new ChromePromise();
const pluginStat: PluginStatValue = PluginStat();
const toOk = (message: any) => (message);

/*
const pError = (sendResponse: (response: any) => void, prefix: string, error: Error) => {
    prefix = prefix || '';
    // const stack = Error(prefix);
    const errorMsg = `${prefix} ${error.message}`.trim();
    console.error(`chrome error message ${prefix}: `, error);
    if (sendResponse)
        return sendResponse(ZUtils.toErr(errorMsg));
};
*/
//  to promis Keeping this
function setPromiseFunction(fn: ((...args: any) => any), thisArg: any) {
    return (...arg: any[]) => {
        const args = Array.prototype.slice.call(arg);
        return new Promise((resolve, reject) => {
            function callback(...arg2: any[]) {
                const err = chrome.runtime.lastError;
                if (err)
                    return reject(err);
                const results = Array.prototype.slice.call(arg2);
                switch (results.length) {
                    case 0:
                        return resolve();
                    case 1:
                        return resolve(results[0]);
                    default:
                        return resolve(results);
                }
            }
            args.push(callback);
            fn.apply(thisArg, args);
        });
    };
}
/*
function setPromiseFunctionLT(fn: Function) {
    return function(...args: any[]) {
        return new Promise((resolve, reject) => {
            function callback(resp: any) {
                const err = chrome.runtime.lastError;
                if (err)
                    return reject(err);
                resolve(resp);
            }
            fn.apply(null, [...args, callback]);
        });
    };
}

function toPromise(fn: Function) {
    return function(...args: any[]) {
        return new Promise((resolve, reject) => {
            function callback(resp: any) {
                const err = chrome.runtime.lastError;
                if (err)
                    return reject(err);
                resolve(resp);
            }
            fn.apply(null, [...args, callback]);
        });
    };
}
*/
// : (target: chrome.debugger.Debuggee) => Promise<void>
const chrome_debugger_attach = setPromiseFunction(chrome.debugger.attach, chrome.debugger);
const chrome_debugger_detach = setPromiseFunction(chrome.debugger.detach, chrome.debugger);
// const chrome_debugger_sendCommand = setPromiseFunction(chrome.debugger.sendCommand, chrome.debugger);
const chrome_debugger_sendCommand = setPromiseFunction(chrome.debugger.sendCommand, chrome.debugger) as (target: chrome.debugger.Debuggee, method: string, commandParams?: object) => Promise<any>;

// const debugger_sendCommand = (target: chrome.debugger.Debuggee, method: string, commandParams?: Object) => chrome_debugger_sendCommand(target, method, commandParams);

// (target: chrome.debugger.Debuggee) => new Promise((resolve, reject) => {
/*
const chrome_debugger_detach = (target: chrome.debugger.Debuggee) => new Promise((resolve, reject) => {
    function callback() {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(err);
        } else {
            resolve();
        }
      }
    chrome.debugger.detach(target, callback);
});
*/

export default class Tasker {
    public static updateBadge() {
        if (!chrome.browserAction)
            return;
        if (!pluginStat.config.injectProcess) {
            chrome.browserAction.setBadgeText({ text: 'X' });
            chrome.browserAction.setBadgeBackgroundColor({ color: 'red' });
        } else if (pluginStat.config.pauseProcess) {
            chrome.browserAction.setBadgeBackgroundColor({ color: '#3a87ad' });
            chrome.browserAction.setBadgeText({ text: 'II' });
        } else {
            chrome.browserAction.setBadgeBackgroundColor({ color: '#468847' });
            chrome.browserAction.setBadgeText({ text: String(Object.keys(Tasker.Instance.namedTab).length) });
        }
    }

    private static _instance: Tasker;

    public blockedDomains: string[] = [];

    public lastCookiesUpdate: number = 0;

    public lastCookiesSave: number = 0;

    /**
     * mapping tabId => ZTask
     */
    public registedActionTab: { [key: number]: ZTask } = {};

    /**
     * number of registedActionTab
     */
    public nbRegistedActionTab: number = 0;

    /**
     * mapping tablename => chrome.tabs.Tab
     */
    public namedTab: { [key: string]: chrome.tabs.Tab } = {};

    private constructor() {
    }

    public static get Instance() {
        // Do you need arguments? Make it a regular method instead.
        return this._instance || (this._instance = new this());
    }

    /**
     * close a tab if autoclose if enabled
     *
     * @param {number} tabId - tabId to close
     * @param {number} ms - milliSec to wait before close
     */
    public async mayCloseTabIn(tabId: number, ms: number) {
        if (!tabId)
            throw Error('missing tabId');
        ms = ms || 10000;
        if (pluginStat.config.closeIrrelevantTabs) {
            console.log(`Will Close tab ${tabId} in ${ms} ms`);
            await wait(ms);
            const tab = await chromep.tabs.get(tabId);
            if (tab) {
                const tabInformation = Tasker.Instance.getTabInformation(tab);
                if (tabInformation) {
                    console.log(`Tab ${tabId} is now registred, abord close`);
                } else {
                    ZUtils.closeTab(tabId);
                }
            }
        }
        return 'ok';
    }

    /**
     * copy parent tab task to chidlren tab task
     * @param {chrome.tabs.Tab} tab
     * @returns {ZTask|null} todo
     */
    public getTabInformation(tab: chrome.tabs.Tab) {
        if (!tab || !tab.id)
            return null;
        const parentTabId = tab.openerTabId;
        // Get tab info
        let taskParameters = this.registedActionTab[tab.id] || null;
        if ((parentTabId || parentTabId === 0) && !taskParameters) {
            taskParameters = this.registedActionTab[parentTabId] || null;
            if (taskParameters)
                this.registedActionTab[tab.id] = taskParameters;
        }
        return taskParameters;
    }

    // last setted user agent (original data is stored in chrome.storage)
    // events command map
    private debuggerTabId: number = 0;

    public commands: { [key: string]: (message: any, sender: chrome.runtime.MessageSender | undefined, sendResponse: (response: any) => any) => Promise<any> } = {
        updateBadge: (request, sender, sendResponse) => {
            Tasker.updateBadge();
            return sendResponse('ok');
        },
        /**
         * debugger interaction
         */
        sendCommand: async (request, sender, sendResponse) => {
            const { method, commandParams } = request;
            console.log({ method, commandParams });
            if (!sender || !sender.tab || !sender.tab.id)
                throw Error('sender.tab is missing');
            const tabId = sender.tab.id;

            if (sender.tab.id !== Tasker.Instance.debuggerTabId) {
                if (Tasker.Instance.debuggerTabId)
                    await chrome_debugger_detach({ tabId: Tasker.Instance.debuggerTabId });
                await chrome_debugger_attach({ tabId }, '1.3');
                Tasker.Instance.debuggerTabId = tabId;
            }
            console.log({ target: { tabId }, method, commandParams });
            await chrome_debugger_sendCommand({ tabId }, method, commandParams);
            sendResponse(toOk('ok'));
        },
        /**
         * External
         */

        /**
         * @param {any} request
         * @param {chrome.runtime.MessageSender} sender
         */
        close: async (request, sender, sendResponse) => {
            if (pluginStat.config.noClose) {
                sendResponse(toOk('ok'));
                return true;
            }
            await ZUtils.closeAllTabExept(0);
            sendResponse(toOk('ok'));
        },
        /**
         * External Close caller Tab
         */
        closeMe: async (request, sender, sendResponse) => {
            if (pluginStat.config.noClose) {
                sendResponse(toOk('ok'));
                return true;
            }
            if (!sender || !sender.tab || !sender.tab.id) {
                throw Error('sender.tab is missing');
            }
            if (request.lazy) {
                await this.mayCloseTabIn(sender.tab.id, 5001);
                sendResponse(toOk('ok'));
            } else {
                await ZUtils.closeTab(sender.tab.id);
                sendResponse(toOk('ok'));
            }
            // drop Internal.closeMe promise Failure Error: Attempting to use a disconnected port object
        },


        /**
         */
        preventPrompts: async (request, sender, sendResponse) => {
            if (sender && sender.tab && sender.tab.id) {
                const tabId = sender.tab.id;
                await ZUtils.preventPrompts(tabId);
                sendResponse(toOk('ok'));
            } else
                throw Error('missing tab');
        },

        /**
         * External
         */
        registerCommand: async (request: RegisterCommandMessage, sender, sendResponse) => {
            const params: chrome.tabs.CreateProperties = {
                active: request.active || false,
                pinned: request.pinned || false,
                url: request.url
            };
            if (request.closeIrrelevantTabs === true || request.closeIrrelevantTabs === false)
                pluginStat.config.closeIrrelevantTabs = request.closeIrrelevantTabs;
            const task: ZTask = {
                action: request.action,
                depCss: request.depCss || [],
                deps: request.deps || [],
                target: request.target || ''
            };
            if (!task.action)
                throw Error('action string is missing');

            let tab: chrome.tabs.Tab | null = null;
            if (task.target && Tasker.Instance.namedTab[task.target]) {
                const tabOld = Tasker.Instance.namedTab[task.target];
                if (tabOld && tabOld.id)
                    tab = await chromep.tabs.update(tabOld.id, params);
            }
            // si pas d'ancien TASK create
            // new TAB
            if (!tab)
                tab = await chromep.tabs.create(params);

            if (!tab || !tab.id)
                return;
            Tasker.Instance.registedActionTab[tab.id] = task;
            pluginStat.nbRegistedActionTab = Object.keys(Tasker.Instance.registedActionTab).length;
            if (task.target) {
                Tasker.Instance.namedTab[task.target] = tab;
                pluginStat.nbNamedTab = Object.keys(Tasker.Instance.namedTab).length;
                Tasker.updateBadge();
            }
            sendResponse(toOk('done'));
        },

        readQrCode: async (request, sender, sendResponse) => {
            let windowId = 0;
            if (sender && sender.tab && sender.tab.windowId)
                windowId = sender.tab.windowId;
            else {
                const tabs = await chromep.tabs.query({
                    lastFocusedWindow: true
                });
                if (!tabs || !tabs.length)
                    throw Error('no lastFocusedWindow, select a tab first');
                windowId = tabs[0].windowId;
            }
            const raw = await chromep.tabs.captureVisibleTab(windowId, {
                format: 'png'
            });
            if (!raw)
                throw Error('error capturing screen');
            const prefix = 'data:image/png;base64,';
            if (raw.indexOf(prefix) !== 0)
                throw Error('error capturing screen');
            const data = raw.substring(prefix.length);
            const pngBytes = base64js.toByteArray(data);

            await new Promise((resolve, reject) => {
                new PNGReader(pngBytes).parse((error, png) => {
                    if (error)
                        return reject(sendResponse({
                            error
                        }));
                    const qrCodeReader = jsQR(png.pixels, png.width, png.height, {
                        depth: 3
                    });
                    if (!qrCodeReader)
                        return reject(sendResponse('no QR code'));

                    // qrCodeReader.data;
                    // console.log(qrCodeReader)
                    const {
                        topLeftCorner,
                        bottomRightCorner
                    } = qrCodeReader.location;
                    const result = {
                        x1: topLeftCorner.x,
                        y1: topLeftCorner.y,
                        x2: bottomRightCorner.x,
                        y2: bottomRightCorner.y,
                        text: qrCodeReader.data,
                    };
                    return resolve(sendResponse([result]));
                });
            });
        },

        saveCookies: async (request, sender, sendResponse) => {
            this.lastCookiesSave = Date.now();
            // console.log(`lastCookiesSave updated`);
            sendResponse(toOk('ok'));
        },

        /**
         * setBlockedDomains {domains:[dom1, dom2 ...]}
         */
        setBlockedDomains: async (request, sender, sendResponse) => {
            const { domains } = request;
            Tasker.Instance.blockedDomains = domains;
            return sendResponse('updated');
        },
        /**
         * setProxy {scheme, host, port}
         */
        setProxy: async (request, sender, sendResponse) => {
            let proxy = '';
            const {
                host,
                password,
                port,
                username
            } = request;
            const scheme = request.scheme || 'http';
            if (!host) {
                // disable proxy
                await chromep.proxy.settings.clear({
                    scope: 'regular'
                });
                pluginStat.config.proxyAuth = '';
                pluginStat.proxy = 'system';
            } else {
                // enable proxy
                proxy = `${scheme}://${host}:${port}`;
                await chromep.proxy.settings.set({
                    scope: 'regular', // regular_only, incognito_persistent, incognito_session_only
                    value: {
                        mode: 'fixed_servers',
                        rules: {
                            bypassList: ['<local>', '10.0.0.0/8', '192.168.0.0/16'],
                            singleProxy: {
                                host,
                                port,
                                scheme
                            }
                        }
                    }
                });
                if (username && password)
                    pluginStat.config.proxyAuth = JSON.stringify({ username, password });
                else
                    pluginStat.config.proxyAuth = '';
                pluginStat.proxy = `${scheme}://${host}:${port}`;
            }
            await chromep.storage.local.set({ proxy });
            sendResponse(toOk('ok'));
        },
        /**
         */
        setGeoloc: async (request, sender, sendResponse) => {
            // cast to Coordinates
            const coords = /** @type {Coordinates} */ (request);
            if (coords.latitude && coords.latitude && coords.accuracy) {
                delete request.command;
                await chromep.storage.local.set({ coords });
            } else
                await chromep.storage.local.remove('coords');
            return sendResponse(toOk('ok'));
        },
        /**
         * External
         */
        updateAction: async (request, sender, sendResponse) => {
            if (!sender || !sender.tab || !sender.tab.id)
                return sendResponse(toOk('ok'));
            if (typeof request.action === 'undefined')
                throw Error('updateAction must contains action parameter');
            const task = Tasker.Instance.registedActionTab[sender.tab.id];
            task.action = request.action;
            return sendResponse(toOk('ok'));
        },
        /**
         * External
         */
        deleteCookies: async (request, sender, sendResponse) => {
            const {
                domain,
                name
            } = request;
            if (domain || name) {
                //const count = await 
                zFunction.deleteCookies({ domain, name }).then(count => sendResponse(toOk(count)));
                // sendResponse(toOk(count));
            } else
                throw Error('Missing "domain" or "name" argument as regexp.');
        },

        /**
         *
         */
        popCookies: async (request, sender, sendResponse) => {
            const {
                domain,
                name
            } = request;
            if (domain || name) {
                const cookies = await zFunction.popCookies({ domain, name });
                sendResponse(toOk(cookies));
            } else
                throw Error('Missing "domain" or "name" argument as regexp.');
        },
        /**
         *
         */
        getCookies: async (request, sender, sendResponse) => {
            const {
                domain,
                name
            } = request;
            if (domain || name) {
                const cookies = await zFunction.getCookies({ domain, name });
                sendResponse(toOk(cookies));
            } else
                throw Error('Missing "domain" or "name" argument as regexp.');
        },

        /**
         *
         */
        pushCookies: async (request, sender, sendResponse) => {
            await zFunction.pushCookies(request.cookies);
            Tasker.Instance.lastCookiesSave = Date.now();
            sendResponse(toOk('ok'));
        },
        /**
         * Deprecated
         */
        putCookies: async (request, sender, sendResponse) => {
            await zFunction.pushCookies(request.cookies);
            Tasker.Instance.lastCookiesSave = Date.now();
            sendResponse(toOk('ok'));
        },
        /**
         * External
         */
        clean: async (request, sender, sendResponse) => {

            const options: chrome.browsingData.RemovalOptions = {
                since: 0
            };
            const dataToRemove: chrome.browsingData.DataTypeSet = {
                appcache: true,
                cache: true,
                // cacheStorage: true, only on new chrome
                downloads: true,
                fileSystems: true,
                formData: true,
                history: true,
                indexedDB: true,
                localStorage: true,
                pluginData: true, // new
                serviceWorkers: true, // new
                webSQL: true,
                // serverBoundCertificates: true,
            };
            if ((chrome.browsingData as any).removeCacheStorage)
                (dataToRemove as any).cacheStorage = true; // Since Chrome 72.
            // chrome.browsingData.remove bug and use not to be call
            await Promise.race([() => chromep.browsingData.remove(options, dataToRemove), () => wait(500)]);
            sendResponse(toOk(1));

        },
        isOpen: async (request, sender, sendResponse) => {
            const target = request.target || request.tab || null;
            let count = '0';
            if (target != null && Tasker.Instance.namedTab[target])
                count = '1';
            sendResponse(toOk(count));
        },
        /**
         * Internal
         */
        get: async (request, sender, sendResponse) => {
            const r = await zFunction.httpGetPromise(request.url);
            sendResponse(toOk(r.data));
        },
        /**
         * Remove all cached Script
         */
        flushCache: async (request, sender, sendResponse) => {
            await zFunction.flush();
            sendResponse(toOk('ok'));
        },
        /**
         * Internal http POST
         */
        post: async (request, sender, sendResponse) => {
            const response = await zFunction.postJSON(request.url, request.data);
            sendResponse(toOk(response));
        },

        /**
         *
         */
        storageGet: async (request, sender, sendResponse) => {
            const result = await chromep.storage.local.get(request.key);
            sendResponse(toOk(result[request.key] || request.defaultValue));
        },

        /**
         */
        storageSet: async (request, sender, sendResponse) => {
            await chromep.storage.local.set({
                [request.key]: request.value
            });
            sendResponse(toOk('ok'));
        },
        /**
         */
        storageRemove: async (request, sender, sendResponse) => {
            await chromep.storage.local.remove(request.key);
            sendResponse(toOk('ok'));
        },
        /**
         */
        openExtensionManager: async (request, sender, sendResponse) => {
            await chromep.tabs.create({
                url: 'chrome://extensions'
            });
            sendResponse(toOk('ok'));
        },
        /**
         * Internal
         * @param {any} request
         * @param {chrome.runtime.MessageSender} sender
         * @param {(response: any) => void} sendResponse
         */
        getTodo: async (request, sender, sendResponse) => {
            if (!sender)
                return;
            const tab = sender.tab;
            if (!tab || !tab.id)
                return;
            if (!pluginStat.config.injectProcess)
                return;
            const tabId = tab.id;
            const tabInformation = Tasker.Instance.getTabInformation(tab);
            //try {
                if (!tabInformation) {
                    // mo job for this tabs
                    if (ZUtils.isProtected(tab.url))
                        return;
                    await this.mayCloseTabIn(tabId, 10002);
                    sendResponse(toOk('NOOP'));
                    return;
                }
                const javascriptIncludes = tabInformation.deps || [];
                const debugText = '// sources:\r\n// ' + ZFunction.flat(javascriptIncludes).join('\r\n// ');
                // if this tab has parent that we known of
                // table of parent
                await zFunction.injectCSS(tabId, tabInformation.depCss);
                await zFunction.injectJS(tabId, javascriptIncludes);
                const jsBootstrap = '\"use strict\";\n' + debugText + '\r\n' + (pluginStat.config.debuggerStatement ? 'debugger;' : '');
                await zFunction.injectJavascript(tabId, jsBootstrap + tabInformation.action);
                sendResponse(toOk('code injected'));
            //} catch (e) {
            //    try {
            //        pError(sendResponse, 'injectCSS', e);
            //    } catch (error) {
            //        console.log(`code injected Failed, Should refresh/Kill tab:${tabId}`, error);
            //        await wait(2500);
            //        await ZUtils.refreshTab(tabId);
            //    }
            //}
        },
        setUserAgent: async (request, sender, sendResponse) => {
            pluginStat.userAgent = request.userAgent;
            sendResponse(toOk('ok'));
        },
        getConfigs: async (request, sender, sendResponse) => {
            sendResponse({
                ...pluginStat.config,
                lastCookiesSave: Tasker.Instance.lastCookiesSave,
                lastCookiesUpdate: Tasker.Instance.lastCookiesUpdate
            });
        }
    };
}
