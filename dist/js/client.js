"use strict";
let zone = document.getElementById('tasker_id_loader');
if (zone)
    zone.innerHTML = chrome.runtime.id;
const get = (url) => jQuery.get(url).then((data, textStatus, jqXHR) => Promise.resolve(data), (jqXHR, textStatus, errorThrown) => Promise.reject(textStatus));
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
    const myGetPos = (successCallback, error, options) => {
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
        if (data.coords)
            injectScript(installGeolocationCode, [data.coords]);
    });
chrome.runtime.sendMessage({
    command: 'getTodo'
}, async (message) => {
    const data = (message);
    if (!data) {
        if (isProtected(window.location.href))
            return false;
        console.log(`data is missing from getTodo ${window.location.href} I may close this tab`);
        chrome.runtime.sendMessage({ command: 'closeMe', lazy: true, reason: 'data is missing from getTodo' }, () => true);
        return true;
    }
    if (data.error) {
        console.error('Bootstraping Retunr Error:' + data.error);
        return true;
    }
    if (data === 'code injected' || !data.task)
        return true;
    const task = data.task;
    if (!task)
        return false;
    if (!task.deps)
        task.deps = [];
    let virtualScript = '';
    for (const dep of task.deps) {
        const data2 = await get(dep);
        virtualScript += '\r\n' + data2;
    }
    return execute(virtualScript);
});
