import * as tc from '@actions/tool-cache';
import * as core from '@actions/core';
import * as path from 'path';

const toolDownloadUrl = {
    helm: {
        latest: {
            linux: 'https://get.helm.sh/helm-v3.14.4-linux-amd64.tar.gz',
            darwin: 'https://get.helm.sh/helm-v3.14.4-darwin-amd64.tar.gz',
            win32: 'https://get.helm.sh/helm-v3.14.4-windows-amd64.zip'
        }
    }
};
async function fetchTcTool(tool, version = 'latest') {
    // Ensure runner envs exist for tool-cache when running outside GitHub Actions
    if (!process.env.RUNNER_TOOL_CACHE) {
        process.env.RUNNER_TOOL_CACHE = `${process.cwd()}/.runner_tool_cache`;
    }
    if (!process.env.RUNNER_TEMP) {
        process.env.RUNNER_TEMP = `${process.cwd()}/.runner_temp`;
    }
    const platform = process.platform;
    const toolDirectory = tc.find(tool, version, platform);
    if (toolDirectory) {
        core.info(`Tool ${tool} version ${version} is already cached in ${toolDirectory}`);
        core.addPath(toolDirectory);
        return true;
    }
    else {
        core.info(`Tool ${tool} version ${version} is not cached, downloading...`);
    }
    // check if we have a download url for the tool
    if (!toolDownloadUrl[tool]) {
        throw new Error(`No download url found for tool: ${tool}`);
    }
    // check if we have a download url for the current version
    if (!toolDownloadUrl[tool][version]) {
        throw new Error(`No download url found for tool: ${tool} version: ${version}`);
    }
    // check if we have a download url for the current platform
    if (!toolDownloadUrl[tool][version][platform]) {
        throw new Error(`No download url found for tool: ${tool} version: ${version} on platform: ${platform}`);
    }
    // download the tool using tc cache
    let downloadUrl = toolDownloadUrl[tool][version][platform];
    const arch = process.arch;
    const archLabel = arch === 'x64' ? 'amd64' : arch === 'arm64' ? 'arm64' : arch;
    // Replace architecture segment in URL if needed
    downloadUrl = downloadUrl.replace('amd64', archLabel);
    const downloadPath = await tc.downloadTool(downloadUrl);
    const isZip = downloadUrl.endsWith('.zip');
    const extractedPath = isZip
        ? await tc.extractZip(downloadPath)
        : await tc.extractTar(downloadPath);
    const platformName = platform === 'win32' ? 'windows' : platform;
    const binaryDir = path.join(extractedPath, `${platformName}-${archLabel}`);
    const cachedPath = await tc.cacheDir(binaryDir, tool, version);
    core.addPath(cachedPath);
    core.info(`Tool ${tool} version ${version} has been cached in ${cachedPath}`);
    return true;
}

export { fetchTcTool };
//# sourceMappingURL=tools.js.map
