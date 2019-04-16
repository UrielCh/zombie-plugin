import ChromePromise from "../vendor/chrome-promise";
import ZFunction from "./zFunction";
import ZUtils from "./zUtils";
import jsQR from "../vendor/jsqr";
import PluginStat, { PluginStatValue } from "./PluginStat";

interface registerCommandMessage {
    command: string;
    url: string;
    name?: string;
    active?: boolean;
    pinned?: boolean;
    target: string;
    deps: (string | string[])[];
    depCss?: string[]
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
    deps: (string | string[])[];
    /**
     * css url to inject
     */
    depCss: string[];
    target: string;
}

/**
 * @type {ZFunction}
 */
const zFunction = ZFunction.Instance;

/** @type {ChromePromise} */
const chromep = new ChromePromise();
const pluginStat: PluginStatValue = PluginStat();


/**
* @param message {any}
*/
const toOk = (message: any) => (message);

/**
* @param sendResponse  { (response: any) => void} }
* @param prefix  { string }
* @returns {(error:any) => any}
*/
const pError = (sendResponse: (response: any) => void, prefix: string) => {
    prefix = prefix || '';
    const stack = Error();
    return (error: string) => {
        error = `${prefix} ${error}`.trim();
        console.error('chrome error message:', stack, error);
        if (sendResponse)
            return sendResponse(ZUtils.toErr(error));
    }
};

/**
 * @param sendResponse { (response: any) => void} 
 */
const pOk = (sendResponse: ((response: any) => void)) => () => sendResponse(toOk('ok'));

/**
 * @param duration {number}
 */
const wait = (duration: number) => (args?: any) => new Promise(resolve => setTimeout(() => (resolve(args)), duration));

export default class Tasker {
    private static _instance: Tasker;
    private constructor() {
    }
    public static get Instance() {
        // Do you need arguments? Make it a regular method instead.
        return this._instance || (this._instance = new this());
    }

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
     * close a tab if autoclose if enabled
     *
     * @param {number} tabId - tabId to close
     * @param {number} ms - milliSec to wait before close
     */
    public mayCloseTabIn(tabId: number, ms: number) {
        if (!tabId)
            return /** @type {Promise<string>} */ (Promise.reject('missing tabId'));
        ms = ms || 10000;
        const value = pluginStat.config.closeIrrelevantTabs;
        if (value)
            setTimeout(ZUtils.closeTab, ms, tabId)
        return Promise.resolve('ok'); // wait(ms)().then(() => 'ok');
    };

    /**
 * copy parent tab task to chidlren tab task
 * @param {chrome.tabs.Tab} tab
 * @returns {ZTask|null} todo
 */
    public getTabInformation(tab: chrome.tabs.Tab) {
        const tasker = this;
        if (!tab || !tab.id)
            return null;
        const parentTabId = tab.openerTabId;
        // Get tab info
        let taskParameters = tasker.registedActionTab[tab.id] || null;
        if ((parentTabId || parentTabId === 0) && !taskParameters) {
            taskParameters = tasker.registedActionTab[parentTabId] || null;
            if (taskParameters)
                tasker.registedActionTab[tab.id] = taskParameters;
        }
        return taskParameters;
    };

