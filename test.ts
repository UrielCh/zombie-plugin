import bluebird from 'bluebird';
import fse from 'fs-extra';
import puppeteer from 'puppeteer';

interface IProxy {
    scheme: string;
    host: string;
    port: number;
    username: string;
    password: string;
}

const pluginId = 'glahfcghcimoldaofgabgfefmiccmnen';

async function main() {
    const CRX_PATH = './dist';
    const browser = await puppeteer.launch({
        headless: false,
        devtools: true,
        args: [
            `--disable-extensions-except=${CRX_PATH}`,
            `--load-extension=${CRX_PATH}`,
            // '--user-agent=PuppeteerAgent'
        ]
    });

    const targets = await browser.targets();
    const bgTarget = targets.filter(target => target.type() === 'background_page')[0];

    const mainTarget = targets.filter(target => target.type() === 'page')[0];
    // console.log(targets.map(a => a.type()));

    const page0 = await mainTarget.page(); // browser.newPage();
    await page0.setViewport({ width: 1920, height: 1080 });
    // page0.goto('chrome://extensions/?id=${pluginId}');
    await page0.goto('chrome://extensions/');
    // await page0.goto('chrome-extension://${pluginId}/files/background.html');
    await bluebird.delay(100);
    // https://devhints.io/xpath
    function querySelectorShadow(...selectors: string[]) {
        let cur = null;
        for (const selector of selectors) {
            if (!cur)
                cur = document.body.querySelector(selector);
            else {
                if (!cur.shadowRoot)
                    return null;
                let tmp: any = cur.shadowRoot.querySelector(selector);
                if (!tmp)
                    tmp = cur.children[selector];
                cur = tmp;
            }
            if (!cur)
                return null;
        }
        return cur;
    }
    await page0.evaluateHandle(querySelectorShadow.toString());
    // v1
    // await page0.evaluateHandle('document.body.children[2].shadowRoot.children[3].shadowRoot.children[2].children[0].children[2].click()');
    // v2
    // await page0.evaluateHandle('document.body.querySelector("extensions-manager").shadowRoot.querySelector("extensions-toolbar").shadowRoot.querySelector("cr-toggle").click()');
    // v3
    await page0.evaluateHandle('querySelectorShadow("extensions-manager", "extensions-toolbar", "cr-toggle").click()');
    // const a = await page0.evaluateHandle(`querySelectorShadow("extensions-manager", "cr-view-manager", "items-list", "extensions-item[id=${pluginId}]", "a.clippable-flex-text")`);
    // console.log(a);
    await page0.evaluateHandle(`querySelectorShadow("extensions-manager", "cr-view-manager", "items-list", "extensions-item[id=${pluginId}]", "a.clippable-flex-text").click()`);
    // querySelectorShadow("extensions-manager", "cr-view-manager").children['items-list'].shadowRoot.querySelector('extensions-item').shadowRoot.querySelector('a.clippable-flex-text')
    // querySelectorShadow("extensions-manager", "cr-view-manager", "extensions-item-list", "extensions-item-list", "extensions-item[id=\"${pluginId}\"]", "a.clippable-flex-text").click()
    const page = await bgTarget.page();

    // test proxy
    try {
        page.evaluate(() => { (chrome.runtime.onMessage as any).dispatch({ command: 'setProxy' }, null, console.log); });
        await page0.goto('https://monip.org/');
        await page0.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });
        const ipTxt0 = await page0.$eval('font[size="8"]', el => el.textContent);
        console.log('RealIP:', ipTxt0);
        const proxys: IProxy[] = await fse.readJSON('../zombie/private/proxy.json');
        const proxy = proxys[0];
        page.evaluate(() => { (chrome.runtime.onMessage as any).dispatch({ command: 'setProxy', scheme: proxy.scheme, host: proxy.host, port: proxy.port, username: proxy.username, password: proxy.password }, null, console.log); });
        await page0.goto('https://monip.org/');
        await page0.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });
        const ipTxt1 = await page0.$eval('font[size="8"]', el => el.textContent);
        console.log('ProxyIP:', ipTxt1);
        if (ipTxt0 === ipTxt1)
            console.error('Proxy Change Failure');

    } catch (e) {
        console.log('Proxy Base not found test skiped', e);
    }

    await page0.goto('https://pptr.dev/');
    console.log('wait for https://pptr.dev/');
    try {
        await page0.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });
    } catch (e) { }
    console.log('wait Done');
    const r = page.evaluate(() => {
        // console.log((window as any).pluginStat);
        // chrome.runtime.sendMessage({ command: 'updateBadge' })
        // chrome.runtime.sendMessage({ command: 'closeMe', lazy: true }, () => true);
        (chrome.runtime.onMessage as any).dispatch({ command: 'popCookies', name: '.*' }, null, console.log);
    });
    // await browser.close();
}
main();
