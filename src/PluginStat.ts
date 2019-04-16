// type ConfigEntry = 'closeIrrelevantTabs' | 'debuggerStatement' | 'pauseProcess';

interface BackGroundPage extends Window {
    pluginStat: PluginStatValue;
}

export interface PluginSavedState {
    closeIrrelevantTabs: boolean,
    debuggerStatement: boolean,
    pauseProcess: boolean,
}

export interface PluginStatValue {
    /**
     * those option are saved in local storage
     */
    config: PluginSavedState,
    nbRegistedActionTab: number;
    nbNamedTab: number;
    memoryCacheSize: number;
    proxy: string;
    proxyAuth?: {username:string, password: string}
    userAgent: string;
}

export default function value() {
    const old: PluginStatValue = (<BackGroundPage>window).pluginStat;
    if (!old) {
        // console.log('Initialize PluginStat instance ', Error('stack'))
        const stats = {
            config: {
                closeIrrelevantTabs: false,
                debuggerStatement: false,
                pauseProcess: false,
            },
            nbRegistedActionTab: 0,
            nbNamedTab: 0,
            memoryCacheSize: 0,
            proxy: '',
            userAgent: '',
        };
        (<BackGroundPage>window).pluginStat = stats;
        return stats;
    }
    return old;
}
