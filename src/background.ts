import ChromePromise from '../vendor/chrome-promise/chrome-promise';
import PluginStat from './PluginStat';
import { PluginStatValue, PluginSavedState, ZTask } from './interfaces';
import Tasker from './tasker';
import ZUtils from './zUtils';
import { wait } from './common';

const tasker = Tasker.Instance;
const chromep = new ChromePromise();
const pluginStat: PluginStatValue = PluginStat();

// if (chrome.cookies)
//     chrome.cookies.onChanged.addListener((changeInfo) => {
//         const {
//             cookie,
//             cause
//         } = changeInfo;
//         if (cause === 'overwrite' || cause === 'expired_overwrite') {
//             const {
//                 domain,
//                 name
//             } = cookie;
//             if (domain.indexOf('google.') >= 0 || domain.indexOf('youtube.') >= 0) {
//                 let now = Date.now();
//                 if (name === 'SIDCC') // https://www.zaizi.com/cookie-policy  throttle  SIDCC update
//                     now -= 10000;
//                 tasker.lastCookiesUpdate = Math.max(tasker.lastCookiesUpdate, now);
//             }
//         }
//     });

if (chrome.tabs)
    chrome.tabs.onRemoved.addListener((tabId/*, removeInfo*/) => {
        const oldTask = tasker.registedActionTab[tabId];
        delete tasker.registedActionTab[tabId];
        pluginStat.nbRegistedActionTab = Object.keys(tasker.registedActionTab).length;
        if (oldTask && oldTask.target) {
            const tabs = tasker.namedTab[oldTask.target];
            for (let i = tabs.length - 1; i >= 0; i--) {
                if (tabs[i].id === tabId)
                    tabs.splice(i, 1)
            }
            if (!tabs.length) {
                delete tasker.namedTab[oldTask.target];
            }
            Tasker.updateBadge();
        }
    });

if (chrome.tabs)
    chrome.tabs.onReplaced.addListener(async (addedTabId, removedTabId) => {
        //console.log({
        //    replace: removedTabId,
        //    by: addedTabId
        //});
        tasker.registedActionTab[addedTabId] = tasker.registedActionTab[removedTabId];
        delete tasker.registedActionTab[removedTabId];
        try {
            const addedTab = await chromep.tabs.get(addedTabId);
            for (const key in tasker.namedTab) {
                const tabs = tasker.namedTab[key];
                for (let i = 0; i < tabs.length; i++)
                    if (tabs[i].id === removedTabId) {
                        tabs[i] = addedTab;
                        break;
                    }
            }
        } catch (error) {
            console.log(Error(error));
        }
    });

/**
 * PLUGIN CONNECTOR
 */

/**
 * onMessage function reciever
 */
