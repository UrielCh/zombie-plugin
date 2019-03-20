import ChromePromise from "../vendor/chrome-promise";
import Tasker from "./tasker";
import ZUtils from "./zUtils";
import PluginStat, { PluginSavedState, PluginStatValue } from "./PluginStat";

const tasker = Tasker.Instance;
const chromep = new ChromePromise();
const pluginStat: PluginStatValue = PluginStat();

if (chrome.cookies)
    chrome.cookies.onChanged.addListener((changeInfo) => {
        const {
            cookie,
            cause
        } = changeInfo;
        if (cause == 'overwrite' || cause == 'expired_overwrite') {
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
        delete tasker.registedActionTab[tabId]
        pluginStat.nbRegistedActionTab = Object.keys(tasker.registedActionTab).length;
        if (oldTask && oldTask.target) {
            delete tasker.namedTab[oldTask.target]
            pluginStat.nbNamedTab = Object.keys(tasker.namedTab).length;
        }
    });

if (chrome.tabs)
    chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
        console.log({
            'replace': removedTabId,
            'by': addedTabId
        });
        tasker.registedActionTab[addedTabId] = tasker.registedActionTab[removedTabId];
        delete tasker.registedActionTab[removedTabId];
        return chromep.tabs.get(addedTabId)
            .then(addedTab => {
                for (const key in tasker.namedTab) {
                    const tab = tasker.namedTab[key];
                    if (tab.id == removedTabId)
                        tasker.namedTab[key] = addedTab;
                }
            }, error => {
                console.log(Error(error));
            });
    });


/**
 * PLUGIN CONNECTOR
 */

/**
 * Register function
 */
const pluginListenerExternal = (request: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => {
    if (!request.command) {
        sendResponse(ZUtils.toErr('Error all call must contains command name receved:' + JSON.stringify(request)));
        return true;
    }
    const mtd = tasker.commands[request.command];
    if (mtd)
        Promise.resolve()
            .then(() => mtd(request, sender, sendResponse))
            .catch(ZUtils.catchPromise(`External.${request.command}`));
    else
        sendResponse(`command ${request.command} not found`);
    return true;
}
/**
 * Find registred function and exec them
 */
const pluginListenerInternal = (request: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => {
    if (!request.command) {
        sendResponse(ZUtils.toErr(`Error all call must contains "command" name recieve:${JSON.stringify(request)}`));
        return true;
    }
    const mtd = tasker.commands[request.command];
    if (mtd)
        Promise.resolve()
            .then(() => mtd(request, sender, sendResponse))
            .catch(ZUtils.catchPromise(`Internal.${request.command}`));
    else
        sendResponse('command ' + request.command + ' not found');
    return true;
}
/**
 * https://developer.chrome.com/extensions/runtime#event-onMessageExternal
 */
if (chrome.runtime) {
    chrome.runtime.onMessageExternal.addListener(pluginListenerExternal);
    chrome.runtime.onMessage.addListener(pluginListenerInternal);
}

let souldCloseTabId = 0;
if (chrome.webRequest)
    chrome.webRequest.onErrorOccurred.addListener(details => {
        if (details.type != 'main_frame')
            return;
        if (details.error == 'net::ERR_FILE_NOT_FOUND' || details.error == 'net::ERR_NAME_NOT_RESOLVED') {
            console.log('onErrorOccurred close 1 sec', details.error);
            tasker.mayCloseTabIn(details.tabId, 1000);
            return;
        }
        if (
            details.error == 'net::ERR_TUNNEL_CONNECTION_FAILED' ||
            details.error == 'net::ERR_ABORTED' ||
            details.error == 'net::ERR_EMPTY_RESPONSE'
        ) {
            if (souldCloseTabId == details.tabId) {
                tasker.mayCloseTabIn(details.tabId, 1000);
                console.log(`${details.error} 2 ${details.error} ${details.url} Close in 1 sec`, details);
                return;
            }
            souldCloseTabId = details.tabId;
            console.log(`${details.error} ${details.error} ${details.url} Refresh in 5 sec`, details);
            setTimeout(ZUtils.refreshTab, 5000, details.tabId);
            return;
        }
        console.log('chrome.webRequest.onErrorOccurred close 5 sec [close Forced]', details);
        tasker.mayCloseTabIn(details.tabId, 5000);
        console.log(`${details.error} X ${details.error} ${details.url} Close in 5 sec`, details);
    }, {
            urls: ['<all_urls>']
        });

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

const setUserAgentHook = (data: chrome.webRequest.WebRequestHeadersDetails) => {
    let requestHeaders = data.requestHeaders;
    if (data && data.url && data.requestHeaders && data.requestHeaders.length > 0 && pluginStat.userAgent)
        requestHeaders = replaceUserAgent(pluginStat.userAgent, data.requestHeaders);
    return {
        requestHeaders
    };
};
if (chrome.webRequest)
    chrome.webRequest.onBeforeSendHeaders.addListener(setUserAgentHook, {
        'urls': ['http://*/*', 'https://*/*']
    }, ['requestHeaders', 'blocking']);

/**
 * @param {chrome.tabs.Tab} tab
 */
if (chrome.tabs)
    chrome.tabs.onCreated.addListener(tab => {
        if (!tab.id) {
            return;
        }
        const tabId = tab.id;
        // console.log('new tab created', tab.id, 'parent', tab.openerTabId);
        const checker = () => chromep.tabs.get(tabId)
            .then(tab => {
                //if (!tab)
                //    return;
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
                    setTimeout(tasker.mayCloseTabIn, 20000, tab.id);
                    return;
                }
                setTimeout(checker, 2000);
            }, error => Promise.resolve({
                message: 'done table ' + tab.id,
                details: Error(error)
            }));
        setTimeout(checker, 500);
    });

/**
 * Main testing loop every 5 sec
 */
setInterval(() => chromep.tabs.query({})
    .then(tabs => tabs.forEach(tab => {
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
    })), 5 * 60000); // 5 min


// load config from previous state
if (chrome.storage) {
    /**
     * @type {string}
     */
    let lastValue = '';
    chromep.storage.local.get(pluginStat.config)
        .then((items) => {
            pluginStat.config = <PluginSavedState>(items);
            lastValue = JSON.stringify(pluginStat.config);
        })
        .then(() => {
            // start sync loop
            setInterval(() => {
                let newVal = JSON.stringify(pluginStat.config);
                if (newVal != lastValue) {
                    console.log('Sync tasker.config value');
                    chromep.storage.local.set(pluginStat.config)
                        .then(() => lastValue = newVal);
                }
            }, 5000);
        })
}

chromep.proxy.settings.get({
    'incognito': false
}).then((config) => {
    pluginStat.proxy = config.value.mode;
});

