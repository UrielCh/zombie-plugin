
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

export interface RegisterCommandMessage {
    command: string;
    url: string;
    name?: string;
    active?: boolean;
    pinned?: boolean;
    target: string;
    deps: Array<string | string[]>;
    depCss?: string[];
    action: string;
    closeIrrelevantTabs?: boolean;
}

export interface ZTask {
    /**
     * action to execute
     */
    action: string;
    /**
     * javascript url to inject
     */
    deps: Array<string | string[]>;
    /**
     * css url to inject
     */
    depCss: string[];
    mergeInject?: boolean;
    target: string;
}
