type SupportedTool = 'helm';
export declare function fetchTcTool(tool: SupportedTool, version?: string): Promise<boolean>;
export declare function setupTool(tool: SupportedTool): Promise<boolean>;
export {};
