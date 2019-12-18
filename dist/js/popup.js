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
            nbNamedTab: 0,
            memoryCacheSize: 0,
            proxy: '',
            userAgent: '',
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
const common_1 = require("./common");
let rqId = 1;
let port = null;
exports.sendMessage = (message) => {
    const requestId = rqId++;
    const extensionId = chrome.runtime.id;
    let errorCnt = 0;
    const prom = (resolve, reject) => {
        let usedPort = port;
        if (!usedPort) {
            usedPort = chrome.runtime.connect(extensionId);
            usedPort.onDisconnect.addListener(() => port = null);
            port = usedPort;
        }
        const listener = async (response, port) => {
            if (requestId != response.requestId)
                return;
            console.log(`CMD:${message.command} Q: ${requestId} RCV:`, response);
            port.onMessage.removeListener(listener);
            if (response.error) {
                if (++errorCnt > 3) {
                    debugger;
                    await common_1.wait(500);
                    prom(resolve, reject);
                }
                else {
                    reject(Error(response.error));
                }
            }
            else {
                resolve(response.data);
            }
        };
        usedPort.onMessage.addListener(listener);
        try {
            usedPort.postMessage({ requestId, data: message });
        }
        catch (e) {
            if (e.message == 'Attempting to use a disconnected port object') {
                if (usedPort === port)
                    port = null;
                setTimeout(prom, 100, resolve, reject);
            }
        }
    };
    return new Promise(prom);
};
exports.default = exports.sendMessage;

},{"./common":3}],3:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wait = (duration) => new Promise(resolve => setTimeout(() => (resolve()), duration));

},{}],4:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const PluginStat_1 = __importDefault(require("./PluginStat"));
const SendMessage_1 = __importDefault(require("./SendMessage"));
$(() => {
    let bg;
    if (chrome.extension)
        bg = (chrome.extension.getBackgroundPage());
    const pluginStat = (bg && bg.pluginStat) ? bg.pluginStat : PluginStat_1.default();
    let lastCode = 'N/A';
    const updateDisplay = () => {
        const data = {
            tasker_nbRegistedActionTab: pluginStat.nbRegistedActionTab,
            tasker_nbNamedTab: pluginStat.nbNamedTab,
            zFunction_memoryCacheSize: pluginStat.memoryCacheSize,
            tasker_proxy: pluginStat.proxy,
            config_userAgent: pluginStat.userAgent,
            code: lastCode,
            version: 'v' + chrome.runtime.getManifest().version,
        };
        for (const key of Object.keys(data))
            $(`#${key}`).text(data[key]);
    };
    $('#closeIrrelevantTabs').prop('checked', pluginStat.config.closeIrrelevantTabs).bootstrapToggle({
        on: '💣',
        off: 'off',
        onstyle: 'danger',
        offstyle: 'secondary',
        size: 'sm',
    });
    $('#debuggerStatement').prop('checked', pluginStat.config.debuggerStatement).bootstrapToggle({
        on: '🐛',
        off: 'off',
        onstyle: 'danger',
        offstyle: 'secondary',
        size: 'sm',
    });
    $('#pauseProcess').prop('checked', pluginStat.config.pauseProcess).bootstrapToggle({
        off: '<svg style="width:24px;height:24px" viewBox="0 0 24 24"><path fill="#FFF" d="M8,5.14V19.14L19,12.14L8,5.14Z"/></svg>',
        on: '💤',
        size: 'sm',
        onstyle: 'danger',
        offstyle: 'success',
    });
    $('#injectProcess').prop('checked', pluginStat.config.injectProcess).bootstrapToggle({
        on: 'on',
        off: '🛑',
        onstyle: 'primary',
        offstyle: 'secondary',
        size: 'sm',
    });
    $('#noClose').prop('checked', pluginStat.config.noClose).bootstrapToggle({
        on: '🛡️',
        off: 'off',
        onstyle: 'danger',
        offstyle: 'secondary',
        size: 'sm',
    });
    for (const elm of ['closeIrrelevantTabs', 'debuggerStatement', 'pauseProcess', 'injectProcess', 'noClose']) {
        const jq = $(`#${elm}`);
        jq.on('change', function () {
            const value = $(this).is(':checked');
            pluginStat.config[elm] = value;
            SendMessage_1.default({
                command: 'updateBadge',
            });
        });
    }
    updateDisplay();
    const flushCache = () => {
        SendMessage_1.default({
            command: 'flushCache',
        });
    };
    const flushProxy = () => {
        SendMessage_1.default({
            command: 'setProxy',
        });
    };
    const readQrCode = () => {
        SendMessage_1.default({
            command: 'readQrCode',
        }).then((result) => {
            console.log(result);
            if (result.error)
                lastCode = 'error:' + JSON.stringify(result.error);
            else
                lastCode = result[0].text;
            updateDisplay();
        });
    };
    $('button[action="flushCache"]').on('click', flushCache);
    $('button[action="flushProxy"]').on('click', flushProxy);
    $('button[action="readQrCode"]').on('click', readQrCode);
    $('button[action="log"]').on('click', () => {
        console.log(pluginStat);
    });
});

},{"./PluginStat":1,"./SendMessage":2}]},{},[4]);