const pluginListener = (source: string) => async (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => {
    // dummy sendResponse for some test case
    if (!sendResponse)
        sendResponse = console.log;
    if (!message.command) {
        sendResponse({ error: `Error all call must contains "command" name recieve: ${JSON.stringify(message)}` });
        return true;
    }
    const mtd = tasker.commands[message.command];
    if (mtd)
        try {
            await mtd(message, sender, sendResponse);
        } catch (error) {
            const msg = `${source}.${message.command}`;
            console.log(msg, 'promise Failure', error);
            sendResponse({ error: `${msg} Failed ${error.message}` });
        }
    else
        sendResponse({ error: `command ${message.command} not found` });
    return true;
};

/**
 * onMessage function reciever
 */
const pluginListenerCnx = (source: string) => async (message: { requestId: number, data: any }, port: chrome.runtime.Port) => {
    const { requestId, data } = message;
    if (!data.command) {
        port.postMessage({ requestId, error: `Error all call must contains "command" name recieve: ${JSON.stringify(message)}` });
        return true;
    }
    const mtd = tasker.commands[data.command];
    if (mtd)
        try {
            const sendResponse = (response: any) => {
                try {
                    port.postMessage({ requestId, data: response });
                } catch (e) {
                    console.log(`RQ: ${requestId}, PostResponse Failed`, message, e);
                }
            };
            await mtd(data, port.sender, sendResponse);
        } catch (e) {
            const msg = `${source}.${data.command}`;
            console.log(msg, 'promise Failure', e);
            const error = e.message || e.statusText || e.toString();
            port.postMessage({ requestId, error: `${msg} ${error}`, stack: e.stack || '' });
        }
    else
        port.postMessage({ requestId, error: `command ${data.command} not found` });
    return true;
};

/**
 * https://developer.chrome.com/extensions/runtime#event-onMessageExternal
 */
if (chrome.runtime) {
    chrome.runtime.onConnect.addListener(port => {
        // console.log('connected ', port);
        port.onMessage.addListener(pluginListenerCnx('Connect'));
    });
    chrome.runtime.onMessageExternal.addListener(pluginListener('External'));
    chrome.runtime.onMessage.addListener(pluginListener('Internal'));
}

const ignoreErrorType: Set<string> = new Set('image');

let souldCloseTabId = 0;
if (chrome.webRequest) {
    chrome.webRequest.onAuthRequired.addListener((details, callbackFn) => {
        if (details.isProxy && pluginStat.config.proxyAuth && callbackFn)
            callbackFn({
                authCredentials: JSON.parse(pluginStat.config.proxyAuth)
            });
    },
        { urls: ['<all_urls>'] },
        ['asyncBlocking']);

    chrome.webRequest.onErrorOccurred.addListener(async (details) => {
        // do not case about image loading resource error
        if (ignoreErrorType.has(details.type)) // "main_frame" | "sub_frame" | "stylesheet" | "script" | "image" | "font" | "object" | "xmlhttprequest" | "ping" | "csp_report" | "media" | "websocket" | "other"
            return;

        // close tab keeped open by workers
        if (details.type === 'xmlhttprequest') {
            if (details.initiator) {
                const url = new URL(details.initiator);
                if (tasker.isBlockerDomain(url.hostname)) {
                    const tabs = await chromep.tabs.query({ url: url.hostname });
                    if (tabs.length) {
                        for (const tab of tabs)
                            if (tab.id)
                                ZUtils.closeTab(tab.id);
                    }
                }
                return;
            }
        }

        //   | "script"
        if (details.type !== 'main_frame') // "main_frame" | "sub_frame" | "stylesheet" | "script" | "image" | "font" | "object" | "xmlhttprequest" | "ping" | "csp_report" | "media" | "websocket" | "other"
            return;
        if (details.error === 'net::ERR_FILE_NOT_FOUND' || details.error === 'net::ERR_NAME_NOT_RESOLVED') {

            if (details.url.startsWith('chrome-extension://')) {
                console.log(`Force close 404 extention page ${details.url}`, details.error);
                ZUtils.closeTab(details.tabId);
                return;
            }
            console.log('onErrorOccurred close 1 sec', details.error);
            tasker.mayCloseTabIn(details.tabId, 6003);
            return;
        }

        if (details.error === 'net::ERR_BLOCKED_BY_CLIENT') {
            await wait(1009);
            ZUtils.closeTab(details.tabId);
            return;
        }

        if (
            details.error === 'net::ERR_TUNNEL_CONNECTION_FAILED' ||
            details.error === 'net::ERR_ABORTED' ||
            details.error === 'net::ERR_EMPTY_RESPONSE'
        ) {
            if (souldCloseTabId === details.tabId) {
                tasker.mayCloseTabIn(details.tabId, 6004);
                console.log(`${details.error} 2 ${details.error} ${details.url} Close in 1 sec`, details);
                return;
            }
            souldCloseTabId = details.tabId;
            console.log(`${details.error} ${details.error} ${details.url} Refresh in 5 sec canceled`, details);
            //await wait(5000);
            //ZUtils.refreshTab(details.tabId);
            return;
        }
        console.log('chrome.webRequest.onErrorOccurred close 5 sec [close Forced]', details);
        tasker.mayCloseTabIn(details.tabId, 5005);
        console.log(`${details.error} X ${details.error} ${details.url} Close in 5 sec`, details);
    }, {
        urls: ['<all_urls>']
    });
}

const replaceUserAgent = (userAgent: string, headers: chrome.webRequest.HttpHeader[]) => {
    if (!userAgent)
        return headers;
    return headers.map(header => {
        if (header.name !== 'User-Agent')
            return header;
        return {
            name: 'User-Agent',
            value: userAgent
        };
    });
};

if (chrome.webRequest) {
    const getHostname = (url: string) => {
        const aElm = document.createElement('a');
        aElm.href = url;
        return aElm.hostname;
    };

    /**
     * change user agent and block request if doamin match tasker.blockedDomains
     * @param data 
     */
    const setUserAgentHook = (data: chrome.webRequest.WebRequestHeadersDetails) => {
        let requestHeaders = data.requestHeaders;
        if (!data || !data.url)
            return {
                requestHeaders
            };
        const hostname = getHostname(data.url);
        if (tasker.isBlockerDomain(hostname)) {
            return { cancel: true };
        }
        if (data.requestHeaders && data.requestHeaders.length > 0 && pluginStat.userAgent)
            requestHeaders = replaceUserAgent(pluginStat.userAgent, data.requestHeaders);
        return {
            requestHeaders
        };
    };

    chrome.webRequest.onBeforeSendHeaders.addListener(setUserAgentHook, {
        urls: ['<all_urls>']
    }, ['requestHeaders', 'blocking']);
}

if (chrome.tabs)
    chrome.tabs.onCreated.addListener(async (tab) => {
        if (!tab.id)
            return;
        const tabId = tab.id;
        // console.log('new tab created', tab.id, 'parent', tab.openerTabId);
        await wait(500);
        try {
            const tab2 = await chromep.tabs.get(tabId);
            if (!tab2)
                return;
            // Tab is alive
            let title = tab2.title || '';
            title = title.toLowerCase();
            let sslError = false;
            if (title === 'erreur li\u00e9e \u00e0 la confidentialit\u00e9')
                sslError = true;
            if (title === 'privacy error')
                sslError = true;
            if (sslError) {
                console.log('closing tab due to ssl error [close DROPED]', title);
                console.log('chrome.webRequest.onErrorOccurred close 20 sec [close DROPED]');
                await wait(20000);
                if (tab2 && tab2.id)
                    tasker.mayCloseTabIn(tab2.id, 2006);
                return;
            }
        } catch (error) {
            return {
                message: 'done table ' + tab.id,
                details: Error(error)
            };
        }
    });

/**
 * Main testing loop every 5 sec
 * auto-close tab
 */
setInterval(async () => {
    const tabs = await chromep.tabs.query({});
    tabs.forEach((tab: chrome.tabs.Tab) => {
        const tabInformation: ZTask | null = tasker.getTabInformation(tab);
        if (tabInformation)
            return;
        if (!tab || !tab.url || !tab.id)
            return;
        if (ZUtils.isProtected(tab.url))
            return;
        tasker.mayCloseTabIn(tab.id, 5007);
    });
}, 5 * 60000); // 5 min

// load config from previous state
// save updated state every 3 sec
if (chrome.storage) {
    let lastValue = '';
    chromep.storage.local.get(pluginStat.config)
        .then(async (items) => {
            pluginStat.config = items as PluginSavedState;
            lastValue = JSON.stringify(pluginStat.config);
            Tasker.updateBadge();
            // eslint-disable-next-line no-constant-condition
            while (true) {
                await wait(3000);
                const newVal = JSON.stringify(pluginStat.config);
                // console.log('Sync Config', newVal);
                if (newVal === lastValue)
                    continue;
                // Tasker.updateBadge();
                // console.log('Sync tasker.config value');
                // console.log('calling await chromep.storage.local.set');
                await chromep.storage.local.set(pluginStat.config);
                lastValue = newVal;
            }
        });
}

// chromep.proxy.settings.get({
//    incognito: false
// }).then((config) => {
//    // console.log('Load PROXY conf: ', config);
//    /// pluginStat.proxy = config.value.mode;
//    // console.log(pluginStat);
// });
