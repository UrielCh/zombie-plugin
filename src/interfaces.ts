
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
    nbNamedTab: string;
    memoryCacheSize: number;
    // proxy: string;
    userAgent: string;
    anticaptchaClientKey?: string;
}

export interface BackGroundPage extends Window {
    pluginStat: PluginStatValue;
}
