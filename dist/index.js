import { run } from './main.js';

/**
 * The entrypoint for the action. This file simply imports and runs the action's
 * main logic.
 */
/* eslint-disable-next-line no-unused-vars */
run();
//# sourceMappingURL=index.js.map
tions/exec';
import * as tc from '@actions/tool-cache';
import * as yaml from 'js-yaml';
import _ from 'lodash';

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

async function generateValuesYaml(applicationName, environment, sourceRepo, sourceOrg, sourceBranch, customValues) {
    // define defaultValues YAML object as a JSON object
    const defaultValues = {
        applicationName: `${applicationName}-${environment}`,
        application: {
            destination: {
                namespace: applicationName
            },
            source: {
                repoURL: `https://github.com/${sourceOrg}/${sourceRepo}.git`,
                targetRevision: sourceBranch,
                path: `${applicationName}/${environment}/`
            }
        }
    };
    // if customValues is not provided, return defaultValues
    if (!customValues) {
        return yaml.dump(defaultValues);
    }
    // parse customValues as YAML object
    try {
        const customValuesYaml = yaml.load(customValues);
        // merge defaultValues and customValues using lodash merge
        const mergedValues = _.merge(defaultValues, customValuesYaml);
        return yaml.dump(mergedValues);
    }
    catch (error) {
        throw new Error(`Invalid custom values YAML: ${error}`);
    }
}
async function generateArgoCDAppManifest(applicationName, environment, customValuesYaml, argoCDAppHelmChart) {
    // download helm tool using tc cache
    await fetchTcTool('helm');
    // store custom values yaml in a temporary file
    const customValuesFilePath = path.join(os.tmpdir(), 'custom-values.yaml');
    await fs.promises.writeFile(customValuesFilePath, customValuesYaml);
    // resolve and validate path to the helm chart
    const baseDir = path.dirname(new URL(import.meta.url).pathname);
    const resolvedChartPath = path.isAbsolute(argoCDAppHelmChart)
        ? argoCDAppHelmChart
        : path.resolve(baseDir, argoCDAppHelmChart);
    const chartYamlPath = path.join(resolvedChartPath, 'Chart.yaml');
    try {
        await fs.promises.readFile(chartYamlPath);
    }
    catch {
        throw new Error(`we cant find helm chart in path given: ${chartYamlPath}`);
    }
    // capture stdout from helm template command
    let stdout = '';
    let stderr = '';
    const options = {
        listeners: {
            stdout: (data) => {
                stdout += data.toString();
            },
            stderr: (data) => {
                stderr += data.toString();
            }
        }
    };
    // render the manifest using helm template
    const exitCode = await exec.exec('helm', [
        'template',
        applicationName,
        resolvedChartPath,
        '-f',
        customValuesFilePath
    ], options);
    if (exitCode !== 0) {
        throw new Error(`helm template failed with exit code ${exitCode}: ${stderr}`);
    }
    return stdout.trim();
}

/**
 * Parse the repository information from input.
 *
 * @param {string} repository - The repository string to parse
 * @returns {Object} Object containing gitopsOrg and gitopsRepoName
 */
function parseRepositoryInfo(repository) {
    let gitopsOrg = '';
    let gitopsRepoName = '';
    if (repository.includes('/')) {
        // If repository contains a slash, split it to get org and repo name
        const parts = repository.split('/');
        gitopsOrg = parts[0];
        gitopsRepoName = parts[1];
        core.debug(`Using provided repository: ${gitopsOrg}/${gitopsRepoName}`);
    }
    else {
        // If not, use the current repository's owner as the org
        gitopsOrg = github.context.repo.owner;
        gitopsRepoName = repository;
        core.debug(`Using context owner: ${gitopsOrg}/${gitopsRepoName}`);
    }
    return { gitopsOrg, gitopsRepoName };
}
/**
 * Clone GitOps repository
 *
 * @param {string} token - GitHub token
 * @param {string} org - GitHub organization
 * @param {string} repo - Repository name
 * @param {string} branch - Branch name (optional)
 * @param {string} directory - Directory to clone into
 * @returns {Promise<void>}
 */
async function cloneGitOpsRepo(token, org, repo, branch, directory) {
    try {
        // Clone the GitOps repository
        const cloneUrl = `https://x-access-token:${token}@github.com/${org}/${repo}.git`;
        await exec.exec('git', ['clone', cloneUrl, directory]);
        // Checkout the target branch if specified, create it if it doesn't exist
        if (branch) {
            try {
                await exec.exec('git', ['checkout', branch], { cwd: directory });
            }
            catch (error) {
                core.debug(`Branch ${branch} doesn't exist, creating new branch`);
                await exec.exec('git', ['checkout', '-b', branch], { cwd: directory });
            }
        }
        // Configure Git user for commits
        await exec.exec('git', ['config', 'user.name', 'GitHub Action'], {
            cwd: directory
        });
        await exec.exec('git', ['config', 'user.email', 'action@github.com'], {
            cwd: directory
        });
        core.debug(`Successfully cloned ${org}/${repo} to ${directory}`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to clone GitOps repository: ${message}`);
    }
}
/**
 * Commit and push changes to GitOps repository
 *
 * @param {string} directory - GitOps repository directory
 * @param {string} applicationName - Application name
 * @param {string} environment - Environment name
 * @param {string} branch - Branch name (optional)
 * @returns {Promise<void>}
 */
async function commitAndPush(directory, applicationName, environment, branch) {
    try {
        // Add changes
        await exec.exec('git', ['add', '.'], { cwd: directory });
        // Create commit
        const commitMessage = `Update ${applicationName} ApplicationSet for ${environment} environment`;
        await exec.exec('git', ['commit', '-m', commitMessage], { cwd: directory });
        // Push changes
        const pushBranch = branch || 'HEAD';
        await exec.exec('git', ['push', 'origin', pushBranch], { cwd: directory });
        core.debug(`Successfully pushed changes to ${pushBranch}`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to commit and push changes: ${message}`);
    }
}

