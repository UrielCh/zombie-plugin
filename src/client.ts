import sendMessage from './SendMessage';
import { wait } from './common'
/**
 * injected in all pages
 */
let zone = document.getElementById('tasker_id_loader');
if (zone)
    zone.innerHTML = chrome.runtime.id;

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
     */
    const myGetPos = (successCallback: PositionCallback/*, error: PositionErrorCallback, options: PositionOptions*/) => {
        if (!coords)
            return originalGeolocation.getCurrentPosition;
        successCallback({ coords, timestamp: new Date().getTime() });
    };
    navigator.geolocation.getCurrentPosition = myGetPos;

    let timerId: number = 0;

    navigator.geolocation.watchPosition = (successCallback: PositionCallback, errorCallback: PositionErrorCallback, options: PositionOptions) => {
        window.clearInterval(timerId);
        return (timerId = window.setInterval(myGetPos, 5 * 1000, successCallback, errorCallback, options));
    };
    navigator.geolocation.clearWatch = () => window.clearInterval(timerId);
}

if (document.documentElement.tagName.toLowerCase() === 'html')  // Skip non-html pages.
    chrome.storage.local.get({ coords: null }, (data) => {
        const { coords } = (data as Position);
        if (coords)
            injectScript(installGeolocationCode, [coords]);
        // else console.log('NOGEOLOC data');
    });

async function startPluginCode() {
    try {
        await wait(500);
        debugger;
        const data: 'code injected' | any = await sendMessage({ command: 'getTodo' });
        // const data = message; // {task: any} | {error: string} | 'code injected' | null | undefined;
        if (!data) {
            if (isProtected(window.location.href))
                return false;
            console.log(`Data is missing from getTodo ${window.location.href} I may close this tab`);
            try {
                await sendMessage({ command: 'closeMe', lazy: true, reason: 'data is missing from getTodo' });
                // eslint-disable-next-line no-empty
            } catch (e) { }
            return true;
        }
        if (data.error) {
            console.error(`Bootstraping Retunr Error: ${data.error}`);
            return true;
        }
        if (data === 'code injected' || !data.task)
            return true;
        // OLD code to remove:
        const task = data.task;
        if (!task)
            return false;
        if (!task.deps)
            task.deps = [];
        let virtualScript = [];
        for (const dep of task.deps) {
            console.log('inject ', dep);
            const data2 = await fetch(dep, { method: 'GET' }).then((response) => response.text());
            virtualScript.push(data2);
        }
        return execute(virtualScript.join('\r\n'));
    } catch (error) {
        console.error(error);
    }
}

startPluginCode();