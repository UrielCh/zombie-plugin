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

interface RecaptchaTaskResponseProcessing {
    errorId: number,
    status: "processing",
}

interface RecaptchaTaskResponseReady {
    errorId: number,
    status: "ready",
    solution:
    {
        gRecaptchaResponse: string,
        // text: string,
        // url: string,
    },
    cost: number,
    ip: string,
    createTime: number,
    endTime: number,
    solveCount: string,
}
type RecaptchaTaskResponse = RecaptchaTaskResponseProcessing | RecaptchaTaskResponseReady;

(async function () {
    const chromep = new ChromePromise();
    const captchcaOption = await chromep.storage.local.get('AnticaptchaKey');
    if (!captchcaOption.AnticaptchaKey)
        return;
    console.log(captchcaOption);
    let anticaptchaClientKey = captchcaOption.AnticaptchaKey;
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
            if (purl.port === '29393')
                return;
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
                    userAgent: navigator.userAgent,
                },
                softId: 0,
                languagePool: 'en'
            };
            const createTask = 'http://api.anti-captcha.com/createTask';
            const getTaskResult = 'https://api.anti-captcha.com/getTaskResult';

            const result = (await sendMessage({ command: 'post', url: createTask, data: task } as IPluginMessage)) as { errorId: number, taskId: number };
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
                if (result2.status == 'ready' && result2.solution && result2.solution.gRecaptchaResponse) {
                    debugger;
                    const gRecaptchaResponse = document.getElementById("g-recaptcha-response");
                    if (gRecaptchaResponse)
                        gRecaptchaResponse.innerHTML = result2.solution.gRecaptchaResponse;
                    await wait(5000);
                }
                await wait(5000);
            }
            // see https://2captcha.com/2captcha-api#solving_captchas
        }
    }
})();