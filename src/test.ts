import assert from 'assert';
import bluebird from 'bluebird';
import fse from 'fs-extra';
import http from 'http';
import path from 'path';
// eslint-disable-next-line no-unused-vars
import puppeteer, { Browser, Page, Target } from 'puppeteer';

import { expect } from 'chai';
import 'mocha';

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
            if (url === '/')
                url = '/index.html';
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
            } catch (e) {
                response.writeHead(404, { 'Content-Type': 'text/plain' });
                response.write('Not found');
            }
            response.end();
        });
        app.listen(port, resolve);
    });
}
let _browser: Browser;
async function getbrowser() {
    if (_browser)
        return _browser;
    const CRX_PATH = './dist';
    _browser = await puppeteer.launch({
        headless: false,
        // devtools: true,
        args: [
            `--disable-extensions-except=${CRX_PATH}`,
            `--load-extension=${CRX_PATH}`,
            // '--allow-file-access flag',
            // '--user-agent=PuppeteerAgent'
        ]
    });
    return _browser;
}

/**
 * get Background page from plugin
 */
async function getBGTarget(): Promise<Target> {
    const browser: Browser = await getbrowser();
    const targets = await browser.targets();
    const bgTarget = targets.filter(target => target.type() === 'background_page')[0];
    return bgTarget;
}

let _BgPage: Page;
async function getBGPage(): Promise<Page> {
    if (_BgPage)
        return _BgPage;
    _BgPage = await (await getBGTarget()).page();
    return _BgPage;
}

async function getMainTarget(): Promise<Target> {
    const browser: Browser = await getbrowser();
    const targets = await browser.targets();
    const mainTarget = targets.filter(target => target.type() === 'page')[0];
    return mainTarget;
}
let _mainPage: Page;
async function getMainPage(): Promise<Page> {
    if (_mainPage)
        return _mainPage;
    _mainPage = await (await getMainTarget()).page();
    return _mainPage;
}

// eslint-disable-next-line no-unused-vars
async function enableDevMode(): Promise<void> {
    const page0 = await getMainPage();
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
}

describe('InitEnv', () => {
    it('Should start a webserver and a chronme windows', async () => {
        await startSrv(3000);
        // await enableDevMode();
    });
});

describe('Test Proxy Feature', () => {
    let proxy0: IProxy | null;
    let ipTxt0: string;
    it('disable all privious proxy data', async () => {
        const page = await getBGPage();
        page.evaluate(() => { (chrome.runtime.onMessage as any).dispatch({ command: 'setProxy' }, null, console.log); });
    });

    it('Try to find a public proxy', async () => {
        try {
            const proxys: IProxy[] = await fse.readJSON('../zombie/private/proxy.json');
            proxy0 = proxys[0];
        } catch (e) {
            proxy0 = null;
        }
    });

    it('Should find a public IP', async () => {
        if (proxy0) {
            const page0 = await getMainPage();
            try {
                await page0.goto('http://monip.org/', { timeout: 10000, waitUntil: 'domcontentloaded' });
            } catch (e) {
                console.log(e);
            }
            ipTxt0 = await page0.$eval('font[size="8"]', el => el.textContent) as string;
            expect(ipTxt0).to.match(/[0-9.]+/);
            // console.log('RealIP:', ipTxt0);
        }
    }).timeout(20000);

    it('Should change public IP', async () => {
        if (proxy0) {
            const page = await getBGPage();
            const page0 = await getMainPage();
            await page.evaluate((proxy) => {
                console.log(proxy);
                (chrome.runtime.onMessage as any).dispatch({ command: 'setProxy', scheme: proxy.scheme, host: proxy.host, port: proxy.port, username: proxy.username, password: proxy.password }, null, console.log);
            }, proxy0 as any as puppeteer.JSONObject); // JSON.stringify(
            try {
                await page0.reload({ timeout: 10000, waitUntil: 'domcontentloaded' });
            } catch (e) {
                console.log('May be an error');
            }
            const ipTxt1 = await page0.$eval('font[size="8"]', el => el.textContent);
            expect(ipTxt1).to.match(/[0-9.]+/);
            // console.log('ProxyIP:', ipTxt1);
            assert.notEqual(ipTxt0, ipTxt1);
        }
    }).timeout(20000);
});

