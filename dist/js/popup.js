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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chrome_promise_1 = __importDefault(require("../vendor/chrome-promise"));
const PluginStat_1 = __importDefault(require("./PluginStat"));
$(() => {
    const chromep = new chrome_promise_1.default();
    let lastCode = 'N/A';
    const updateDisplay = () => {
        let data = {
            tasker_nbRegistedActionTab: pluginStat.nbRegistedActionTab,
            tasker_nbNamedTab: pluginStat.nbNamedTab,
            zFunction_memoryCacheSize: pluginStat.memoryCacheSize,
            tasker_proxy: pluginStat.proxy,
            config_userAgent: pluginStat.userAgent,
            code: lastCode,
        };
        for (const key of Object.keys(data)) {
            $(`#${key}`).text(data[key]);
        }
    };
    let bg;
    if (chrome.extension) {
        bg = (chrome.extension.getBackgroundPage());
    }
    let pluginStat = (bg && bg.pluginStat) ? bg.pluginStat : PluginStat_1.default();
    $("#closeIrrelevantTabs").prop('checked', pluginStat.config.closeIrrelevantTabs).bootstrapToggle({
        on: 'on',
        off: 'off',
        onstyle: 'danger',
        offstyle: 'secondary',
        size: "sm",
    });
    $("#debuggerStatement").prop('checked', pluginStat.config.debuggerStatement).bootstrapToggle({
        on: 'on',
        off: 'off',
        onstyle: 'danger',
        offstyle: 'secondary',
        size: "sm",
    });
    $("#pauseProcess").prop('checked', pluginStat.config.pauseProcess).bootstrapToggle({
        off: '<svg style="width:24px;height:24px" viewBox="0 0 24 24"><path fill="#FFF" d="M8,5.14V19.14L19,12.14L8,5.14Z"/></svg>',
        on: '<svg style="width:24px;height:24px" viewBox="0 0 24 24"><path fill="#FFF" d="M18,18H6V6H18V18Z"/></svg>',
        size: "sm",
        onstyle: "danger",
        offstyle: "success",
    });
    for (const elm of ['closeIrrelevantTabs', 'debuggerStatement', 'pauseProcess']) {
        const jq = $(`#${elm}`);
        jq.on('change', function () {
            const value = $(this).is(':checked');
            switch (elm) {
                case 'closeIrrelevantTabs':
                    pluginStat.config.closeIrrelevantTabs = value;
                    break;
                case 'debuggerStatement':
                    pluginStat.config.debuggerStatement = value;
                    break;
                case 'pauseProcess':
                    pluginStat.config.pauseProcess = value;
                    break;
            }
        });
    }
    updateDisplay();
    const flushCache = () => {
        chromep.runtime.sendMessage({
            command: 'flushCache',
        });
    };
    const flushProxy = () => {
        chromep.runtime.sendMessage({
            command: 'setProxy',
        });
    };
    const readQrCode = () => {
        chromep.runtime.sendMessage({
            command: 'readQrCode',
        }).then((result) => {
            console.log(result);
            if (result.error) {
                lastCode = 'error:' + JSON.stringify(result.error);
            }
            else {
                lastCode = result[0].text;
            }
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

},{"../vendor/chrome-promise":3,"./PluginStat":1}],3:[function(require,module,exports){
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
  
},{}]},{},[2]);
