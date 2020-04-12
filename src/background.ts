/* eslint-disable indent */
import ChromePromise from '../vendor/chrome-promise';
import PluginStat from './PluginStat';
// eslint-disable-next-line no-unused-vars
import { PluginStatValue, PluginSavedState } from './interfaces';
import Tasker from './tasker';
import ZUtils from './zUtils';
import { wait } from './common';

const tasker = Tasker.Instance;
const chromep = new ChromePromise();
const pluginStat: PluginStatValue = PluginStat();

if (chrome.cookies)
    chrome.cookies.onChanged.addListener((changeInfo) => {
        const {
            cookie,
            cause
        } = changeInfo;
        if (cause === 'overwrite' || cause === 'expired_overwrite') {
            const {
                domain,
                name
            } = cookie;
            if (domain.indexOf('google.') >= 0 || domain.indexOf('youtube.') >= 0) {
                let now = Date.now();
                if (name === 'SIDCC') // https://www.zaizi.com/cookie-policy  throttle  SIDCC update
                    now -= 10000;
                tasker.lastCookiesUpdate = Math.max(tasker.lastCookiesUpdate, now);
            }
        }
    });
/**
 * PLUGIN CONNECTOR
 */

/**
 * onMessage function reciever
 */
const pluginListener = (source: string) => async (
    message: { command: string } & { [key: string]: any },
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
) => {
    if (!message.command) {
        // sendResponse({ error: `Error all call must contains "command" name recieve: ${JSON.stringify(message)}` });
        return true;
    }
    const mtd = tasker.commands[message.command];
    if (mtd)
        try {
            if (!sendResponse)
                sendResponse = console.log;
            await mtd.call(tasker, message, sender, sendResponse);
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
            await mtd.call(tasker, data, port.sender, sendResponse);
        } catch (e) {
            const msg = `${source}.${data.command}`;
            const error = e.message || e.statusText || e.toString();
            if (error !== 'Attempting to use a disconnected port object') {
                console.log(msg, 'promise Failure', e);
                port.postMessage({ requestId, error: `${msg} ${error}`, stack: e.stack || '' });
            }
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
        if (details.type !== 'main_frame')
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
            console.log(`${details.error} ${details.error} ${details.url} Refresh in 5 sec`, details);
            await wait(5000);
            ZUtils.refreshTab(details.tabId);
            return;
        }
        console.log('chrome.webRequest.onErrorOccurred close 5 sec [close Forced]', details);
        tasker.mayCloseTabIn(details.tabId, 5005);
        console.log(`${details.error} X ${details.error} ${details.url} Close in 5 sec`, details);
    }, {
        urls: ['<all_urls>']
    });

    const getHostname = (url: string) => {
        const aElm = document.createElement('a');
        aElm.href = url;
        return aElm.hostname;
    };

    const setUserAgentHook = (data: chrome.webRequest.WebRequestHeadersDetails) => {
        let requestHeaders = data.requestHeaders;
        if (!data || !data.url)
            return {
                requestHeaders
            };
        if (tasker.blockedDomains && tasker.blockedDomains.length) {
            const hostname = getHostname(data.url);
            for (const dom of tasker.blockedDomains)
                if (~hostname.indexOf(dom))
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

/**
 * chrome tabs events
 */
if (chrome.tabs) {
    // Fired when a tab is closed.
    chrome.tabs.onRemoved.addListener((tabId: number/*, removeInfo*/) => {
        const oldTask = tasker.registedActionTab[tabId];
        if (!oldTask)
            return;
        delete tasker.registedActionTab[tabId];
        pluginStat.nbRegistedActionTab = Object.keys(tasker.registedActionTab).length;
        if (oldTask.target) {
            const tableSet = tasker.namedTab[oldTask.target];
            if (tableSet) {
                const tableSet2 = tableSet.filter((tab: chrome.tabs.Tab) => tab.id !== tabId);
                tasker.namedTab[oldTask.target] = tableSet2;
                if (!tableSet.length) {
                    delete tasker.namedTab[oldTask.target];
                }
                tasker.updateBadge();
            }
        }
    });

    // Fired when a tab is replaced with another tab due to prerendering or instant.
    chrome.tabs.onReplaced.addListener(async (addedTabId: number, removedTabId: number) => {
        if (!tasker.registedActionTab[removedTabId])
            return;
        const zTask = tasker.registedActionTab[removedTabId];
        tasker.registedActionTab[addedTabId] = zTask;
        const DO_REPLACE = false;
        if (DO_REPLACE) {
            delete tasker.registedActionTab[removedTabId];
            try {
                const addedTab = await chromep.tabs.get(addedTabId);
                // for (const key in tasker.namedTab) {
                const key = zTask.target;
                if (key)
                    tasker.namedTab[key] = tasker.namedTab[key].map((tab: chrome.tabs.Tab) => {
                        if (tab.id === removedTabId)
                            return addedTab;
                        return tab;
                    });
                // }
            } catch (error) {
                console.error(Error(error));
            }
        } else {
            // DO APPEND
            try {
                const addedTab = await chromep.tabs.get(addedTabId);
                if (!tasker.namedTab[zTask.target])
                    tasker.namedTab[zTask.target] = [];
                tasker.namedTab[zTask.target].push(addedTab);
                tasker.updateBadge();
            } catch (error) {
                console.log(Error(error));
            }
        }
    });

    /**
     * just close Some Error pages
     * 
     * Fired when a tab is created. Note that the tab's URL may not be set at the time this event is fired, but you can listen to onUpdated events so as to be notified when a URL is set.
     */
    chrome.tabs.onCreated.addListener(async (tab: chrome.tabs.Tab) => {
        if (!tab.id)
            return;
        const tabId = tab.id;
        // console.log('new tab created', tab.id, 'parent', tab.openerTabId);
        await wait(500);
        try {
            tab = await chromep.tabs.get(tabId);
            if (!tab)
                return;
            // Tab is alive
            let title = tab.title || '';
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
                if (tab && tab.id)
                    tasker.mayCloseTabIn(tab.id, 2006);
                return;
            }
        } catch (error) {
            return {
                message: `done table ${tabId}`,
                details: Error(error)
            };
        }
    });
}

/**
 * Main testing loop every 5 min
 * auto-close tab
 */
setInterval(async () => {
    const tabs = await chromep.tabs.query({});
    tabs.forEach((tab: chrome.tabs.Tab) => {
        /**
         * @var {ZTask}
         */
        const tabInformation = tasker.getTabInformation(tab);
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
            tasker.updateBadge();
            // eslint-disable-next-line no-constant-condition
            while (true) {
                await wait(3000);
                const newVal = JSON.stringify(pluginStat.config);
                // console.log('Sync Config', newVal);
                if (newVal === lastValue)
                    continue;
                // tasker.updateBadge();
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
