import * as exec from '@actions/exec';
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';
import * as io from '@actions/io';

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
 * @param {string} argocdAppManifestContent - ArgoCD application manifest content
 * @param {string} applicationManifestsPath - Path to application manifests directory
 * @returns {Promise<void>}
 */
async function commitAndPush(directory, applicationName, environment, branch, argocdAppManifestContent, applicationManifestsPath) {
    try {
        // Create the target directory structure: applicationName/environment/
        const targetDir = path.join(directory, applicationName, environment);
        await io.mkdirP(targetDir);
        core.debug(`Created directory: ${targetDir}`);
        // Write the ArgoCD application manifest to the target directory
        const argocdManifestPath = path.join(targetDir, 'application.yaml');
        await fs.promises.writeFile(argocdManifestPath, argocdAppManifestContent);
        core.debug(`Wrote ArgoCD manifest to: ${argocdManifestPath}`);
        // Copy application manifests from applicationManifestsPath to target directory
        if (fs.existsSync(applicationManifestsPath)) {
            const files = await fs.promises.readdir(applicationManifestsPath, {
                withFileTypes: true
            });
            for (const file of files) {
                const sourcePath = path.join(applicationManifestsPath, file.name);
                const destPath = path.join(targetDir, file.name);
                if (file.isDirectory()) {
                    // Recursively copy directory
                    await io.cp(sourcePath, destPath, { recursive: true });
                    core.debug(`Copied directory: ${sourcePath} -> ${destPath}`);
                }
                else {
                    // Copy file
                    await io.cp(sourcePath, destPath);
                    core.debug(`Copied file: ${sourcePath} -> ${destPath}`);
                }
            }
        }
        else {
            core.warning(`Application manifests path does not exist: ${applicationManifestsPath}`);
        }
        // Add changes
        await exec.exec('git', ['add', '.'], { cwd: directory });
        // Check if there are any changes to commit
        let hasChanges = false;
        await exec
            .exec('git', ['diff', '--cached', '--quiet'], {
            cwd: directory,
            ignoreReturnCode: true,
            listeners: {
                stdout: () => { },
                stderr: () => { },
                errline: () => { }
            }
        })
            .then(() => {
            hasChanges = false;
        }, () => {
            hasChanges = true;
        });
        if (!hasChanges) {
            core.info('No changes to commit');
            return;
        }
        // Create commit with detailed message
        const commitMessage = `Deploy ${applicationName} to ${environment}

Updated deployment manifests for ${applicationName} in ${environment} environment.
- ArgoCD application manifest
- Application manifests from ${path.basename(applicationManifestsPath)}`;
        await exec.exec('git', ['commit', '-m', commitMessage], { cwd: directory });
        // Push changes with retry logic
        const pushBranch = branch || 'HEAD';
        const maxRetries = 4;
        const retryDelays = [2000, 4000, 8000, 16000]; // exponential backoff in ms
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                await exec.exec('git', ['push', '-u', 'origin', pushBranch], {
                    cwd: directory
                });
                core.debug(`Successfully pushed changes to ${pushBranch}`);
                return;
            }
            catch (error) {
                if (attempt < maxRetries) {
                    const delay = retryDelays[attempt];
                    core.warning(`Push failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay / 1000}s...`);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
                else {
                    throw error;
                }
            }
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to commit and push changes: ${message}`);
    }
}

export { cloneGitOpsRepo, commitAndPush, parseRepositoryInfo };
//# sourceMappingURL=git.js.map