describe('Test QR code Readed', () => {
    it('Should Open QrCode page', async () => {
        const page0 = await getMainPage();
        const testurl = 'http://localhost:3000/';
        try {
            await page0.goto(testurl, { timeout: 1000, waitUntil: 'networkidle0' });
        } catch (e) {
            // kust ignore error
        }
        expect(page0.url()).to.eq(testurl);
    }).timeout(10000);

    it('Should read QR code value', async () => {
        const page0 = await getMainPage();
        // tslint:disable-next-line: no-shadowed-variable
        const qr = await page0.evaluate((pluginId) => {
            return new Promise(resolve => chrome.runtime.sendMessage(pluginId, { command: 'readQrCode' }, resolve));
        }, pluginId) as any[];
        expect(qr.length).to.equal(1);
        expect(qr[0].text).to.equal('https://github.com/UrielCh/zombie-plugin');
    });
});

describe('Test Cookies manipulation functions', () => {
    let cookies1: puppeteer.Cookie[];
    it('Should go to the cookies test page', async () => {
        const page0 = await getMainPage();
        const testurl = 'https://www.google.com/';
        try {
            await page0.goto(testurl, { timeout: 10000, waitUntil: 'networkidle0' });
        } catch (e) {
            // just ignore error
        }
        expect(page0.url()).to.eq(testurl);
    }).timeout(12000);

    it('Should Find some cookies', async () => {
        const page = await getBGPage();
        // get Original cookies
        cookies1 = await page.evaluate(() => {
            return new Promise(resolve => (chrome.runtime.onMessage as any).dispatch({ command: 'getCookies', name: '.*' }, null, resolve));
        }) as puppeteer.Cookie[];
        // console.log(`total Cookies Count: ${cookies1.length}`);
        // console.log(cookies1.map(cookie => `${cookie.domain}${cookie.path} ${cookie.name}`).join(', '));
        expect(cookies1.length).to.gt(0);
    });

    it('Should delete those cookies', async () => {
        const page = await getBGPage();
        // delete cookies should return deleted cookies
        const deleted = await page.evaluate(() => {
            return new Promise(resolve => (chrome.runtime.onMessage as any).dispatch({ command: 'deleteCookies', name: '.*' }, null, resolve));
        }) as puppeteer.Cookie[];
        expect(deleted).to.eq(cookies1.length);
        // console.log(deleted + ' cookies deleted');
    });

    it('Should retrieves empty cookies set', async () => {
        const page = await getBGPage();
        // get cookies after delete should be empty
        const cookies3 = await page.evaluate(() => {
            return new Promise(resolve => (chrome.runtime.onMessage as any).dispatch({ command: 'getCookies', name: '.*' }, null, resolve));
        }) as puppeteer.Cookie[];
        expect(cookies3.length).to.eq(0);
    });

    it('Should inject previously retrieved cookies', async () => {
        const page = await getBGPage();
        // push previouly save cookies
        const code = await page.evaluate((cookies) => {
            return new Promise(resolve => (chrome.runtime.onMessage as any).dispatch({ command: 'pushCookies', cookies }, null, resolve));
        }, cookies1 as any as puppeteer.SerializableOrJSHandle);
        expect(code).to.eq('ok');
    });

    it('Should find the same cookies that initialy', async () => {
        const page = await getBGPage();
        // get cookies should be the same
        const cookies4 = await page.evaluate(() => {
            return new Promise(resolve => (chrome.runtime.onMessage as any).dispatch({ command: 'getCookies', name: '.*' }, null, resolve));
        }) as puppeteer.Cookie[];
        // console.log(cookies4.map(cookie => `${cookie.domain}${cookie.path} ${cookie.name}`).join(', '));
        expect(cookies4).to.deep.eq(cookies1);
    });

    it('Should be done', async () => {
        await (await getbrowser()).close();
    });
});
