import ChromePromise from '../vendor/chrome-promise';
import PluginStat, { PluginSavedState, PluginStatValue } from './PluginStat';
import Tasker from './tasker';
import ZUtils from './zUtils';

const tasker = Tasker.Instance;
const chromep = new ChromePromise();
const pluginStat: PluginStatValue = PluginStat();

const wait = (duration: number) => new Promise(resolve => setTimeout(() => (resolve()), duration));

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

if (chrome.tabs)
    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
        const oldTask = tasker.registedActionTab[tabId];
        delete tasker.registedActionTab[tabId];
        pluginStat.nbRegistedActionTab = Object.keys(tasker.registedActionTab).length;
        if (oldTask && oldTask.target) {
            delete tasker.namedTab[oldTask.target];
            pluginStat.nbNamedTab = Object.keys(tasker.namedTab).length;
            Tasker.updateBadge();
        }
    });

if (chrome.tabs)
    chrome.tabs.onReplaced.addListener(async (addedTabId, removedTabId) => {
        console.log({
            replace: removedTabId,
            by: addedTabId
        });
        tasker.registedActionTab[addedTabId] = tasker.registedActionTab[removedTabId];
        delete tasker.registedActionTab[removedTabId];
        try {
            const addedTab = await chromep.tabs.get(addedTabId);
            for (const key in tasker.namedTab) {
                const tab = tasker.namedTab[key];
                if (tab.id === removedTabId)
                    tasker.namedTab[key] = addedTab;
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
const pluginListener = (internal: boolean ) => async (request: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => {
    if (!request.command) {
        sendResponse(ZUtils.toErr(`Error all call must contains "command" name recieve: ${JSON.stringify(request)}`));
        return true;
    }
    const mtd = tasker.commands[request.command];
    if (mtd)
        try {
            if (!sendResponse)
                sendResponse = console.log;
            await mtd(request, sender, sendResponse);
        } catch (e) {
            ZUtils.catchPromise(`${internal ? 'Internal' : 'External'}.${request.command}`)(e);
        }
    else
        sendResponse(`command ${request.command} not found`);
    return true;
};

/**
 * https://developer.chrome.com/extensions/runtime#event-onMessageExternal
 */
if (chrome.runtime) {
    chrome.runtime.onMessageExternal.addListener(pluginListener(false));
    chrome.runtime.onMessage.addListener(pluginListener(true));
}

let souldCloseTabId = 0;
if (chrome.webRequest) {
    chrome.webRequest.onAuthRequired.addListener((details, callbackFn) => {
        if (details.isProxy && pluginStat.config.proxyAuth && callbackFn)
            callbackFn({
                authCredentials: pluginStat.config.proxyAuth
            });
    },
        { urls: ['<all_urls>'] },
        ['asyncBlocking']);

    chrome.webRequest.onErrorOccurred.addListener(async (details) => {
        if (details.type !== 'main_frame')
            return;
        if (details.error === 'net::ERR_FILE_NOT_FOUND' || details.error === 'net::ERR_NAME_NOT_RESOLVED') {
            console.log('onErrorOccurred close 1 sec', details.error);
            tasker.mayCloseTabIn(details.tabId, 1000);
            return;
        }
        if (
            details.error === 'net::ERR_TUNNEL_CONNECTION_FAILED' ||
            details.error === 'net::ERR_ABORTED' ||
            details.error === 'net::ERR_EMPTY_RESPONSE'
        ) {
            if (souldCloseTabId === details.tabId) {
                tasker.mayCloseTabIn(details.tabId, 1000);
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
        tasker.mayCloseTabIn(details.tabId, 5000);
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
 * @param {chrome.tabs.Tab} tab
 */
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
                    tasker.mayCloseTabIn(tab2.id, 10);
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
    tabs.forEach(tab => {
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
        tasker.mayCloseTabIn(tab.id, 20);
    });
}, 5 * 60000); // 5 min

// load config from previous state
if (chrome.storage) {
    let lastValue = '';
    chromep.storage.local.get(pluginStat.config)
        .then((items) => {
            pluginStat.config = items as PluginSavedState;
            lastValue = JSON.stringify(pluginStat.config);
            Tasker.updateBadge();
        })
        .then(() => {
            // start sync loop
            setInterval(async () => {
                const newVal = JSON.stringify(pluginStat.config);
                if (newVal !== lastValue) {
                    // Tasker.updateBadge();
                    // console.log('Sync tasker.config value');
                    await chromep.storage.local.set(pluginStat.config);
                    lastValue = newVal;
                }
            }, 5000);
        });
}

chromep.proxy.settings.get({
    incognito: false
}).then((config) => {
    // console.log('Load PROXY conf: ', config);
    pluginStat.proxy = config.value.mode;
});
