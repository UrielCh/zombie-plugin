/**
 * injected in all pages
 */
let zone = document.getElementById('tasker_id_loader');
if (zone)
    zone.innerHTML = chrome.runtime.id;
// let zoneVerion = document.getElementById('tasker_id_loader_version');
// if (zoneVerion && chrome.app) {
// console.log(chrome.app.installState());
// zoneVerion.innerHTML = chrome.app.getDetails().version;
// }

const get = (url: string) => jQuery.get(url).then((data, textStatus, jqXHR) => Promise.resolve(data), (jqXHR, textStatus, errorThrown) => Promise.reject(textStatus));

const isProtected = (url?: string) => {
    if (!url)
        return false;
    return (~url.indexOf('chrome://')) || (~url.indexOf('127.0.0.1')) || (~url.indexOf('localhost')) || (~url.indexOf('.exs.fr'));
};

function execute(code: string): boolean {
    try {
        // remove all sourceMapping
        code = code.replace('//# sourceMappingURL=', '//');
        // remove ES6 import
        code = code.replace(/import\s+[0-9A-Za-z_-]+\s+from\s+['"][./0-9A-Za-z_-]+['"]\s*;?/g, '');
        /* tslint:disable:no-eval */
        eval(code);
    } catch (e) {
        console.error('clent.js eval throws:', e);
        return false;
    }
    return true;
}

const injectScript = async (func: string | ((...args: any) => any), params: any[]): Promise<boolean> => {
    const script = document.createElement('script');
    if (typeof (func) === 'function')
        script.innerHTML = '(' + func.toString() + ')(' + (params ? params.map((/** @type {any} */o) => JSON.stringify(o)).join(', ') : '') + ');';
    else if (typeof (func) === 'string')
        script.innerHTML = func;
    // self remove script
    script.addEventListener('load', () => document.documentElement.removeChild(script), true /*useCapture*/);
    const parent = (document.head || document.body || document.documentElement);
    const firstChild = (parent.childNodes && (parent.childNodes.length > 0)) ? parent.childNodes[0] : null;
    parent.insertBefore(script, firstChild || null);
    return true;
};

// backup original function
const originalGeolocation = {
    getCurrentPosition: navigator.geolocation.getCurrentPosition,
    watchPosition: navigator.geolocation.watchPosition,
    clearWatch: navigator.geolocation.clearWatch,
};

/**
 * see lib.dom.d.ts
 * @param {Coordinates} coords
 */
function installGeolocationCode(coords: Coordinates) {
    /**
     * @param successCallback {PositionCallback}
     * @param error {PositionErrorCallback}
     * @param options {PositionOptions}
     */
    const myGetPos = (successCallback: PositionCallback, error: PositionErrorCallback, options: PositionOptions) => {
        if (!coords)
            return originalGeolocation.getCurrentPosition;
        successCallback({ coords, timestamp: new Date().getTime() });
    };
    navigator.geolocation.getCurrentPosition = myGetPos;
    /**
     * @type {number}
     */
    let timerId = 0;
    /**
     * @param successCallback {PositionCallback}
     * @param errorCallback {PositionErrorCallback}
     * @param options {PositionOptions}
     */
    navigator.geolocation.watchPosition = (successCallback, errorCallback, options) => {
        window.clearInterval(timerId);
        return (timerId = window.setInterval(myGetPos, 5 * 1000, successCallback, errorCallback, options));
    };
    navigator.geolocation.clearWatch = () => window.clearInterval(timerId);
}

if (document.documentElement.tagName.toLowerCase() === 'html')  // Skip non-html pages.
    chrome.storage.local.get({ coords: null }, (data) => {
        // /** @type {Position} */
        if (data.coords)
            injectScript(installGeolocationCode, [data.coords]);
        // else console.log('NOGEOLOC data');
    });

chrome.runtime.sendMessage({
    command: 'getTodo'
}, async (message: any) => {
    const data = /** @type {{task:any} | 'code injected' | null | undefined} */ (message);
    if (!data) {
        if (isProtected(window.location.href))
            return false;
        console.log(`data is missing from getTodo ${window.location.href} I may close this tab`);
        chrome.runtime.sendMessage({ command: 'closeMe', lazy: true , reason: 'data is missing from getTodo'}, () => true);
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
