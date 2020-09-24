
/**
 * This part of the conf is saved in plugin storage
 */
export interface PluginSavedState {
    /**
     * Should close unknown tabs
     */
    closeIrrelevantTabs: boolean;
    /**
     * debug injected code
     */
    debuggerStatement: boolean;
    /**
     * pause au process
     */
    pauseProcess: boolean;
    /**
     * block all injection
     */
    injectProcess: boolean;
    /**
     * block all windows closes
     */
    noClose: boolean;
    /**
     * Proxy auth must be save to keep proxy config running between runs
     */
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
    userAgent: string;
    anticaptchaClientKey?: string;
}

export interface BackGroundPage extends Window {
    pluginStat: PluginStatValue;
}

export interface RegisterCommandMessage {
    /**
     * entry point code
     */
    command: string;
    /**
     * starting URL
     */
    url: string;
    /**
     * Whether the new tab should become the active tab in the window. Does not affect whether the window is focused (see windows.update). Defaults to false.
     */
    active?: boolean;
    /**
     * Whether the new tab should be pinned. Defaults to false
     */
    pinned?: boolean;
    /**
     * Used as name for the task
     */
    target: string;
    /**
     * JS To inject only in main frame
     */
    deps: Array<string | string[]>;
    /**
     * CSS To inject only in main frame
     */
    depCss?: string[];
    /**
     * Javascript to inject in all frames
     */
    allDeps?: Array<string | string[]>;
    /**
     * CSS to inject in all frames
     */
    allDepCss?: string[];
    /**
     * action to execute in all iframces
     */
    allAction: string;
    /**
     * action to execute in the main frame
     */
    action: string;
    /**
     * Should close unknown tabs
     */
    closeIrrelevantTabs?: boolean;
    /**
     * should I merge injections
     */
    mergeInject?: boolean;
}

export interface ZTask {
    /**
     * action to execute in the main frame
     */
    action: string;
    /**
     * action to execute in all iframces
     */
    allAction: string;
    /**
     * javascript url to inject
     */
    deps: Array<string | string[]>;
    /**
     * css url to inject
     */
    depCss: string[];
    /**
     * javascript url to inject in all frames
     */
    allDeps: Array<string | string[]>;
    /**
     * css url to inject in all frames
     */
    allDepCss: string[];
    /**
     * inject all JS as a single block
     */
    mergeInject: boolean;
    /**
     * Target named used as task name
     */
    target: string;
}
