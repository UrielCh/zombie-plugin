import { wait } from './common';
let rqId = 1;
let port: chrome.runtime.Port | null = null;

export interface IPluginMessage {
    command: string;
    lazy?: boolean;
    reason?: string;
}

export const sendMessage = (message: IPluginMessage): Promise<any> => {
    const requestId = rqId++;
    const extensionId = chrome.runtime.id;
    let errorCnt = 0;
    const prom = (resolve: (value?: any) => void, reject: (reason?: any) => void) => {
        let usedPort = port;
        if (!usedPort) {
            usedPort = chrome.runtime.connect(extensionId);
            usedPort.onDisconnect.addListener(() => port = null);
            port = usedPort;   
        }
        const listener = async (response: { requestId: number, error?: string, data?: any }, port: chrome.runtime.Port) => {
            if (requestId != response.requestId)
                return;
            console.log(`CMD:${message.command} Q: ${requestId} RCV:`, response)
            port.onMessage.removeListener(listener);
            if (response.error) {
                if (++errorCnt > 3) {
                    debugger;
                    await wait(500);
                    prom(resolve, reject);
                } else {
                    reject(Error(response.error));
                }
            } else {
                resolve(response.data);
            }
        };
        usedPort.onMessage.addListener(listener);
        try {
            usedPort.postMessage({ requestId, data: message });
        } catch (e) {
            if (e.message == 'Attempting to use a disconnected port object') {
                if (usedPort === port)
                    port = null;
                setTimeout(prom, 100, resolve, reject)
            }
        }
    };
    return new Promise(prom);
}

export default sendMessage;