    /**
     * mapping tablename => chrome.tabs.Tab
     */
    namedTab: { [key: string]: chrome.tabs.Tab } = {};
    // last setted user agent (original data is stored in chrome.storage)
    // events command map
    commands: { [key: string]: (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => any) => Promise<any> } = {
        /**
         * External
         **/
        /**
         * @param {any} request
         * @param {chrome.runtime.MessageSender} sender
         * 
         */
        close: (request, sender, sendResponse) => ZUtils.closeAllTabExept(0)
            .then(pOk(sendResponse), pError(sendResponse, 'close all Tab')),
        /**
         * External Close caller Tab
         */
        closeMe: (request, sender, sendResponse) => {
            let promise;
            if (!sender.tab || !sender.tab.id)
                promise = sendResponse(ZUtils.toErr('sender.tab is missing'));
            else if (request.lazy)
                promise = this.mayCloseTabIn(sender.tab.id, 5000).then(pOk(sendResponse), pError(sendResponse, `lazy close tab ${sender.tab.id}`));
            else
                promise = ZUtils.closeTab(sender.tab.id).then(pOk(sendResponse), pError(sendResponse, `close tab ${sender.tab.id}`));
            // drop Internal.closeMe promise Failure Error: Attempting to use a disconnected port object
            return promise.catch(() => { });
        },
        saveCookies: (request, sender, sendResponse) => {
            this.lastCookiesSave = Date.now();
            // console.log(`lastCookiesSave updated`);
            return Promise.resolve()
                .then(() => sendResponse(toOk('Ok')));
        },

        readQrCode: (request, sender, sendResponse) => {
            /**
             * @type {Promise<any>}
             */
            let promise;
            if (sender.tab && sender.tab.windowId) {
                promise = Promise.resolve(sender.tab.windowId)
            } else {
                promise = chromep.tabs.query({
                    lastFocusedWindow: true
                })
                    .then((tabs: chrome.tabs.Tab[]) => {
                        if (!tabs || !tabs.length)
                            return <Promise<any>>Promise.reject('no lastFocusedWindow, select a tab first');
                        // return /** @type {Promise<number>} */ (Promise.reject('no lastFocusedWindow, select a tab first'))
                        return tabs[0].windowId;
                    })
            }
            return promise.then((windowId) => chromep.tabs.captureVisibleTab(windowId, {
                format: "png"
            }))
                .then((raw) => {
                    if (!raw) {
                        return /** @type {Promise<number>} */ (Promise.reject('error capturing screen'))
                    }
                    const prefix = 'data:image/png;base64,';
                    if (raw.indexOf(prefix) !== 0) {
                        return /** @type {Promise<number>} */ (Promise.reject('error capturing screen'))
                    }
                    const data = raw.substring(prefix.length);
                    const pngBytes = base64js.toByteArray(data);

                    return new Promise((resolve, reject) => {
                        var reader = new PNGReader(pngBytes).parse((error, png) => {
                            if (error) {
                                return reject(sendResponse({
                                    error
                                }));
                            }
                            const qrCodeReader = jsQR(png.pixels, png.width, png.height, {
                                depth: 3
                            });
                            if (!qrCodeReader)
                                return /** @type {Promise<number>} */ (Promise.reject('no QR code'))

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
                            }
                            return resolve(sendResponse([result]));
                        })
                    });
                })
        },

