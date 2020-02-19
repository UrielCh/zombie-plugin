/* eslint-disable quotes */
// eslint-disable-next-line no-unused-vars
// import PluginStat from './PluginStat';
// eslint-disable-next-line no-unused-vars
// import { BackGroundPage, PluginStatValue } from './interfaces';
import ChromePromise from '../vendor/chrome-promise';
// eslint-disable-next-line no-unused-vars
import sendMessage, { IPluginMessage } from './SendMessage';
import { wait } from './common';

/* eslint-disable no-debugger */

interface RecaptchaTaskResponse {
    errorId: number,
    status: "ready",
    solution:
    {
        text: string,
        url: string,
    },
    cost: number,
    ip: string,
    createTime: number,
    endTime: number,
    solveCount: string,
    gRecaptchaResponse: string,
}

(async function () {
    const chromep = new ChromePromise();
    let {anticaptchaClientKey} = (await chromep.storage.local.get('AnticaptchaKey')).AnticaptchaKey;
    if (document.URL && document.URL.startsWith('https://www.google.com/recaptcha/api2/anchor')) {
        const url = new URL(document.URL);
        const websiteKey = url.searchParams.get('k');
        console.log('siteKey:', websiteKey);
        const element = document.getElementById('recaptcha-token');
        if (element) {
            const chalange = element.getAttribute('value');
            console.log('chalange:', chalange);

            const proxyData = await sendMessage({
                command: 'getProxy'
            });

            const proxy = proxyData.proxy as string;
            const auth = proxyData.auth as string;

            if (!proxy || !auth)
                return;
            if (proxy == 'fixed_servers')
                return;
            const { username, password } = JSON.parse(auth);
            console.log('parsing PROXY:' + proxy);
            if (!proxy.startsWith('http')) {
                console.error('unknown proxy');
                return;
            }
            const purl = new URL(proxy);

            const websiteURL = await sendMessage({
                command: 'getParentUrl'
            });
            debugger;
            const task = {
                clientKey: anticaptchaClientKey,
                task:
                {
                    type: 'NoCaptchaTask',
                    websiteURL,
                    websiteKey,
                    proxyType: purl.protocol.replace(':', ''),
                    proxyAddress: purl.hostname,
                    proxyPort: purl.port,
                    proxyLogin: username,
                    proxyPassword: password,
                    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.87 Safari/537.36', // fix me
                },
                softId: 0,
                languagePool: 'en'
            };
            const createTask = 'http://api.anti-captcha.com/createTask';
            const getTaskResult = 'https://api.anti-captcha.com/getTaskResult';

            const result = (await sendMessage({ command: 'post', url: createTask, data: task } as IPluginMessage)) as { errorId: number, taskId: number };
            debugger;
            if (result.errorId) {
                console.log(`createTask retyurn error: ${JSON.stringify(result)}`);
                return;
            }
            console.log(`wait 10 sec for resolution check TaskID:${result.taskId}`);
            await wait(10000);
            let resolved = false;
            while (!resolved) {
                const result2: RecaptchaTaskResponse = await sendMessage({
                    command: 'post', url: getTaskResult, data: {
                        clientKey: anticaptchaClientKey,
                        taskId: result.taskId
                    }
                } as IPluginMessage);
                console.log(result2);
                await wait(5000);
            }
        }
    }
})();