import ChromePromise from '../vendor/chrome-promise';
import PluginStat from './PluginStat';
import { wait } from './common';
// eslint-disable-next-line no-unused-vars
import { PluginStatValue } from './interfaces';

const pluginStat: PluginStatValue = PluginStat();

const chromep = new ChromePromise();
interface CacheHttpData {
    url: string;
    data: any;
    lastUpdated: number;
}

interface CookiesFilter {
    domain?: string;
    name?: string;
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

    public async injectJS(tabId: number, urls: Array<string | string[]>, jsBootstrap: string, mergeInject?: boolean) {
        if (urls.length === 0)
            return 'no more javascript to inject';
        const urlsFlat: string[] = ZFunction.flat(urls);
        let lastJs = '';
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
                if (mergeInject !== false) {
                    lastJs += responses;
                } else {
                    await ZFunction._instance.injectJavascript(tabId, responses);
                }
            }
        } catch (error) {
            console.log('httpGetAll ', urls, 'fail error', error);
        }
        if (jsBootstrap) {
            lastJs += jsBootstrap;
        }
        await ZFunction._instance.injectJavascript(tabId, lastJs);
    }

    /**
     * https://developer.chrome.com/extensions/tabs#method-insertCSS
     */
    public async injectCSS(tabId: number, depCss: string[]): Promise<any> {
        for (const dep of depCss) {
            const code = await ZFunction._instance.httpGetCached(dep);
            const opt = {
                allFrames: false,
                code: code.data
            };
            await chromep.tabs.insertCSS(tabId, opt);
        }
    }

    public async httpQuery(url: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', postData?: any) {
        // jQuery 3+
        // dataType: 'json',
        const data: string = postData ? JSON.stringify(postData) : '';
        const response = await jQuery.ajax({
            contentType: 'application/json',
            data,
            type: method,
            url
        });
        return response;
    }

    public async getHttp(url: string) {
        return this.httpQuery(url, 'GET');
    }

    public async deleteHttp(url: string) {
        return this.httpQuery(url, 'DELETE');
    }

    public async postJSON(url: string, data: any) {
        return this.httpQuery(url, 'POST', data).then((response) => {
            if (!response)
                return {};
            if (typeof (response) === 'string')
                try {
                    return JSON.parse(response);
                } catch (ex) {
                    return response;
                }
            return response;
        });
    }

    public async injectJavascript(tabId: number, code: string) {
        const injection = await chromep.tabs.executeScript(tabId, {
            allFrames: false,
            code
        });
        return injection;
    }

    public async httpGetAll(urls: string[]) {
        return Promise.all(urls.map(ZFunction._instance.httpGetCached));
    }
    /**
     * @param {string} url
     */
    public async httpGetCached(url: string) {
        return ZFunction._instance.httpGetPromise(url, true);
    }
    public async flush() {
        this.memoryCache = {};
        pluginStat.memoryCacheSize = 0;
        return 'ok';
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
                const value: CacheHttpData = await this.httpGetPromise(url, false);
                if (key) {
                    self.memoryCache[key] = value;
                    pluginStat.memoryCacheSize = Object.keys(self.memoryCache).length;
                }
                return value;
            }
        }
        const retries = 5;
        let counter = 0;
        // eslint-disable-next-line no-constant-condition
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
    public async popCookies(filter: CookiesFilter) {
        let cookies: chrome.cookies.Cookie[] = [];
        cookies = await this.getCookies(filter);
        await this.deleteCookiesSelection(cookies);
        return cookies;
    }
    /**
     * Selete cookies matching cookieDomain and cookieName regexp
     * return deleted cookies count
     */
    public async deleteCookies(filter: CookiesFilter) {
        return this.getCookies(filter).then(cookies => this.deleteCookiesSelection(cookies));
        // const cookies = await this.getCookies(filter);
        // return await this.deleteCookiesSelection(cookies);
    }
    /**
     * get mattring cookie and return them as promise
     */
    public async getCookies(filter: CookiesFilter) {
        let regDomain: RegExp | null = null;
        if (filter.domain)
            regDomain = RegExp(filter.domain, 'i');

        let regName: RegExp | null = null;
        if (filter.name)
            regName = RegExp(filter.name, 'i');
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
        if (!cookies.length)
            return 'ok';
        try {
            for (const c of cookies) {
                const domain = c.domain.replace(/^\./, '');
                const cookieData = {
                    domain,
                    expirationDate: c.expirationDate,
                    httpOnly: c.httpOnly,
                    name: c.name,
                    path: c.path,
                    secure: c.secure,
                    url: ((c.secure) ? 'https://' : 'http://') + domain + c.path,
                    value: c.value
                };
                // Since Chrome 51.
                const { sameSite } = (c as any);
                if (sameSite)
                    (cookieData as any).sameSite = sameSite;
                try {
                    await chromep.cookies.set(cookieData);
                } catch (e) {
                    console.log('failed to push Cookie', cookieData, e);
                }
            }
        } catch (e) {
            console.log('Failed to Push Cookies');
            // eslint-disable-next-line no-debugger
            debugger;
        }
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
