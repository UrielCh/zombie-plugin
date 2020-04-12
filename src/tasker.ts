import ChromePromise from '../vendor/chrome-promise';
import jsQR from '../vendor/jsqr';
import PluginStat from './PluginStat';
import ZFunction from './zFunction';
import ZUtils from './zUtils';
import { wait } from './common';
// eslint-disable-next-line no-unused-vars
import { PluginStatValue } from './interfaces';
// import { all } from 'bluebird';

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
    mergeInject?: boolean;
    target: string;
}

const zFunction = ZFunction.Instance;

const chromep = new ChromePromise();
const pluginStat: PluginStatValue = PluginStat();

// to promis Keeping this
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
    public updateBadge() {

        let cnt = 0;
        Object.values(this.namedTab).forEach(t => cnt += t.length);
        pluginStat.nbNamedTab = cnt;

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
            chrome.browserAction.setBadgeText({ text: String(Object.keys(this.namedTab).length) });
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
    public namedTab: { [key: string]: chrome.tabs.Tab[] } = {};

    private constructor() {
    }

    public static get Instance() {
        // Do you need arguments? Make it a regular method instead.
        return this._instance || (this._instance = new this());
    }

    /**
     * close a tab if autoclose if enabled
     *
     * @param tabId - tabId to close
     * @param ms - milliSec to wait before close
     */
    public async mayCloseTabIn(this: Tasker, tabId: number, ms: number) {
        if (!tabId)
            throw Error('missing tabId');
        ms = ms || 10000;
        if (pluginStat.config.closeIrrelevantTabs) {
            console.log(`Will Close tab ${tabId} in ${ms} ms`);
            await wait(ms);
            const tab = await chromep.tabs.get(tabId);
            if (tab) {
                const tabInformation = this.getTabInformation(tab);
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
     */
    public getTabInformation(this: Tasker, tab: chrome.tabs.Tab): ZTask | null {
        if (!tab || !tab.id)
            return null;
        const parentTabId = tab.openerTabId;
        // Get tab info
        let task = this.registedActionTab[tab.id];
        if ((parentTabId || parentTabId === 0) && !task) {
            task = this.registedActionTab[parentTabId];
            if (task) {
                this.registedActionTab[tab.id] = task;
                if (task.target) {
                    this.namedTab[task.target].push(tab);
                    this.updateBadge();
                }
            }
        }
        return task || null;
    }

    // last setted user agent (original data is stored in chrome.storage)
    // events command map
    private debuggerTabId: number = 0;

    public commands: { [key: string]: (this: Tasker, message: any, sender: chrome.runtime.MessageSender | undefined, sendResponse: (response: any) => any) => Promise<any> } = {

        updateBadge: (request, sender, sendResponse) => {
            this.updateBadge();
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

            if (sender.tab.id !== this.debuggerTabId) {
                if (this.debuggerTabId)
                    await chrome_debugger_detach({ tabId: this.debuggerTabId });
                await chrome_debugger_attach({ tabId }, '1.3');
                this.debuggerTabId = tabId;
            }
            console.log({ target: { tabId }, method, commandParams });
            await chrome_debugger_sendCommand({ tabId }, method, commandParams);
            sendResponse('ok');
        },
        /**
         * External
         */

        /**
         */
        close: async (request, sender, sendResponse) => {
            if (pluginStat.config.noClose) {
                sendResponse('ok');
                return true;
            }
            await ZUtils.closeAllTabExept(0);
            sendResponse('ok');
        },
        /**
         * External Close caller Tab
         */
        closeMe: async (request, sender, sendResponse) => {
            if (pluginStat.config.noClose) {
                sendResponse('ok');
                return true;
            }
            if (!sender || !sender.tab || !sender.tab.id) {
                throw Error('sender.tab is missing');
            }
            if (request.lazy) {
                await this.mayCloseTabIn(sender.tab.id, 5001);
                sendResponse('ok');
            } else {
                await ZUtils.closeTab(sender.tab.id);
                sendResponse('ok');
            }
            // drop Internal.closeMe promise Failure Error: Attempting to use a disconnected port object
        },

        /**
         */
        preventPrompts: async (request, sender, sendResponse) => {
            if (sender && sender.tab && sender.tab.id) {
                const tabId = sender.tab.id;
                await ZUtils.preventPrompts(tabId);
                sendResponse('ok');
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
            if (task.target && this.namedTab[task.target]) {
                let tabOlds = this.namedTab[task.target].filter((tab: chrome.tabs.Tab) => tab.id);
                if (tabOlds.length)
                    tab = await chromep.tabs.update(tabOlds[0].id as number, params);
                for (let i = 1; i < tabOlds.length; i++) {
                    ZUtils.closeTab(tabOlds[i].id);
                }
            }
            // if no previous task's tab create a new tab
            if (!tab)
                tab = await chromep.tabs.create(params);

            if (!tab || !tab.id)
                return;
            this.registedActionTab[tab.id] = task;
            pluginStat.nbRegistedActionTab = Object.keys(this.registedActionTab).length;
            if (task.target) {
                this.namedTab[task.target] = [ tab ];
                this.updateBadge();
            }
            sendResponse('done');
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
            sendResponse('ok');
        },

        /**
         * setBlockedDomains {domains:[dom1, dom2 ...]}
         */
        setBlockedDomains: async (request, sender, sendResponse) => {
            const { domains } = request;
            this.blockedDomains = domains;
            return sendResponse('updated');
        },

        getParentUrl: async (request, sender, sendResponse) => {
            if (sender && sender.tab) {
                const curentFrameId = sender.frameId as number;
                const tabId = sender.tab.id as number;
                // const frame = await chromep.webNavigation.getFrame({ frameId, tabId });
                const allFrames = await chromep.webNavigation.getAllFrames({ tabId });
                if (allFrames) {
                    const [current] = allFrames.filter(({frameId})=> frameId === curentFrameId);
                    if (!current)
                        throw Error('can not find caller frame');
                    const {parentFrameId} = current;
                    if (!parentFrameId) 
                        return sendResponse(current.url);
                    const [parent] = allFrames.filter(({frameId})=> frameId === parentFrameId);
                    if (!parent) 
                        throw Error('can not find caller parent frame');
                    return sendResponse(parent.url);
                }
            }
        },

        getProxy: async (request, sender, sendResponse) => {
            const proxyAuth: string = pluginStat.config.proxyAuth;
            let proxy: string = '';
            const proxySettings = await chromep.proxy.settings.get({});
            const { value } = proxySettings;
            // eslint-disable-next-line no-debugger
            if (value && value.rules && value.rules.singleProxy) {
                const {host, port, scheme} = value.rules.singleProxy;
                proxy = `${scheme}://${host}:${port}`;
            } else if (value.mode) {
                proxy = value.mode;
                if (proxy !== 'system') {
                    console.log('Non System proxy double check:', proxySettings);
                }
            } else {
                proxy = 'none'; // pluginStat.proxy;
            }
            // console.log(proxySettings);
            if (proxy) {
                sendResponse({ proxy, auth: proxyAuth });
            } else {
                sendResponse({});
            }
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
                // pluginStat.proxy = 'system';
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
                // pluginStat.proxy = `${scheme}://${host}:${port}`;
            }
            await chromep.storage.local.set({ proxy });
            sendResponse('ok');
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
            return sendResponse('ok');
        },
        /**
         * sendMessage({ command: 'setAnticaptchaKey', key: '123456789012345678901234567890123' });
         */
        setAnticaptchaKey: async (request, sender, sendResponse) => {
            const key = request.key as string;
            if (key && key.length === 32) {
                delete request.command;
                await chromep.storage.local.set({ AnticaptchaKey: key });
            } else if (key === '') {
                await chromep.storage.local.remove('AnticaptchaKey');
            } else {
                throw Error('key must be a 32 char long string');
            }
            return sendResponse('ok');
        },
        /**
         * External
         */
        updateAction: async (request, sender, sendResponse) => {
            if (!sender || !sender.tab || !sender.tab.id)
                return sendResponse('ok');
            if (typeof request.action === 'undefined')
                throw Error('updateAction must contains action parameter');
            const task = this.registedActionTab[sender.tab.id];
            task.action = request.action;
            return sendResponse('ok');
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
                const count = await zFunction.deleteCookies({ domain, name });
                sendResponse(count);
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
                sendResponse(cookies);
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
                sendResponse(cookies);
            } else
                throw Error('Missing "domain" or "name" argument as regexp.');
        },

        /**
         *
         */
        pushCookies: async (request, sender, sendResponse) => {
            await zFunction.pushCookies(request.cookies);
            this.lastCookiesSave = Date.now();
            sendResponse('ok');
        },
        /**
         * Deprecated
         */
        putCookies: async (request, sender, sendResponse) => {
            await zFunction.pushCookies(request.cookies);
            this.lastCookiesSave = Date.now();
            sendResponse('ok');
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
            sendResponse(1);

        },
        
        isOpen: async (request, sender, sendResponse) => {
            const target = request.target || request.tab || null;
            let count = '0';
            if (target != null && this.namedTab[target])
                count = '1';
            sendResponse(count);
        },
        /**
         * Remove all cached Script
         */
        flushCache: async (request, sender, sendResponse) => {
            await zFunction.flush();
            sendResponse('ok');
        },
        /**
         * Internal http POST
         */
        post: async (request, sender: chrome.runtime.MessageSender | undefined, sendResponse) => {
            // todo improve error message
            const response = await zFunction.postJSON(request.url, request.data);
            sendResponse(response);
        },

        /**
         * Internal http POST
         */
        put: async (request, sender: chrome.runtime.MessageSender | undefined, sendResponse) => {
            // todo improve error message
            const response = await zFunction.putJSON(request.url, request.data);
            sendResponse(response);
        },

        /**
         * Internal http POST
         */
        delete: async (request, sender: chrome.runtime.MessageSender | undefined, sendResponse) => {
            const r = await zFunction.deleteHttp(request.url);
            sendResponse(r);
        },

        /**
         * Internal
         */
        get: async (request, sender, sendResponse) => {
            // const r = await zFunction.httpGetPromise(request.url); + ret r.data
            const r = await zFunction.getHttp(request.url);
            sendResponse(r);
        },

        /**
         *
         */
        storageGet: async (request, sender: chrome.runtime.MessageSender | undefined, sendResponse) => {
            // todo improve error message
            const result = await chromep.storage.local.get(request.key);
            sendResponse(result[request.key] || request.defaultValue);
        },

        /**
         */
        storageSet: async (request, sender: chrome.runtime.MessageSender | undefined, sendResponse) => {
            await chromep.storage.local.set({
                [request.key]: request.value
            });
            sendResponse('ok');
        },
        /**
         */
        storageRemove: async (request, sender: chrome.runtime.MessageSender | undefined, sendResponse) => {
            await chromep.storage.local.remove(request.key);
            sendResponse('ok');
        },
        /**
         */
        openExtensionManager: async (request, sender: chrome.runtime.MessageSender | undefined, sendResponse) => {
            await chromep.tabs.create({
                url: 'chrome://extensions'
            });
            sendResponse('ok');
        },
        /**
         * Internal
         */
        getTodo: async (request, sender: chrome.runtime.MessageSender | undefined, sendResponse) => {
            if (!sender)
                return;
            const tab = sender.tab;
            if (!tab || !tab.id)
                return;
            if (!pluginStat.config.injectProcess)
                return;
            const tabId = tab.id;
            const tabInformation = this.getTabInformation(tab);
            //try {
            if (!tabInformation) {
                // mo job for this tabs
                if (ZUtils.isProtected(tab.url))
                    return;
                await this.mayCloseTabIn(tabId, 10002);
                sendResponse('NOOP');
                return;
            }
            const javascriptIncludes = tabInformation.deps || [];
            const debugText = '// sources:\r\n// ' + ZFunction.flat(javascriptIncludes).join('\r\n// ');
            // if this tab has parent that we known of
            // table of parent
            await zFunction.injectCSS(tabId, tabInformation.depCss);
            const jsBootstrap = '"use strict";\n' + debugText + '\r\n' + (pluginStat.config.debuggerStatement ? 'debugger;' : '') + tabInformation.action;
            await zFunction.injectJS(tabId, javascriptIncludes, jsBootstrap, tabInformation.mergeInject);
            sendResponse('code injected');
        },

        setUserAgent: async (request, sender, sendResponse) => {
            pluginStat.userAgent = request.userAgent;
            sendResponse('ok');
        },
        
        getConfigs: async (request, sender, sendResponse) => {
            sendResponse({
                ...pluginStat.config,
                lastCookiesSave: this.lastCookiesSave,
                lastCookiesUpdate: this.lastCookiesUpdate
            });
        }
    };
}
