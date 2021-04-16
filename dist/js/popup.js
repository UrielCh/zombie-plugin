(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function value() {
    const old = window.pluginStat;
    if (!old) {
        const stats = {
            config: {
                closeIrrelevantTabs: false,
                debuggerStatement: false,
                pauseProcess: false,
                injectProcess: true,
                noClose: false,
                proxyAuth: ''
            },
            nbRegistedActionTab: 0,
            nbNamedTab: '0/0',
            memoryCacheSize: 0,
            proxy: '',
            userAgent: '',
            anticaptchaClientKey: '',
        };
        window.pluginStat = stats;
        return stats;
    }
    return old;
}
exports.default = value;

},{}],2:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = void 0;
const common_1 = require("./common");
const extensionId = chrome.runtime.id;
let port = null;
const callbacks = {};
const msgListener = async (response) => {
    const callback = callbacks[response.requestId];
    if (!callback)
        return;
    const { message, resolve, reject } = callback;
    const { requestId, error } = response;
    if (error) {
        if (++callback.retries > 3) {
            debugger;
            await common_1.wait(500);
            promFilled(requestId, message)(resolve, reject).finally(() => { });
        }
        else {
            delete callbacks[response.requestId];
            callback.reject(Error(error));
        }
    }
    else {
        delete callbacks[requestId];
        callback.resolve(response.data);
    }
};
const promFilled = (requestId, message) => async (resolve, reject) => {
    let usedPort = port;
    if (!usedPort) {
        usedPort = chrome.runtime.connect(extensionId);
        usedPort.onDisconnect.addListener(() => port = null);
        usedPort.onMessage.addListener(msgListener);
        port = usedPort;
    }
    try {
        callbacks[requestId] = { resolve, reject, message, retries: 0 };
        usedPort.postMessage({ requestId, data: message });
    }
    catch (e) {
        if (e.message == 'Attempting to use a disconnected port object') {
            console.error('Plugin connexion Error. (may be inf-loop.)');
            if (usedPort === port)
                port = null;
            await common_1.wait(150);
            promFilled(requestId, message)(resolve, reject).finally(() => { });
        }
    }
};
let rqId = 1;
exports.sendMessage = (message) => {
    const next = rqId++;
    return new Promise(promFilled(next, message));
};
exports.default = exports.sendMessage;

},{"./common":3}],3:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wait = void 0;
exports.wait = (duration) => new Promise(resolve => { setTimeout(() => (resolve(undefined)), duration); });

},{}],4:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const PluginStat_1 = __importDefault(require("./PluginStat"));
const SendMessage_1 = __importDefault(require("./SendMessage"));
jQuery(async () => {
    let bg;
    if (chrome.extension)
        bg = (chrome.extension.getBackgroundPage());
    const pluginStat = (bg && bg.pluginStat) ? bg.pluginStat : PluginStat_1.default();
    let proxyInfo;
    let lastCode = 'N/A';
    const updateDisplay = () => {
        let tasker_proxy = '';
        if (proxyInfo.proxy)
            tasker_proxy = proxyInfo.proxy;
        if (proxyInfo.auth)
            tasker_proxy += '<br>' + proxyInfo.auth;
        const data = {
            tasker_nbRegistedActionTab: pluginStat.nbRegistedActionTab,
            tasker_nbNamedTab: pluginStat.nbNamedTab,
            zFunction_memoryCacheSize: pluginStat.memoryCacheSize,
            tasker_proxy,
            config_userAgent: pluginStat.userAgent,
            code: lastCode,
            version: 'v' + chrome.runtime.getManifest().version,
        };
        for (const key of Object.keys(data)) {
            jQuery(`#${key}`).text(data[key]);
        }
    };
    async function reloadConfig() {
        proxyInfo = await SendMessage_1.default({
            command: 'getProxy',
        });
        updateDisplay();
    }
    await reloadConfig();
    jQuery('#closeIrrelevantTabs').prop('checked', pluginStat.config.closeIrrelevantTabs).bootstrapToggle({
        on: '💣',
        off: 'off',
        onstyle: 'danger',
        offstyle: 'secondary',
        size: 'sm',
    });
    jQuery('#debuggerStatement').prop('checked', pluginStat.config.debuggerStatement).bootstrapToggle({
        on: '🐛',
        off: 'off',
        onstyle: 'danger',
        offstyle: 'secondary',
        size: 'sm',
    });
    jQuery('#pauseProcess').prop('checked', pluginStat.config.pauseProcess).bootstrapToggle({
        off: '<svg style="width:24px;height:24px" viewBox="0 0 24 24"><path fill="#FFF" d="M8,5.14V19.14L19,12.14L8,5.14Z"/></svg>',
        on: '💤',
        size: 'sm',
        onstyle: 'danger',
        offstyle: 'success',
    });
    jQuery('#injectProcess').prop('checked', pluginStat.config.injectProcess).bootstrapToggle({
        on: 'on',
        off: '🛑',
        onstyle: 'primary',
        offstyle: 'secondary',
        size: 'sm',
    });
    jQuery('#noClose').prop('checked', pluginStat.config.noClose).bootstrapToggle({
        on: '🛡️',
        off: 'off',
        onstyle: 'danger',
        offstyle: 'secondary',
        size: 'sm',
    });
    for (const elm of ['closeIrrelevantTabs', 'debuggerStatement', 'pauseProcess', 'injectProcess', 'noClose']) {
        const jq = jQuery(`#${elm}`);
        jq.on('change', function () {
            const value = jQuery(this).is(':checked');
            pluginStat.config[elm] = value;
            SendMessage_1.default({
                command: 'updateBadge',
            }).finally(() => { });
        });
    }
    updateDisplay();
    const flushCache = async () => {
        await SendMessage_1.default({
            command: 'flushCache',
        });
        updateDisplay();
    };
    const flushProxy = async () => {
        await SendMessage_1.default({
            command: 'setProxy',
        });
        await reloadConfig();
    };
    const readQrCode = async () => {
        const result = await SendMessage_1.default({
            command: 'readQrCode',
        });
        console.log(result);
        if (result.error)
            lastCode = 'error:' + JSON.stringify(result.error);
        else
            lastCode = result[0].text;
        updateDisplay();
    };
    jQuery('button[action="flushCache"]').on('click', flushCache);
    jQuery('button[action="flushProxy"]').on('click', flushProxy);
    jQuery('button[action="readQrCode"]').on('click', readQrCode);
    jQuery('button[action="log"]').on('click', () => {
        console.log(pluginStat);
    });
});

},{"./PluginStat":1,"./SendMessage":2}]},{},[4]);
