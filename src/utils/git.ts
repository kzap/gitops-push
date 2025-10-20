import * as exec from '@actions/exec'
import * as core from '@actions/core'
import * as github from '@actions/github'

/**
 * Parse the repository information from input.
 *
 * @param {string} repository - The repository string to parse
 * @returns {Object} Object containing gitopsOrg and gitopsRepoName
 */
export function parseRepositoryInfo(repository: string): {
  gitopsOrg: string
  gitopsRepoName: string
} {
  let gitopsOrg = ''
  let gitopsRepoName = ''

  if (repository.includes('/')) {
    // If repository contains a slash, split it to get org and repo name
    const parts = repository.split('/')
    gitopsOrg = parts[0]
    gitopsRepoName = parts[1]
    core.debug(`Using provided repository: ${gitopsOrg}/${gitopsRepoName}`)
  } else {
    // If not, use the current repository's owner as the org
    gitopsOrg = github.context.repo.owner
    gitopsRepoName = repository
    core.debug(`Using context owner: ${gitopsOrg}/${gitopsRepoName}`)
  }

  return { gitopsOrg, gitopsRepoName }
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
export async function cloneGitOpsRepo(
  token: string,
  org: string,
  repo: string,
  branch: string,
  directory: string
) {
  try {
    // Clone the GitOps repository
    const cloneUrl = `https://x-access-token:${token}@github.com/${org}/${repo}.git`
    await exec.exec('git', ['clone', cloneUrl, directory])

    // Checkout the target branch if specified, create it if it doesn't exist
    if (branch) {
      try {
        await exec.exec('git', ['checkout', branch], { cwd: directory })
      } catch (error) {
        core.debug(`Branch ${branch} doesn't exist, creating new branch`)
        await exec.exec('git', ['checkout', '-b', branch], { cwd: directory })
      }
    }

    // Configure Git user for commits
    await exec.exec('git', ['config', 'user.name', 'GitHub Action'], {
      cwd: directory
    })
    await exec.exec('git', ['config', 'user.email', 'action@github.com'], {
      cwd: directory
    })

    core.debug(`Successfully cloned ${org}/${repo} to ${directory}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to clone GitOps repository: ${message}`)
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
export async function commitAndPush(
  directory: string,
  applicationName: string,
  environment: string,
  branch: string
) {
  try {
    // Add changes
    await exec.exec('git', ['add', '.'], { cwd: directory })

    // Create commit
    const commitMessage = `Update ${applicationName} ApplicationSet for ${environment} environment`
    await exec.exec('git', ['commit', '-m', commitMessage], { cwd: directory })

    // Push changes
    const pushBranch = branch || 'HEAD'
    await exec.exec('git', ['push', 'origin', pushBranch], { cwd: directory })

    core.debug(`Successfully pushed changes to ${pushBranch}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to commit and push changes: ${message}`)
  }
}
