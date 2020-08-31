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
      /**
       * 
       * @param {function} fn 
       * @param {any} thisArg 
       * @param {string} command called chrome commande for verbose error report
       */
      function setPromiseFunction(fn, thisArg, command) {
  
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
                reject(Error('call to ' + command + ' failed:'+ errorTxt));
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
      /**
       * 
       * @param {any} source original chome
       * @param {any} target promise verision
       * @param {string} prefix command name
       */
      function fillProperties(source, target, prefix) {
        prefix = prefix || '';
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
              var prefix2 = prefix ? prefix + '.' + key : key;
              fillProperties(val, target[key], prefix2);
            } else if (type === 'function') {
              var prefix2 = prefix ? prefix + '.' + key : key;
              target[key] = setPromiseFunction(val, source, prefix2);
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
          var prefix2 = prefix ? prefix + '.' + key : key;
          fillProperties(approvedPerms, self, prefix2);
        }
      }
    }
  }));
  