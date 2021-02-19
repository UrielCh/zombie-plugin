import { wait } from './common';
const extensionId = chrome.runtime.id;
let port: chrome.runtime.Port | null = null;

const callbacks: { [key: number]: {
    // eslint-disable-next-line no-unused-vars
    resolve: (result?: any) => any;
    // eslint-disable-next-line no-unused-vars
    reject: (reason?: any) => any;
    message: IPluginMessage;
    retries: number;
 } } = {};

export interface IPluginMessage {
    command: string;
    lazy?: boolean;
    reason?: string;
    // if command === 'storageSet'
    key?: string;
    value?: string;
}

const msgListener = async (response: { requestId: number, error?: string, data?: any }/*, port: chrome.runtime.Port*/) => {
    const callback = callbacks[response.requestId];
    if (!callback)
        return;
    const { message, resolve, reject} = callback;
    const { requestId, error } = response;

    // console.log(`Q:${requestId} CMD:${message.command} RCV:`, response);
    if (error) {
        if (++callback.retries > 3) {
            // eslint-disable-next-line no-debugger
            debugger;
            await wait(500);
            // do nor wait here
            promFilled(requestId, message)(resolve, reject).finally(() => {});
        } else {
            delete callbacks[response.requestId];
            callback.reject(Error(error));
        }
    } else {
        delete callbacks[requestId];
        callback.resolve(response.data);
    }
};

// eslint-disable-next-line no-unused-vars
const promFilled = (requestId: number, message: IPluginMessage) => async (resolve: (value?: any) => void, reject: (reason?: Error) => void) => {
    let usedPort = port;
    if (!usedPort) {
        usedPort = chrome.runtime.connect(extensionId);
        usedPort.onDisconnect.addListener(() => port = null);
        usedPort.onMessage.addListener(msgListener);
        port = usedPort;
    }
    try {
        callbacks[requestId] = { resolve, reject, message, retries: 0};
        usedPort.postMessage({ requestId, data: message });
    } catch (e) {
        if (e.message == 'Attempting to use a disconnected port object') {
            console.error('Plugin connexion Error. (may be inf-loop.)');
            if (usedPort === port)
                port = null;
            await wait(150);
            // do not await here
            promFilled(requestId, message)(resolve, reject).finally(() => {});
        }
    }
};

let rqId = 1;
export const sendMessage = (message: IPluginMessage): Promise<any> => {
    const next = rqId++;
    return new Promise(promFilled(next, message));
};

export default sendMessage;