// import PluginStat from './PluginStat';
// import { BackGroundPage, PluginStatValue } from './interfaces';
import ChromePromise from '../vendor/chrome-promise/chrome-promise';
import sendMessage, { IPluginMessage } from './SendMessage';
import { wait } from './common';

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

const getAnticaptchaClientKey = async () => {
    const chromep = new ChromePromise();
    const captchcaOption = await chromep.storage.local.get('AnticaptchaKey');
    if (!captchcaOption.AnticaptchaKey)
        return '';
    let anticaptchaClientKey = captchcaOption.AnticaptchaKey;
    return anticaptchaClientKey;
};

const getWebsiteKey = (url: string): string | undefined => {
    const url2 = new URL(url);
    const websiteKey = url2.searchParams.get('k') as string;
    return websiteKey;
};

(async function () {
    if (document.URL && document.URL.startsWith('https://www.google.com/recaptcha/api2/anchor')) {
        // captcha frame
        const tokebnElm = document.getElementById('recaptcha-token') as any;
        if (tokebnElm && tokebnElm.value) {
            const websiteKey = getWebsiteKey(document.URL);
            let token = tokebnElm.value;
            const key = `recap_${websiteKey}`;
            await sendMessage({
                command: 'storageSet',
                key,
                value: token,
            });
            // wait token to be consume
            while (token) {
                await wait(1000);
                token = await sendMessage({
                    command: 'storageGet',
                    key,
                });
            }
            while (!token) {
                await wait(5000);
                console.log('consumed');
            }
        }
        return;
    }

    await wait(1000);
    const captchaBoxs = $('iframe[src^="https://www.google.com/recaptcha/api2/anchor"]');
    if (captchaBoxs.length === 1) {
        const websiteKey = getWebsiteKey(captchaBoxs.attr('src') as string);
        const key = `recap_${websiteKey}`;

        let token = '';
        await wait(1000);
        while (!token) {
            await wait(1000);
            token = await sendMessage({
                command: 'storageGet',
                key,
            });
        }
        await sendMessage({
            command: 'storageRemove',
            key: key,
        });
        // drop used token

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
        if (!proxy.startsWith('http')) {
            console.error('unknown proxy');
            return;
        }
        const purl = new URL(proxy);

        //const websiteURL = await sendMessage({
        //    command: 'getParentUrl'
        //});
        const websiteURL = document.URL;
        if (purl.port === '29393')
            return;
        let anticaptchaClientKey = await getAnticaptchaClientKey();
        if (!anticaptchaClientKey)
            return;
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
            while (result2.status == 'ready' && result2.solution && result2.solution.gRecaptchaResponse) {
                const gRecaptchaResponse = document.getElementById("g-recaptcha-response");
                if (gRecaptchaResponse) {
                    $(gRecaptchaResponse).show();
                    // innerHTML of value
                    (gRecaptchaResponse as any).innerHTML = result2.solution.gRecaptchaResponse;
                    // $(gRecaptchaResponse).parent().parent().submit();
                    // TODO find submit BT
                }
                await wait(6000);
            }
            await wait(5000);
        }
        // see https://2captcha.com/2captcha-api#solving_captchas
    }
}) ();