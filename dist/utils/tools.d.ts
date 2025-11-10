import type { ExecOptions } from '@actions/exec';
type SupportedTool = 'helm';
export declare function fetchTcTool(tool: SupportedTool, version?: string): Promise<boolean>;
export declare function setupTool(tool: SupportedTool): Promise<boolean>;
export declare function execWithOutput(command: string, args: string[], options?: ExecOptions): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
}>;
export {};
