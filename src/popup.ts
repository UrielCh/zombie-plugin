import PluginStat, { PluginStatValue } from './PluginStat';
import sendMessage from './SendMessage';

/// <reference path="typings/jquery/jquery.d.ts" />
interface BackGroundPage extends Window {
    pluginStat: PluginStatValue;
}

interface MyJQ extends JQuery<HTMLElement> {
    bootstrapToggle(opt: bootstrapToggleConfig): JQuery<HTMLElement>;
}

$(() => {
    let bg: BackGroundPage | undefined;
    if (chrome.extension)
        bg = (chrome.extension.getBackgroundPage()) as BackGroundPage;
    const pluginStat: PluginStatValue = (bg && bg.pluginStat) ? bg.pluginStat : PluginStat();
    // const chromep = new ChromePromise();
    let lastCode = 'N/A';

    const updateDisplay = () => {
        const data: { [key: string]: any } = {
            tasker_nbRegistedActionTab: pluginStat.nbRegistedActionTab,
            tasker_nbNamedTab: pluginStat.nbNamedTab,
            zFunction_memoryCacheSize: pluginStat.memoryCacheSize,
            tasker_proxy: pluginStat.proxy,
            config_userAgent: pluginStat.userAgent,
            code: lastCode,
            version: 'v' + chrome.runtime.getManifest().version,
        };
        for (const key of Object.keys(data))
            $(`#${key}`).text(data[key]);
    };

    ($('#closeIrrelevantTabs') as MyJQ).prop('checked', pluginStat.config.closeIrrelevantTabs).bootstrapToggle({
        on: '💣',
        off: 'off',
        onstyle: 'danger',
        offstyle: 'secondary',
        size: 'sm',
    });

    ($('#debuggerStatement') as MyJQ).prop('checked', pluginStat.config.debuggerStatement).bootstrapToggle({
        on: '🐛',
        off: 'off',
        onstyle: 'danger',
        offstyle: 'secondary',
        size: 'sm',
    });

    ($('#pauseProcess') as MyJQ).prop('checked', pluginStat.config.pauseProcess).bootstrapToggle({
        off: '<svg style="width:24px;height:24px" viewBox="0 0 24 24"><path fill="#FFF" d="M8,5.14V19.14L19,12.14L8,5.14Z"/></svg>',
        on: '💤', // <svg style="width:24px;height:24px" viewBox="0 0 24 24"><path fill="#FFF" d="M18,18H6V6H18V18Z"/></svg>',
        size: 'sm',
        onstyle: 'danger',
        offstyle: 'success',
    });

    ($('#injectProcess') as MyJQ).prop('checked', pluginStat.config.injectProcess).bootstrapToggle({
        on: 'on',
        off: '🛑',
        onstyle: 'primary',
        offstyle: 'secondary',
        size: 'sm',
    });

    ($('#noClose') as MyJQ).prop('checked', pluginStat.config.noClose).bootstrapToggle({
        on: '🛡️',
        off: 'off',
        onstyle: 'danger',
        offstyle: 'secondary',
        size: 'sm',
    });

    // tasker.config.forEach((value: boolean, key: string) => {
    //    console.log(key, value);
    // });

    for (const elm of ['closeIrrelevantTabs', 'debuggerStatement', 'pauseProcess', 'injectProcess', 'noClose']) {
        const jq = $(`#${elm}`);
        jq.on('change', function () {
            const value = $(this).is(':checked');
            // Can be fix with moderne TS
            // tasker.config[elm] = value;
            (pluginStat.config as any)[elm] = value;
            sendMessage({
                command: 'updateBadge',
            });
        });
    }
    updateDisplay();

    const flushCache = () => {
        // console.log('flushCache');
        sendMessage({
            command: 'flushCache',
        });
    };

    const flushProxy = () => {
        // console.log('setProxy');
        sendMessage({
            command: 'setProxy',
        });
    };

    const readQrCode = () => {
        // console.log('readQrCode');
        sendMessage({
            command: 'readQrCode',
        }).then((result) => {
            console.log(result);
            if (result.error)
                lastCode = 'error:' + JSON.stringify(result.error);
            else
                lastCode = result[0].text;
            updateDisplay();
        });
    };
    $('button[action="flushCache"]').on('click', flushCache);
    $('button[action="flushProxy"]').on('click', flushProxy);
    $('button[action="readQrCode"]').on('click', readQrCode);
    $('button[action="log"]').on('click', () => {
        console.log(pluginStat);
    });
});