/**
 * The main function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
    let gitOpsRepoLocalPath = '';
    try {
        // Get inputs
        let gitopsRepository = core.getInput('gitops-repository', {
            required: false
        });
        // If gitops-repository is not provided via input, check environment variable
        if (!gitopsRepository) {
            gitopsRepository = process.env.GITOPS_REPOSITORY || '';
            if (!gitopsRepository) {
                throw new Error('gitops-repository input or GITOPS_REPOSITORY environment variable must be provided');
            }
        }
        const gitopsToken = core.getInput('gitops-token', { required: true });
        const gitopsBranch = core.getInput('gitops-branch', { required: false }) || 'main';
        const environment = core.getInput('environment', { required: true });
        const argoCDAppHelmChart = core.getInput('argocd-app-helm-chart', { required: false }) ||
            '../templates/helm/argocd-app';
        const applicationName = core.getInput('application-name') || github.context.repo.repo;
        const applicationManifestsPath = core.getInput('application-manifests-path', { required: true });
        // Parse repository information
        const { gitopsOrg, gitopsRepoName } = parseRepositoryInfo(gitopsRepository);
        core.debug(`Repository parsed as: ${gitopsOrg}/${gitopsRepoName}`);
        // Mask the token to prevent it from being logged
        core.setSecret(gitopsToken);
        core.debug('Token has been masked in logs');
        // Log information (debug only)
        core.debug(`Git Organization: ${gitopsOrg}`);
        core.debug(`Git Repository: ${gitopsRepoName}`);
        core.debug(`Git Branch: ${gitopsBranch || '[Using default branch]'}`);
        core.debug(`Environment: ${environment}`);
        core.debug(`Application Name: ${applicationName}`);
        core.notice(`We are going to push [${environment}] ArgoCD ApplicationSet for [${applicationName}] to [${gitopsOrg}/${gitopsRepoName}] on the branch [${gitopsBranch || '[Using default branch]'}].`);
        // 0. Clone GitOps Repository, ensure it is a temporary directory and empty
        gitOpsRepoLocalPath = path.join(os.tmpdir(), `gitops-repo-${Date.now()}`);
        await io.rmRF(gitOpsRepoLocalPath);
        await io.mkdirP(gitOpsRepoLocalPath);
        // Clone the GitOps repository
        await cloneGitOpsRepo(gitopsToken, gitopsOrg, gitopsRepoName, gitopsBranch, gitOpsRepoLocalPath);
        // 1. Create ArgoCD Manifest
        // Prepare template data for the ApplicationSet manifest
        const customValues = core.getInput('custom-values', { required: false }) || '';
        const valuesYaml = await generateValuesYaml(applicationName, environment, gitopsRepoName, gitopsOrg, gitopsBranch, customValues);
        // Generate the manifest file
        const argocdAppManifest = await generateArgoCDAppManifest(applicationName, environment, valuesYaml, argoCDAppHelmChart);
        // 1c. Save argocd app manifest to a file
        const appDir = path.join(gitOpsRepoLocalPath, 'argocd-apps', applicationName);
        await io.mkdirP(appDir);
        await fs.promises.writeFile(path.join(appDir, `${environment}.yml`), argocdAppManifest);
        // 2. Copy application manifests to GitOps repository (skipped)
        // 3. Post Summary to GitHub Step Summary
        // 3a. Summary of the ArgoCD ApplicationSet
        // 3b. Summary of the files copied to GitOps repository
        // Commit and push changes
        await commitAndPush(gitOpsRepoLocalPath, applicationName, environment, gitopsBranch);
        core.info(`✅ Successfully updated ApplicationSet for ${applicationName} in ${environment} environment`);
        // Set outputs for other workflow steps to use
        core.setOutput('time', new Date().toTimeString());
    }
    catch (error) {
        // Clean up the temporary directory
        try {
            await io.rmRF(gitOpsRepoLocalPath);
        }
        catch (cleanupError) {
            // Ignore cleanup errors
            core.debug(`Failed to clean up directory: ${cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError)}`);
        }
        // Fail the workflow run if an error occurs
        if (error instanceof Error)
            core.setFailed(error.message);
    }
}

/**
 * The entrypoint for the action. This file simply imports and runs the action's
 * main logic.
 */
/* eslint-disable-next-line no-unused-vars */
run();
//# sourceMappingURL=index.js.map
