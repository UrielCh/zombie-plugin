import assert from 'assert';
import bluebird from 'bluebird';
import fse from 'fs-extra';
import http from 'http';
import path from 'path';
import puppeteer from 'puppeteer';

interface IProxy {
    scheme: string;
    host: string;
    port: number;
    username: string;
    password: string;
}

const pluginId = 'glahfcghcimoldaofgabgfefmiccmnen';

function startSrv(port: number) {
    return new Promise(resolve => {
        const app = http.createServer(async (request, response) => {
            let url = request.url || '/';
            if (url === '/') {
                url = '/index.html';
            }
            url = url.replace(/\//g, '');
            const file = path.join(__dirname, '..', 'test', url);
            try {
                const stat = await fse.stat(file);
                const ext = path.extname(url);
                const type = ({
                    '.html': 'text/html',
                    '.css': 'text/css',
                    '.js': 'text/javascript',
                    '.png': 'image/png',
                    '.jpeg': 'image/jpeg',
                } as any)[ext];
                response.writeHead(200, {
                    'Content-Type': type,
                    'Content-Length': stat.size
                });
                const data = await fse.readFile(file);
                response.write(data);
                // const readStream = fse.createReadStream(file);
                // readStream.pipe(response);
            } catch (e) {
                response.writeHead(404, { 'Content-Type': 'text/plain' });
                response.write('Not found')
            }
            response.end();
        });
        app.listen(port, resolve);
    });
}

async function main() {
    await startSrv(3000);

    const CRX_PATH = './dist';
    const browser = await puppeteer.launch({
        headless: false,
        devtools: true,
        args: [
            `--disable-extensions-except=${CRX_PATH}`,
            `--load-extension=${CRX_PATH}`,
            // '--allow-file-access flag',
            '--allow-file-access-from-files',
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

    if (false) // test proxy
        try {
            page.evaluate(() => { (chrome.runtime.onMessage as any).dispatch({ command: 'setProxy' }, null, console.log); });
            const proxys: IProxy[] = await fse.readJSON('../zombie/private/proxy.json');
            const proxy0 = proxys[0];

            await page0.goto('http://monip.org/', { timeout: 10000, waitUntil: 'networkidle0' });
            //         await page0.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });
            const ipTxt0 = await page0.$eval('font[size="8"]', el => el.textContent);
            console.log('RealIP:', ipTxt0);
            page.evaluate((proxy) => {
                console.log(proxy);
                (chrome.runtime.onMessage as any).dispatch({ command: 'setProxy', scheme: proxy.scheme, host: proxy.host, port: proxy.port, username: proxy.username, password: proxy.password }, null, console.log);
            }, proxy0 as any as puppeteer.JSONObject); // JSON.stringify(
            try {
                await page0.reload({ timeout: 10000, waitUntil: 'networkidle0' });
            } catch (e) {
                console.log('May be an error');
            }
            //         await page0.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });
            const ipTxt1 = await page0.$eval('font[size="8"]', el => el.textContent);
            console.log('ProxyIP:', ipTxt1);
            assert.notEqual(ipTxt0, ipTxt1);
        } catch (e) {
            console.log('Proxy Base not found test skiped', e);
        }

    try {
        // await page0.goto('https://en.wikipedia.org/wiki/QR_code', { timeout: 10000, waitUntil: 'networkidle0' });
        await page0.goto(`http://localhost:3000/`, { timeout: 10000, waitUntil: 'networkidle0' });
    } catch (e) { }
    console.log('Ready');

    // tslint:disable-next-line: no-shadowed-variable
    const qr = await page0.evaluate((pluginId) => {
        return new Promise(resolve => chrome.runtime.sendMessage(pluginId, { command: 'readQrCode' }, resolve));
    }, pluginId) as any[];
    assert.equal(qr.length , 1);
    assert.equal(qr[0].text , 'https://github.com/UrielCh/zombie-plugin');

    try {
        await page0.goto('https://www.google.com/', { timeout: 10000, waitUntil: 'networkidle0' });
    } catch (e) { }
    // get Original cookies
    const cookies1 = await page.evaluate(() => {
        return new Promise(resolve => (chrome.runtime.onMessage as any).dispatch({ command: 'getCookies', name: '.*' }, null, resolve));
    }) as puppeteer.Cookie[];
    console.log(`total Cookies Count: ${cookies1.length}`);
    console.log(cookies1.map(cookie => `${cookie.domain}${cookie.path} ${cookie.name}`).join(', '));

    // delete cookies should return deleted cookies
    const cookies2 = await page.evaluate(() => {
        return new Promise(resolve => (chrome.runtime.onMessage as any).dispatch({ command: 'deleteCookies', name: '.*' }, null, resolve));
    }) as puppeteer.Cookie[];
    // assert.equal(cookies2.length, 4);
    console.log(cookies2 + ' cookies deleted');

    // get cookies after delete should be empty
    const cookies3 = await page.evaluate(() => {
        return new Promise(resolve => (chrome.runtime.onMessage as any).dispatch({ command: 'getCookies', name: '.*' }, null, resolve));
    }) as puppeteer.Cookie[];
    console.log(`total Cookies after clean Count: ${cookies3.length}`);
    console.log(cookies3.map(cookie => `${cookie.domain}${cookie.path} ${cookie.name}`).join(', '));

    // push previouly save cookies
    await page.evaluate((cookies) => {
        return new Promise(resolve => (chrome.runtime.onMessage as any).dispatch({ command: 'pushCookies', cookies }, null, resolve));
    }, cookies1 as any as puppeteer.SerializableOrJSHandle);

    // get cookies should be the same
    const cookies4 = await page.evaluate(() => {
        return new Promise(resolve => (chrome.runtime.onMessage as any).dispatch({ command: 'getCookies', name: '.*' }, null, resolve));
    }) as puppeteer.Cookie[];
    console.log(cookies4.map(cookie => `${cookie.domain}${cookie.path} ${cookie.name}`).join(', '));

    // await browser.close();
}
main();
