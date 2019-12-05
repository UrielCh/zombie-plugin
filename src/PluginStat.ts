// type ConfigEntry = 'closeIrrelevantTabs' | 'debuggerStatement' | 'pauseProcess';

interface BackGroundPage extends Window {
    pluginStat: PluginStatValue;
}

/**
 * This part of the conf is saved in plugin storage
 */
export interface PluginSavedState {
    closeIrrelevantTabs: boolean;
    debuggerStatement: boolean;
    pauseProcess: boolean;
    injectProcess: boolean;
    noClose: boolean;
    // Proxy auth must be save to keep proxy config running between runs
    proxyAuth: string; // { username: string, password: string };
}
/**
 * Volatile configuration go here
 */
export interface PluginStatValue {
    /**
     * those option are saved in local storage
     */
    config: PluginSavedState;
    nbRegistedActionTab: number;
    nbNamedTab: number;
    memoryCacheSize: number;
    proxy: string;
    userAgent: string;
}

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
        };
        (window as any as BackGroundPage).pluginStat = stats;
        return stats;
    }
    return old;
}
