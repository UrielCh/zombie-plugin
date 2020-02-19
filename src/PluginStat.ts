// eslint-disable-next-line no-unused-vars
import { PluginStatValue, BackGroundPage } from './interfaces';

export default function value() {
    const old: PluginStatValue = (window as any as BackGroundPage).pluginStat;
    if (!old) {
        // console.log('Initialize PluginStat instance ', Error('stack'))
        const stats = {
            config: {
                closeIrrelevantTabs: false,
                debuggerStatement: false,
                pauseProcess: false,
                injectProcess: true,
                noClose: false,
                proxyAuth: '' // {username: '', password: '' },
            },
            nbRegistedActionTab: 0,
            nbNamedTab: 0,
            memoryCacheSize: 0,
            proxy: '',
            userAgent: '',
            anticaptchaClientKey: '',
        };
        (window as any as BackGroundPage).pluginStat = stats;
        return stats;
    }
    return old;
}