        /**
         * setProxy {scheme, host, port}
         */
        setProxy: (request, sender, sendResponse) => {
            let proxy = '';
            let {
                username,
                password,
                scheme,
                host,
                port
            } = request;
            scheme = scheme || 'http';
            let promise = null;
            if (!host) {
                // disable proxy
                promise = chromep.proxy.settings.clear({
                    scope: 'regular'
                })
                    .then(() => {pluginStat.proxyAuth = undefined; return pluginStat.proxy = 'system';});
            } else {
                // enable proxy
                proxy = `${scheme}://${host}:${port}`;
                promise = chromep.proxy.settings.set({
                    value: {
                        mode: 'fixed_servers',
                        rules: {
                            singleProxy: {
                                scheme,
                                host,
                                port
                            },
                            bypassList: ["<local>", '10.0.0.0/8', '192.168.0.0/16']
                        }
                    },
                    scope: 'regular' // regular_only, incognito_persistent, incognito_session_only
                }).then(() => {
                    if (username && password)
                        pluginStat.proxyAuth = {username, password};
                    return pluginStat.proxy = `${scheme}://${host}:${port}`});
            }
            return promise
                .then(() => chromep.storage.local.set({
                    proxy
                }))
                .then(() => sendResponse(toOk('ok')));
        },
        /**
         */
        preventPrompts: (request, sender, sendResponse) => {
            /**
             * @type {Promise<any>}
             */
            let promise = Promise.resolve();
            if (sender.tab && sender.tab.id) {
                const tabId = sender.tab.id;
                promise = promise
                    .then(() => ZUtils.preventPrompts(tabId))
                    .then(pOk(sendResponse), pError(sendResponse, `preventPrompts Tab:${tabId}`));
            } else
                promise = promise
                    .then(() => sendResponse(ZUtils.toErr('missing tab')))
            return promise;
        },
        /**
         */
        setGeoloc: (request, sender, sendResponse) => {
            /**
             * @type {Promise<any>}
             */
            let promise = Promise.resolve();
            // cast to Coordinates
            const coords = /** @type {Coordinates} */ (request);
            if (coords.latitude && coords.latitude && coords.accuracy) {
                delete request.command;
                promise = chromep.storage.local.set({
                    coords
                }).then(() => {
                    // console.log('Geoloc setted to', coords)
                });
            } else
                promise = chromep.storage.local.remove('coords').then(() => {
                    //console.log('Geoloc Clear')
                });
            return promise.then(pOk(sendResponse));
        },
        /**
         * External
         */
        updateAction: (request, sender, sendResponse) => {
            let promise = Promise.resolve();
            if (!sender.tab || !sender.tab.id)
                return promise.then(pOk(sendResponse));
            const task = Tasker.Instance.registedActionTab[sender.tab.id];
            task.action = request.action;
            return promise.then(pOk(sendResponse))
        },
        /**
         * External
         * @param {registerCommandMessage} request
         */
        registerCommand: (request: registerCommandMessage, sender, sendResponse) => {
            /**
             * @type {chrome.tabs.CreateProperties}
             */
            const params = {
                url: request.url,
                active: request.active || false,
                pinned: request.pinned || false
            };
            if (request.closeIrrelevantTabs === true || request.closeIrrelevantTabs === false) {
                pluginStat.config.closeIrrelevantTabs = request.closeIrrelevantTabs;
            }
            /**
             * @type ZTask
             */
            const task = {
                action: request.action,
                deps: request.deps || [],
                depCss: request.depCss || [],
                target: request.target || ''
            };
            if (!task.action)
                return sendResponse(ZUtils.toErr('action string is missing'));

            let promise: Promise<chrome.tabs.Tab | null> = Promise.resolve(null);

            if (task.target && Tasker.Instance.namedTab[task.target]) {
                const tabOld = Tasker.Instance.namedTab[task.target];
                if (tabOld && tabOld.id)
                    promise = chromep.tabs.update(tabOld.id, params);
            }
            // si pas d'ancien TASK create
            // new TAB
            promise = promise.then((tab: chrome.tabs.Tab | null) => {
                if (tab)
                    return tab
                return chromep.tabs.create(params);
            });
            return promise.then((tab: chrome.tabs.Tab | null) => {
                if (!tab || !tab.id)
                    return;
                Tasker.Instance.registedActionTab[tab.id] = task;
                pluginStat.nbRegistedActionTab = Object.keys(Tasker.Instance.registedActionTab).length;
                if (task.target) {
                    Tasker.Instance.namedTab[task.target] = tab;
                    pluginStat.nbNamedTab = Object.keys(Tasker.Instance.namedTab).length;
                }
                sendResponse(toOk('done'));
            })
        },

        /**
         * External
         */
        deleteCookies: (request, sender, sendResponse) => {
            const {
                domain,
                name
            } = request;
            if (domain || name)
                return zFunction.deleteCookies(domain, name)
                    .then(count => sendResponse(toOk(count)));
            else
                return Promise.resolve().then(() => sendResponse(ZUtils.toErr('missing Domain or cookieName argument')));
        },

        /**
         *
         */
        popCookies: (request, sender, sendResponse) => {
            const {
                domain,
                name
            } = request;
            if (domain || name)
                return zFunction.popCookies(domain, name).then(cookies => sendResponse(toOk(cookies)));
            else
                return Promise.resolve().then(() => sendResponse(ZUtils.toErr('missing Domain or cookieName argument')));
        },
        /**
         *
         */
        getCookies: (request, sender, sendResponse) => {
            const {
                domain,
                name
            } = request;
            if (domain || name)
                return zFunction.getCookies(domain, name).then(cookies => sendResponse(toOk(cookies)));
            else
                return Promise.resolve().then(() => sendResponse(ZUtils.toErr('missing Domain or cookieName argument')));
        },

