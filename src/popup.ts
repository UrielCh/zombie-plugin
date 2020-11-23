// eslint-disable-next-line no-unused-vars
import PluginStat from './PluginStat';

// eslint-disable-next-line no-unused-vars
import { PluginStatValue, PluginSavedState, BackGroundPage } from './interfaces';

import sendMessage from './SendMessage';

/// <reference path="typings/jquery/jquery.d.ts" />

type ConfigKey = keyof PluginSavedState;

interface MyJQ extends JQuery<HTMLElement> {
    // eslint-disable-next-line no-unused-vars
    bootstrapToggle(options: bootstrapToggleConfig): JQuery<HTMLElement>;
}

jQuery(async () => {
    let bg: BackGroundPage | undefined;
    if (chrome.extension)
        bg = (chrome.extension.getBackgroundPage()) as BackGroundPage;
    const pluginStat: PluginStatValue = (bg && bg.pluginStat) ? bg.pluginStat : PluginStat();
    let proxyInfo: { proxy?: string, auth?: string };
    let lastCode = 'N/A';

    /**
     * update html Data using jQuery
     */
    const updateDisplay = () => {
        let tasker_proxy = '';
        if (proxyInfo.proxy)
            tasker_proxy = proxyInfo.proxy;
        if (proxyInfo.auth)
            tasker_proxy += '<br>' + proxyInfo.auth;
        const data: { [key: string]: any } = {
            tasker_nbRegistedActionTab: pluginStat.nbRegistedActionTab,
            tasker_nbNamedTab: pluginStat.nbNamedTab,
            zFunction_memoryCacheSize: pluginStat.memoryCacheSize,
            tasker_proxy, 
            config_userAgent: pluginStat.userAgent,
            code: lastCode,
            version: 'v' + chrome.runtime.getManifest().version,
        };
        for (const key of Object.keys(data)) {
            jQuery(`#${key}`).text(data[key]);
        }
    };

    /**
     * reload data form extention
     */
    async function reloadConfig() {
        proxyInfo = await sendMessage({
            command: 'getProxy',
        });
        updateDisplay();
    }
    await reloadConfig();
    /**
     * config buttons styles
     */
    (jQuery('#closeIrrelevantTabs') as MyJQ).prop('checked', pluginStat.config.closeIrrelevantTabs).bootstrapToggle({
        on: '💣',
        off: 'off',
        onstyle: 'danger',
        offstyle: 'secondary',
        size: 'sm',
    });

    (jQuery('#debuggerStatement') as MyJQ).prop('checked', pluginStat.config.debuggerStatement).bootstrapToggle({
        on: '🐛',
        off: 'off',
        onstyle: 'danger',
        offstyle: 'secondary',
        size: 'sm',
    });

    (jQuery('#pauseProcess') as MyJQ).prop('checked', pluginStat.config.pauseProcess).bootstrapToggle({
        off: '<svg style="width:24px;height:24px" viewBox="0 0 24 24"><path fill="#FFF" d="M8,5.14V19.14L19,12.14L8,5.14Z"/></svg>',
        on: '💤', // <svg style="width:24px;height:24px" viewBox="0 0 24 24"><path fill="#FFF" d="M18,18H6V6H18V18Z"/></svg>',
        size: 'sm',
        onstyle: 'danger',
        offstyle: 'success',
    });

    (jQuery('#injectProcess') as MyJQ).prop('checked', pluginStat.config.injectProcess).bootstrapToggle({
        on: 'on',
        off: '🛑',
        onstyle: 'primary',
        offstyle: 'secondary',
        size: 'sm',
    });

    (jQuery('#noClose') as MyJQ).prop('checked', pluginStat.config.noClose).bootstrapToggle({
        on: '🛡️',
        off: 'off',
        onstyle: 'danger',
        offstyle: 'secondary',
        size: 'sm',
    });

    // tasker.config.forEach((value: boolean, key: string) => {
    //    console.log(key, value);
    // });

    /**
     * config buttons actions
     */
    for (const elm of ['closeIrrelevantTabs', 'debuggerStatement', 'pauseProcess', 'injectProcess', 'noClose'] as ConfigKey[]) {
        const jq = jQuery(`#${elm}`);
        jq.on('change', function () {
            const value = jQuery(this).is(':checked');
            // Can be fix with moderne TS
            // tasker.config[elm] = value;
            (pluginStat.config as any)[elm] = value;
            void sendMessage({
                command: 'updateBadge',
            });
        });
    }
    updateDisplay();

    const flushCache = async () => {
        // console.log('flushCache');
        await sendMessage({
            command: 'flushCache',
        });
        updateDisplay();
    };

    const flushProxy = async () => {
        // console.log('setProxy');
        await sendMessage({
            command: 'setProxy',
        });
        await reloadConfig();
    };

    const readQrCode = async () => {
        // console.log('readQrCode');
        const result = await sendMessage({
            command: 'readQrCode',
        });
        console.log(result);
        if (result.error)
            lastCode = 'error:' + JSON.stringify(result.error);
        else
            lastCode = result[0].text;
        updateDisplay();
    };

    jQuery('button[action="flushCache"]').on('click', flushCache);
    jQuery('button[action="flushProxy"]').on('click', flushProxy);
    jQuery('button[action="readQrCode"]').on('click', readQrCode);
    jQuery('button[action="log"]').on('click', () => {
        console.log(pluginStat);
    });
});
