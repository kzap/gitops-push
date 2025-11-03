/**
 * Parse the repository information from input.
 *
 * @param {string} repository - The repository string to parse
 * @returns {Object} Object containing gitopsOrg and gitopsRepoName
 */
export declare function parseRepositoryInfo(repository: string): {
    gitopsOrg: string;
    gitopsRepoName: string;
};
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
export declare function cloneGitOpsRepo(token: string, org: string, repo: string, branch: string, directory: string): Promise<void>;
/**
 * Commit and push changes to GitOps repository
 *
 * @param {string} gitopsRepoLocalPath - GitOps repository directory
 * @param {string} gitopsPath - Path in the gitops repository where all the files will be pushed
 * @param {string} gitopsBranch - Branch name (optional)
 * @param {string} applicationName - Application name
 * @param {string} environment - Environment name
 * @param {string} argocdAppManifestPath - Path to ArgoCD application manifest file
 * @param {string} applicationManifestsPath - Path to application manifests directory
 * @returns {Promise<void>}
 *
 * @example
 * commitAndPush(
 *   gitopsRepoLocalPath: '/path/to/gitops-repo',
 *   gitopsPath: './',
 *   gitopsBranch: 'main',
 *   applicationName: 'my-application',
 *   environment: 'production',
 *   argocdAppManifestPath: '/path/to/argocd-app-manifest.yaml',
 *   applicationManifestsPath: '/path/to/application-manifests',
 * )
 */
export declare function commitAndPush(gitopsRepoLocalPath: string, gitopsPath: string, gitopsBranch: string, applicationName: string, environment: string, argocdAppManifestPath: string, applicationManifestsPath: string): Promise<void>;
