(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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
            void promFilled(requestId, message)(resolve, reject);
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
            void promFilled(requestId, message)(resolve, reject);
        }
    }
};
let rqId = 1;
exports.sendMessage = (message) => {
    const next = rqId++;
    return new Promise(promFilled(next, message));
};
exports.default = exports.sendMessage;

},{"./common":3}],2:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const SendMessage_1 = __importDefault(require("./SendMessage"));
const common_1 = require("./common");
const zone = document.getElementById('tasker_id_loader');
if (zone)
    zone.innerHTML = chrome.runtime.id;
const isProtected = (url) => {
    if (!url)
        return false;
    return (~url.indexOf('chrome://')) || (~url.indexOf('127.0.0.1')) || (~url.indexOf('localhost')) || (~url.indexOf('.exs.fr'));
};
function execute(code) {
    try {
        code = code.replace('//# sourceMappingURL=', '//');
        code = code.replace(/import\s+[0-9A-Za-z_-]+\s+from\s+['"][./0-9A-Za-z_-]+['"]\s*;?/g, '');
        eval(code);
    }
    catch (e) {
        console.error('clent.js eval throws:', e);
        return false;
    }
    return true;
}
const injectScript = async (func, params) => {
    const script = document.createElement('script');
    if (typeof (func) === 'function')
        script.innerHTML = '(' + func.toString() + ')(' + (params ? params.map((o) => JSON.stringify(o)).join(', ') : '') + ');';
    else if (typeof (func) === 'string')
        script.innerHTML = func;
    script.addEventListener('load', () => document.documentElement.removeChild(script), true);
    const parent = (document.head || document.body || document.documentElement);
    const firstChild = (parent.childNodes && (parent.childNodes.length > 0)) ? parent.childNodes[0] : null;
    parent.insertBefore(script, firstChild || null);
    return true;
};
const originalGeolocation = {
    getCurrentPosition: navigator.geolocation.getCurrentPosition,
    watchPosition: navigator.geolocation.watchPosition,
    clearWatch: navigator.geolocation.clearWatch,
};
function installGeolocationCode(coords) {
    const myGetPos = (successCallback) => {
        if (!coords)
            return originalGeolocation.getCurrentPosition;
        successCallback({ coords, timestamp: new Date().getTime() });
    };
    navigator.geolocation.getCurrentPosition = myGetPos;
    let timerId = 0;
    navigator.geolocation.watchPosition = (successCallback, errorCallback, options) => {
        window.clearInterval(timerId);
        return (timerId = window.setInterval(myGetPos, 5 * 1000, successCallback, errorCallback, options));
    };
    navigator.geolocation.clearWatch = () => window.clearInterval(timerId);
}
if (document.documentElement.tagName.toLowerCase() === 'html')
    chrome.storage.local.get({ coords: null }, (data) => {
        const { coords } = data;
        if (coords)
            void injectScript(installGeolocationCode, [coords]);
    });
async function startPluginCode() {
    try {
        const reWait = 0;
        if (reWait)
            await common_1.wait(reWait);
        const data = await SendMessage_1.default({ command: 'getTodo' });
        if (!data) {
            if (isProtected(window.location.href))
                return false;
            console.log(`Data is missing from getTodo ${window.location.href} I may close this tab`);
            try {
                await SendMessage_1.default({ command: 'closeMe', lazy: true, reason: 'data is missing from getTodo' });
            }
            catch (e) { }
            return true;
        }
        if (data.error) {
            console.error(`Bootstraping Retunr Error: ${data.error}`);
            return true;
        }
        if (data === 'code injected' || data === 'NOOP' || !data.task)
            return true;
        const task = data.task;
        if (!task)
            return false;
        if (!task.deps)
            task.deps = [];
        const virtualScript = [];
        for (const dep of task.deps) {
            console.log('inject ', dep);
            const data2 = await fetch(dep, { method: 'GET' }).then((response) => response.text());
            virtualScript.push(data2);
        }
        return execute(virtualScript.join('\r\n'));
    }
    catch (error) {
        console.error(error);
    }
}
void startPluginCode();

},{"./SendMessage":1,"./common":3}],3:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wait = void 0;
exports.wait = (duration) => new Promise(resolve => { setTimeout(() => (resolve()), duration); });

},{}]},{},[2]);
