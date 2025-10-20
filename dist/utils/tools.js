import * as tc from '@actions/tool-cache';
import * as core from '@actions/core';

const toolDownloadUrl = {
    helm: {
        latest: {
            linux: 'https://github.com/helm/helm/releases/latest/download/helm-linux-amd64.tar.gz',
            darwin: 'https://github.com/helm/helm/releases/latest/download/helm-darwin-amd64.tar.gz',
            win32: 'https://github.com/helm/helm/releases/latest/download/helm-windows-amd64.zip'
        }
    }
};
async function fetchTcTool(tool, version = 'latest') {
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
    const downloadUrl = toolDownloadUrl[tool][version][platform];
    const downloadPath = await tc.downloadTool(downloadUrl);
    const extractedPath = await tc.extractTar(downloadPath);
    const cachedPath = await tc.cacheDir(extractedPath, tool, version);
    core.addPath(cachedPath);
    core.info(`Tool ${tool} version ${version} has been cached in ${cachedPath}`);
    return true;
}

export { fetchTcTool };
//# sourceMappingURL=tools.js.map
