import ChromePromise from '../vendor/chrome-promise/chrome-promise';
const chromep = new ChromePromise();

export default class ZUtils {
    /**
     * refresh page
     */
    public static async refreshTab(tabId: number): Promise<string> {
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

    public static isProtected(url?: string): boolean {
        if (!url)
            return false;
        return !!((~url.indexOf('chrome://')) || (~url.indexOf('127.0.0.1')) || (~url.indexOf('localhost')) || (~url.indexOf('.exs.fr')));
    }

    public static async preventPrompts(tabId: number): Promise<boolean> {
        try {
            await chromep.tabs.update(tabId, {
                url: 'javascript:window.onbeforeunload = undefined; window.onunload = undefined; window.confirm=function(){return !0}; window.alert=function(){}; window.prompt=function(){return !0};'
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    public static async closeTab(tabId: number): Promise<void> {
        await ZUtils.preventPrompts(tabId);
        await chromep.tabs.remove(tabId);
        setTimeout(() => chromep.tabs.remove(tabId)
            .catch(() => { }), 1000);
    }

    public static async closeAllTabExept(ignoreId: number): Promise<void> {
        const tabs = await chromep.tabs.query({});
        for (const tab of tabs) {
            const tabId = tab.id;
            if (tabId && tabId !== ignoreId)
                await ZUtils.closeTab(tabId);
        }
    }

}
