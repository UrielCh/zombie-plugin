import ChromePromise from "../vendor/chrome-promise";

const chromep = new ChromePromise();

export default class ZUtils {
    /**
    * @param {number} tabId
    */
    public static refreshTab(tabId: number) {
        console.log(`refreshingTab tabId:${tabId}`);
        /**
         * @type Promise<chrome.tabs.Tab>
         */
        let promise = chromep.tabs.get(tabId);

        promise.then((tab) => {
            if (!tab)
                return Promise.reject('noTab');
            console.log('refreshTab', tabId, tab.url);
            if (!tab || !tab.url)
                return Promise.reject('noTab');
            return chromep.tabs.update(tabId, {
                url: tab.url
            });
        }).then(() => 'ok', (err) => 'err ' + err);
    }

    /**
     */
    public static isProtected(url?: string) {
        if (!url) {
            return false;
        }
        return (~url.indexOf('chrome://')) || (~url.indexOf('127.0.0.1')) || (~url.indexOf('localhost')) || (~url.indexOf('.exs.fr'));
    };

    /**
     * @param name {string}
     */
    public static catchPromise(name: string) {
        return (error: Error) => {
            console.log(name, 'promise Failure', error)
        };
    }

    /**
     * @param {number} tabId
     */
    public static preventPrompts(tabId: number) {
        return chromep.tabs.update(tabId, {
            url: 'javascript:window.onbeforeunload = undefined; window.onunload = undefined; window.confirm=function(){return !0}; window.alert=function(){}; window.prompt=function(){return !0};'
        }).then(() => '', () => '');
    };

    /**
     * @param {number} tabId
     */
    public static closeTab(tabId: number) {
        return this.preventPrompts(tabId)
            .then(() => chromep.tabs.remove(tabId))
            .then(() => setTimeout(() => chromep.tabs.remove(tabId)
                .catch(() => { }), 1000));
    }

    /**
     * @param {number} ignoreId
     */
    public static closeAllTabExept(ignoreId: number) {
        const self = this;
        return chromep.tabs.query({})
            .then(tabs => {
                for (let i = 0; i < tabs.length; i++) {
                    const tabId = tabs[i].id;
                    if (tabId && tabId != ignoreId)
                    ZUtils.closeTab(tabId);
                }
            })
    };

    /**
    * @param error {any}
    */
   public static toErr(error: any) {
        return { error }
    };

}