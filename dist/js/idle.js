(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
            promFilled(requestId, message)(resolve, reject);
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
            promFilled(requestId, message)(resolve, reject);
        }
    }
};
let rqId = 1;
exports.sendMessage = (message) => {
    let next = rqId++;
    return new Promise(promFilled(next, message));
};
exports.default = exports.sendMessage;

},{"./common":2}],2:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wait = (duration) => new Promise(resolve => setTimeout(() => (resolve()), duration));

},{}],3:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chrome_promise_1 = __importDefault(require("../vendor/chrome-promise"));
const SendMessage_1 = __importDefault(require("./SendMessage"));
const common_1 = require("./common");
const getAnticaptchaClientKey = async () => {
    const chromep = new chrome_promise_1.default();
    const captchcaOption = await chromep.storage.local.get('AnticaptchaKey');
    if (!captchcaOption.AnticaptchaKey)
        return '';
    let anticaptchaClientKey = captchcaOption.AnticaptchaKey;
    return anticaptchaClientKey;
};
const getWebsiteKey = (url) => {
    const url2 = new URL(url);
    const websiteKey = url2.searchParams.get('k');
    return websiteKey;
};
(async function () {
    if (document.URL && document.URL.startsWith('https://www.google.com/recaptcha/api2/anchor')) {
        const tokebnElm = document.getElementById('recaptcha-token');
        if (tokebnElm && tokebnElm.value) {
            const websiteKey = getWebsiteKey(document.URL);
            let token = tokebnElm.value;
            const key = `recap_${websiteKey}`;
            await SendMessage_1.default({
                command: 'storageSet',
                key,
                value: token,
            });
            while (token) {
                await common_1.wait(1000);
                token = await SendMessage_1.default({
                    command: 'storageGet',
                    key,
                });
            }
            while (!token) {
                await common_1.wait(5000);
                console.log('consumed');
            }
        }
        return;
    }
    await common_1.wait(1000);
    const captchaBoxs = $('iframe[src^="https://www.google.com/recaptcha/api2/anchor"]');
    if (captchaBoxs.length === 1) {
        const websiteKey = getWebsiteKey(captchaBoxs.attr('src'));
        const key = `recap_${websiteKey}`;
        let token = '';
        await common_1.wait(1000);
        while (!token) {
            await common_1.wait(1000);
            token = await SendMessage_1.default({
                command: 'storageGet',
                key,
            });
        }
        await SendMessage_1.default({
            command: 'storageRemove',
            key: key,
        });
        const proxyData = await SendMessage_1.default({
            command: 'getProxy'
        });
        const proxy = proxyData.proxy;
        const auth = proxyData.auth;
        if (!proxy || !auth)
            return;
        if (proxy == 'fixed_servers')
            return;
        const { username, password } = JSON.parse(auth);
        if (!proxy.startsWith('http')) {
            console.error('unknown proxy');
            return;
        }
        const purl = new URL(proxy);
        const websiteURL = document.URL;
        if (purl.port === '29393')
            return;
        let anticaptchaClientKey = await getAnticaptchaClientKey();
        if (!anticaptchaClientKey)
            return;
        const task = {
            clientKey: anticaptchaClientKey,
            task: {
                type: 'NoCaptchaTask',
                websiteURL,
                websiteKey,
                proxyType: purl.protocol.replace(':', ''),
                proxyAddress: purl.hostname,
                proxyPort: purl.port,
                proxyLogin: username,
                proxyPassword: password,
                userAgent: navigator.userAgent,
            },
            softId: 0,
            languagePool: 'en'
        };
        const createTask = 'http://api.anti-captcha.com/createTask';
        const getTaskResult = 'https://api.anti-captcha.com/getTaskResult';
        const result = (await SendMessage_1.default({ command: 'post', url: createTask, data: task }));
        if (result.errorId) {
            console.log(`createTask retyurn error: ${JSON.stringify(result)}`);
            return;
        }
        console.log(`wait 10 sec for resolution check TaskID:${result.taskId}`);
        await common_1.wait(10000);
        let resolved = false;
        while (!resolved) {
            const result2 = await SendMessage_1.default({
                command: 'post', url: getTaskResult, data: {
                    clientKey: anticaptchaClientKey,
                    taskId: result.taskId
                }
            });
            console.log(result2);
            while (result2.status == 'ready' && result2.solution && result2.solution.gRecaptchaResponse) {
                const gRecaptchaResponse = document.getElementById("g-recaptcha-response");
                if (gRecaptchaResponse) {
                    $(gRecaptchaResponse).show();
                    gRecaptchaResponse.innerHTML = result2.solution.gRecaptchaResponse;
                }
                await common_1.wait(6000);
            }
            await common_1.wait(5000);
        }
    }
})();

},{"../vendor/chrome-promise":4,"./SendMessage":1,"./common":2}],4:[function(require,module,exports){
/*!
 * chrome-promise
 * https://github.com/tfoxy/chrome-promise
 *
 * Copyright 2015 Tomás Fox
 * Released under the MIT license
 */

(function(root, factory) {
    if (typeof exports === 'object') {
      // Node. Does not work with strict CommonJS, but
      // only CommonJS-like environments that support module.exports,
      // like Node.
      module.exports = factory(this || root);
    } else if (typeof define === 'function' && define.amd) {
      // AMD. Register as an anonymous module.
      define([], factory.bind(null, this || root));
    } else {
      // Browser globals (root is window)
      root.ChromePromise = factory(root);
      var script = document.currentScript;
      if (script) {
        var name = script.dataset.instance;
        if (name) {
          root[name] = new root.ChromePromise();
        }
      }
    }
  }(typeof self !== 'undefined' ? self : this, function(root) {
    'use strict';
    var slice = Array.prototype.slice,
        hasOwnProperty = Object.prototype.hasOwnProperty;
  
    // Temporary hacky fix to make TypeScript `import` work
    ChromePromise.default = ChromePromise;
  
    return ChromePromise;
  
    ////////////////
  
    function ChromePromise(options) {
      options = options || {};
      var chrome = options.chrome || root.chrome;
      var Promise = options.Promise || root.Promise;
      var runtime = chrome.runtime;
      var self = this;
      if (!self) throw new Error('ChromePromise must be called with new keyword');
  
      fillProperties(chrome, self);
  
      if (chrome.permissions) {
        chrome.permissions.onAdded.addListener(permissionsAddedListener);
      }
  
      ////////////////
  
      function setPromiseFunction(fn, thisArg) {
  
        return function() {
          var args = slice.call(arguments);
  
          return new Promise(function(resolve, reject) {
            args.push(callback);
  
            fn.apply(thisArg, args);
  
            function callback() {
              var err = runtime.lastError;
              var results = slice.call(arguments);
              if (err) {
                /**
                 * @type {String}
                 */
                let errorTxt = err.message
                if (!errorTxt)
                  errorTxt = JSON.stringify(err)
                if (~errorTxt.indexOf('MAX_WRITE_OPERATIONS_PER_MINUTE')) {
                  // This request exceeds the MAX_WRITE_OPERATIONS_PER_MINUTE quota.
                  console.log(`Quota Error ${errorTxt} Retry in 2 Sec`);
                  setTimeout(() => {fn.apply(thisArg, args);}, 2000);
                  return;
                }
                if (~errorTxt.indexOf('MAX_WRITE_OPERATIONS_PER_HOUR')) {
                  // This request exceeds the MAX_WRITE_OPERATIONS_PER_HOUR quota.
                  console.log(`Quota Error ${errorTxt} Retry in 60 Sec`);
                  setTimeout(() => {fn.apply(thisArg, args);}, 60000);
                  return;
                }
                reject(Error(errorTxt));
              } else {
                  switch (results.length) {
                  case 0:
                    resolve();
                    break;
                  case 1:
                    resolve(results[0]);
                    break;
                  default:
                    resolve(results);
                }
              }
            }
          });
  
        };
  
      }
  
      function fillProperties(source, target) {
        for (const key in source) {
          if (hasOwnProperty.call(source, key)) {
            let val;
            // Sometime around Chrome v71, certain deprecated methods on the
            // extension APIs started using proxies to throw an error if the
            // deprecated methods were accessed, regardless of whether they
            // were invoked or not.  That would cause this code to throw, even
            // if no one was actually invoking that method.
            try {
              val = source[key];
            } catch(err) {
             continue;
            }
            var type = typeof val;
  
            if (type === 'object' && !(val instanceof ChromePromise)) {
              target[key] = {};
              fillProperties(val, target[key]);
            } else if (type === 'function') {
              target[key] = setPromiseFunction(val, source);
            } else {
              target[key] = val;
            }
          }
        }
      }
  
      function permissionsAddedListener(perms) {
        if (perms.permissions && perms.permissions.length) {
          var approvedPerms = {};
          perms.permissions.forEach(function(permission) {
            var api = /^[^.]+/.exec(permission);
            if (api in chrome) {
              approvedPerms[api] = chrome[api];
            }
          });
          fillProperties(approvedPerms, self);
        }
      }
    }
  }));
  
},{}]},{},[3]);
