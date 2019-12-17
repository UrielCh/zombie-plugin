let rqId = 1;
let port: chrome.runtime.Port | null = null;

export interface IPluginMessage {
    command: string;
    lazy?: boolean;
    reason?: string;
}

export const sendMessage = (message: IPluginMessage): Promise<any> => {
    const prom = (resolve: (value?: any) => void, reject: (reason?: any) => void) => {
        let port2 = port;
        if (!port2) {
            port2 = chrome.runtime.connect(chrome.runtime.id);
            port2.onDisconnect.addListener(() => {
                port = null
            });
            port = port2;
        }
        const requestId = rqId++;
        const listener = (response: { requestId: number, error?: string, data?: any }, port: chrome.runtime.Port) => {
            if (requestId != response.requestId)
                return;
            console.log(`Q: ${requestId} CMD:${message.command} RCV:`, response)
            port.onMessage.removeListener(listener);
            if (response.error)
                reject(Error(response.error));
            else
                resolve(response.data);
        };
        port2.onMessage.addListener(listener);
        try {
            port2.postMessage({ requestId, data: message });
        } catch (e) {
            if (e.message == 'Attempting to use a disconnected port object') {
                port = null;
                setTimeout(prom, 100, resolve, reject)
            }
        }
    };
    return new Promise(prom);
}

export default sendMessage;