        /**
         *
         */
        pushCookies: (request, sender, sendResponse) => zFunction.pushCookies(request.cookies)
            .then((r) => {
                Tasker.Instance.lastCookiesSave = Date.now();
                return r;
            })
            .then(pOk(sendResponse), pError(sendResponse, 'pushCookies')),
        putCookies: (request, sender, sendResponse) => zFunction.pushCookies(request.cookies)
            .then((r) => {
                Tasker.Instance.lastCookiesSave = Date.now();
                return r;
            })
            .then(pOk(sendResponse), pError(sendResponse, 'putCookies')),
        /**
         * External
         */
        clean: (request, sender, sendResponse) => {
            const dataTypeSet = {
                appcache: true,
                cache: true,
                downloads: true,
                fileSystems: true,
                formData: true,
                history: true,
                indexedDB: true,
                localStorage: true,
                webSQL: true
            };
            return chromep.browsingData.remove({
                since: 0
            }, dataTypeSet)
                .then(() => '1')
                .then(pOk(sendResponse), pError(sendResponse, 'clean'));
        },
        isOpen: (request, sender, sendResponse) => {
            const target = request.target || request.tab || null;
            let count = '0';
            if (target != null && Tasker.Instance.namedTab[target])
                count = '1';
            return Promise.resolve().then(() => sendResponse(toOk(count)));
        },
        /**
         * Internal
         */
        get: (request, sender, sendResponse) => zFunction.httpGetPromise(request.url)
            .then(r => sendResponse(toOk(r.data)), pError(sendResponse, 'get')),
        /**
         * Remove all cached Script
         */
        flushCache: (request, sender, sendResponse) => zFunction.flush()
            .then(pOk(sendResponse), pError(sendResponse, 'flushCache')),
        /**
         * Internal http POST
         */
        post: (request, sender, sendResponse) => zFunction.postJSON(request.url, request.data)
            .then(response => sendResponse(toOk(response)), pError(sendResponse, `POST ${request.url}`)),

        /**
         *
         */
        storageGet: (request, sender, sendResponse) => chromep.storage.local.get(request.key)
            .then(result => sendResponse(toOk(result[request.key] || request.defaultValue)), pError(sendResponse, `GET ${request.url}`)),

        /**
         */
        storageSet: (request, sender, sendResponse) => chromep.storage.local.set({
            [request.key]: request.value
        })
            .then(pOk(sendResponse), pError(sendResponse, `storageSet ${request.key}`)),

        /**
         */
        storageRemove: (request, sender, sendResponse) => chromep.storage.local.remove(request.key)
            .then(pOk(sendResponse), pError(sendResponse, `storageRemove ${request.key}`)),
        /**
         */
        openExtensionManager: (request, sender, sendResponse) => chromep.tabs.create({
            url: 'chrome://extensions'
        }).then(pOk(sendResponse), pError(sendResponse, 'openExtensionManager')),
        /**
         * Internal
         * @param {any} request
         * @param {chrome.runtime.MessageSender} sender
         * @param {(response: any) => void} sendResponse
         */
        getTodo: (request, sender, sendResponse) => {
            const self = this;
            const tab = sender.tab;
            if (!tab || !tab.id)
                return Promise.resolve();
            const tabId = tab.id;
            const tabInformation = Tasker.Instance.getTabInformation(tab);
            return Promise.resolve(tabInformation)
                .then( /** @var {ZTask} */ tabInformation => {
                    if (!tabInformation) {
                        // mo job for this tabs
                        if (ZUtils.isProtected(tab.url))
                            return;
                        self.mayCloseTabIn(tabId, 10000);
                        sendResponse(toOk('NOOP'));
                        return
                    }
                    const javascriptIncludes = tabInformation.deps || [];
                    let debugText = '// sources:\r\n// ' + ZFunction.flat(javascriptIncludes).join('\r\n// ');

                    // if this tab has parent that we known of
                    // table of parent
                    return zFunction.injectCSS(tabId, tabInformation.depCss)
                        .then(() => zFunction.injectJS(tabId, javascriptIncludes))
                        //.then(() => getConfig('debuggerStatement', false))
                        .then(() => zFunction.injectJavascript(tabId, '\"use strict\";\n' + debugText + '\r\n' + (pluginStat.config.debuggerStatement ? 'debugger;' : '') + tabInformation.action))
                        .then(() => sendResponse(toOk('code injected')), pError(sendResponse, 'injectCSS'))
                        .then(() => { }, (error: any) => {
                            console.log(`code injected Failed, Should refresh/Kill tab:${tabId}`, error);
                            return wait(2500)().then(() => ZUtils.refreshTab(tabId));
                        });
                });
        },
        setUserAgent: (request, sender, sendResponse) => {
            pluginStat.userAgent = request.userAgent;
            return Promise.resolve().then(() => sendResponse(toOk('ok')));
        },
        getConfigs: (request, sender, sendResponse) => {
            return Promise.resolve().then(() => sendResponse({
                ...pluginStat.config,
                lastCookiesUpdate: Tasker.Instance.lastCookiesUpdate,
                lastCookiesSave: Tasker.Instance.lastCookiesSave
            }));
        }
    }
};
