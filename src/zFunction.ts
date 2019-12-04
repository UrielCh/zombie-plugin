import ChromePromise from '../vendor/chrome-promise';
import PluginStat, { PluginStatValue } from './PluginStat';

const pluginStat: PluginStatValue = PluginStat();

const chromep = new ChromePromise();
interface CacheHttpData {
    url: string;
    data: any;
    lastUpdated: number;
}

const filterJs = (code: string) => {
    // remove all sourceMapping
    code = code.replace('//# sourceMappingURL=', '//');
    // remove ES6 import
    code = code.replace(/import\s+[0-9A-Za-z_-]+\s+from\s+['"][./0-9A-Za-z_-]+['"]\s*;?/g, '');
    // remore import { debug } from 'util';
    code = code.replace(/import\s+\{[^}]+\}\s+from\s+['"][./0-9A-Za-z_-]+['"]\s*;?/g, '');
    code = code.replace(/export\s+default\s+[^;]+;?/g, '');
    code = code.replace(/export\s+/g, '');
    // remove automatique import
    code = code.replace(/import\s+[^ ]+\s*=\s*require\([^)]+\);?/g, '');
    // export default code;
    // console.log("eval return " + code);
    return code;
};

const wait = (duration: number) => new Promise(resolve => setTimeout(() => (resolve()), duration));

export default class ZFunction {

    public static flat(urls: Array<string | string[]>) {
        let urlsFlat: string[] = [];
        for (const elm of urls)
            if (Array.isArray(elm))
                urlsFlat = [...urlsFlat, ...elm];
            else
                urlsFlat = [...urlsFlat, elm];
        return urlsFlat;
    }

    private static _instance: ZFunction;
    private memoryCache: { [key: string]: CacheHttpData } = {};

    public static get Instance() {
        // Do you need arguments? Make it a regular method instead.
        return this._instance || (this._instance = new this());
    }

    private constructor() {
    }

    public async injectJS(tabId: number, urls: Array<string | string[]>) {
        if (urls.length === 0)
            return 'no more javascript to inject';
        const urlsFlat: string[] = ZFunction.flat(urls);
        try {
            const responsesMetadata = await this.httpGetAll(urlsFlat);
            const responsesMap: {
                [key: string]: string;
            } = {};
            responsesMetadata.forEach((responseMetadata) => responsesMap[responseMetadata.url] = filterJs(responseMetadata.data));
            // Sort by the order the URLs received
            // Group scripts and inject them
            for (const elm of urls) {
                let responses: string;
                if (Array.isArray(elm))
                    responses = elm.map(url => `// from: ${url}\r\n${responsesMap[url]}`).join('\r\n');
                else
                    responses = `// from: ${elm}\r\n${responsesMap[elm]}`;
                await ZFunction._instance.injectJavascript(tabId, responses);
            }
        } catch (error) {
            console.log('httpGetAll ', urls, 'fail error', error);
        }
    }

    /**
     * @param {number} tabId
     * @param {string[]} depCss
     * https://developer.chrome.com/extensions/tabs#method-insertCSS
     * @return {Promise<any>}
     */
    public async injectCSS(tabId: number, depCss: string[]): Promise<any> {
        const self = this;
        if (!depCss || !depCss.length)
            return 'injectCSS fini';
        const code = await ZFunction._instance.httpGetCached(depCss[0]);
        const opt = {
            allFrames: false,
            code: code.data
        };
        await chromep.tabs.insertCSS(tabId, opt);
        await self.injectCSS(tabId, depCss.slice(1));
    }

    public async httpQuery(url: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', postData?: any) {
        // jQuery 3+
        // dataType: 'json',
        const data: string = postData ? JSON.stringify(postData) : '';
        return jQuery.ajax({
            contentType: 'application/json',
            data,
            type: method,
            url
        });
    }

    public async getHttp(url: string) {
        return this.httpQuery(url, 'GET');
    }

    public postJSON(url: string, data: any) {
        return this.httpQuery(url, 'POST', data).then((response) => {
            if (!response)
                return {};
            if (typeof (response) === 'string')
                try {
                    return JSON.parse(response);
                } catch (ex) {
                    return response; // return Promise.reject(ex);
                }
            return response;
        });
    }

    public injectJavascript(tabId: number, code: string) {
        return chromep.tabs.executeScript(tabId, {
            allFrames: false,
            code
        });
    }

    public httpGetAll(urls: string[]) {
        return Promise.all(urls.map(ZFunction._instance.httpGetCached));
    }
    /**
     * @param {string} url
     */
    public httpGetCached(url: string) {
        return ZFunction._instance.httpGetPromise(url, true);
    }
    public flush() {
        this.memoryCache = {};
        pluginStat.memoryCacheSize = 0;
        return Promise.resolve();
    }
    /**
     * @param {string} url
     * @param {boolean} [usecache]
     */
    public async httpGetPromise(url: string, usecache?: boolean): Promise<CacheHttpData> {
        const self: ZFunction = this;
        const key: string | null = this.getKeyFromUrl(url);
        if (usecache && key) {
            const value: CacheHttpData = this.memoryCache[key];
            // 20 minute
            const limit = Date.now() - 60000 * 40;
            if (value && value.lastUpdated > limit)
                return value;
            else {
                const val: CacheHttpData = await this.httpGetPromise(url, false);
                if (key) {
                    self.memoryCache[key] = value;
                    pluginStat.memoryCacheSize = Object.keys(self.memoryCache).length;
                }
                return val;
            }
        }
        const retries = 5;
        let counter = 0;
        while (true) {
            counter++;
            try {
                const data = await self.getHttp(url);
                const value = {
                    data,
                    lastUpdated: Date.now(),
                    url
                };
                return value;
            } catch (error) {
                if (counter > retries)
                    throw Error(`giving url ${url} up after ${retries} retries`);
                await wait(1000);
            }
        }
    }
    /**
     * @param cookieDomain {string}
     * @param cookieName {string}
     */
    public async popCookies(cookieDomain: string, cookieName: string) {
        const self: ZFunction = this;
        /** @type {chrome.cookies.Cookie[]} */
        let cookies: chrome.cookies.Cookie[] = [];
        cookies = await this.getCookies(cookieDomain, cookieName);
        await self.deleteCookiesSelection(cookies);
        return cookies;
    }
    /**
     * delete cookies matching cookieDomain and cookieName regexp
     * return deleted cookies count
     * @param cookieDomain {string}
     * @param cookieName {string}
     */
    public async deleteCookies(cookieDomain: string, cookieName: string) {
        const cookies = await this.getCookies(cookieDomain, cookieName);
        return await this.deleteCookiesSelection(cookies);
    }
    /**
     * get mattring cookie and return them as promise
     * @param cookieDomain {string}
     * @param cookieName {string}
     */
    public async getCookies(cookieDomain: string, cookieName: string) {
        /**
         * @type {RegExp|null}
         */
        let regDomain: RegExp | null = null;
        if (cookieDomain)
            regDomain = RegExp(cookieDomain, 'i');

        /**
         * @type {RegExp|null}
         */
        let regName: RegExp | null = null;
        if (cookieName)
            regName = RegExp(cookieName, 'i');
        /**
         * @type {chrome.cookies.Cookie[]}
         */
        const coos: chrome.cookies.Cookie[] = [];

        const cookies: chrome.cookies.CookieStore[] = await chromep.cookies.getAllCookieStores();
        for (const cookie of cookies) {
            const cookies2 = await chromep.cookies.getAll({
                storeId: cookie.id
            });
            for (const c of cookies2) {
                if (regDomain && !regDomain.test(c.domain))
                    continue;
                if (regName && !regName.test(c.name))
                    continue;
                coos.push(c);
            }
        }
        return coos;
    }
    /**
     */
    public async pushCookies(cookies: chrome.cookies.Cookie[]) {
        cookies = cookies || [];
        for (const c of cookies)
            await chromep.cookies.set({
                domain: c.domain,
                expirationDate: c.expirationDate,
                httpOnly: c.httpOnly,
                name: c.name,
                path: c.path,
                secure: c.secure,
                url: ((c.secure) ? 'https://' : 'http://') + c.domain + c.path,
                value: c.value
            });
        return 'ok';
    }

    // private
    private async deleteCookiesSelection(coos: chrome.cookies.Cookie[]) {
        let cnt = 0;
        for (const coo of coos) {
            const url = ((coo.secure) ? 'https://' : 'http://') + coo.domain + coo.path;
            const name = coo.name;
            await chromep.cookies.remove({
                name,
                url
            });
            ++cnt;
        }
        return cnt;
    }

    private getKeyFromUrl(url: string) {
        return (url.indexOf('?') >= 0) ? null : url;
    }
}
