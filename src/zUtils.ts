import ChromePromise from '../vendor/chrome-promise';
import { wait } from './common';

const chromep = new ChromePromise();

export default class ZUtils {
    /**
     * refresh page
     */
    public static async refreshTab(tabId: number) {
        const tab: chrome.tabs.Tab = await chromep.tabs.get(tabId);
        try {
            if (!tab)
                throw Error('noTab');
            await chromep.tabs.update(tabId, {
                url: tab.url
            });
            return 'ok';
        } catch (err) {
            return 'err ' + err.message;
        }
    }

    public static isProtected(url?: string) {
        if (!url)
            return false;
        return (~url.indexOf('chrome://')) || (~url.indexOf('127.0.0.1')) || (~url.indexOf('localhost')) || (~url.indexOf('.exs.fr'));
    }

    public static async preventPrompts(tabId: number) {
        try {
            await chromep.tabs.update(tabId, {
                url: 'javascript:window.onbeforeunload = undefined; window.onunload = undefined; window.confirm=function(){return !0}; window.alert=function(){}; window.prompt=function(){return !0};'
            });
            return '';
        } catch (e) {
            return '';
        }
    }

    public static async closeTab(tabId?: number) {
        if (tabId) {
            try {
                await ZUtils.preventPrompts(tabId);
                await chromep.tabs.remove(tabId);
                await wait(1000);
                await chromep.tabs.remove(tabId);
            } catch (e) {
                return 1;
            }
            return 1;
        }
        return 0;
    }

    public static async closeAllTabExept(ignoreId: number) {
        const tabs = await chromep.tabs.query({});
        for (const tab of tabs) {
            const tabId = tab.id;
            if (tabId && tabId !== ignoreId)
                await ZUtils.closeTab(tabId);
        }
    }

    //public static toErr(error: any) {
    //    return { error };
    //}
}
