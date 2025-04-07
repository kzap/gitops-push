import * as core from '@actions/core'
import * as github from '@actions/github'
import * as io from '@actions/io'
import * as exec from '@actions/exec'
import * as fs from 'fs'
import * as path from 'path'
import { generateFromTemplate } from './utils/template.js'

/**
 * Parse the repository information from input.
 *
 * @param {string} repository - The repository string to parse
 * @returns {Object} Object containing gitopsOrg and gitopsRepoName
 */
export function parseRepositoryInfo(repository) {
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
async function cloneGitOpsRepo(token, org, repo, branch, directory) {
  try {
    // Clone the GitOps repository
    const cloneUrl = `https://x-access-token:${token}@github.com/${org}/${repo}.git`
    await exec.exec('git', ['clone', cloneUrl, directory])

    // Checkout the target branch if specified
    if (branch) {
      await exec.exec('git', ['checkout', branch], { cwd: directory })
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
    throw new Error(`Failed to clone GitOps repository: ${error.message}`)
  }
}

/**
 * Generate and write ApplicationSet manifest
 *
 * @param {string} applicationName - Application name
 * @param {string} environment - Environment name
 * @param {string} baseDir - Base directory for GitOps repo
 * @param {Object} templateData - Data for template generation
 * @returns {Promise<string>} Path to the generated manifest file
 */
async function generateManifest(
  applicationName,
  environment,
  baseDir,
  templateData
) {
  try {
    // Ensure the directory exists
    const appsetDir = path.join(baseDir, 'applicationsets', applicationName)
    await io.mkdirP(appsetDir)

    // Generate manifest content
    const manifestContent = await generateFromTemplate(
      'applicationset',
      templateData
    )

    // Write manifest file
    const manifestPath = path.join(appsetDir, `${environment}.yml`)
    await fs.promises.writeFile(manifestPath, manifestContent)

    core.debug(`Generated manifest at ${manifestPath}`)
    return manifestPath
  } catch (error) {
    throw new Error(`Failed to generate manifest: ${error.message}`)
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
    await exec.exec('git', ['add', '.'], { cwd: directory })

    // Create commit
    const commitMessage = `Update ${applicationName} ApplicationSet for ${environment} environment`
    await exec.exec('git', ['commit', '-m', commitMessage], { cwd: directory })

    // Push changes
    const pushBranch = branch || 'HEAD'
    await exec.exec('git', ['push', 'origin', pushBranch], { cwd: directory })

    core.debug(`Successfully pushed changes to ${pushBranch}`)
  } catch (error) {
    throw new Error(`Failed to commit and push changes: ${error.message}`)
  }
}

/**
 * The main function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run() {
  // Create a temporary directory for GitOps repo
  const gitopsRepoBase = './gitops-repo-base'

  try {
    // Get inputs
    let gitopsRepository = core.getInput('gitops-repository', {
      required: false
    })
    // If gitops-repository is not provided via input, check environment variable
    if (!gitopsRepository) {
      gitopsRepository = process.env.GITOPS_REPOSITORY || ''
      if (!gitopsRepository) {
        throw new Error(
          'gitops-repository input or GITOPS_REPOSITORY environment variable must be provided'
        )
      }
    }
    const gitopsToken = core.getInput('gitops-token', { required: true })
    const gitopsBranch = core.getInput('gitops-branch', { required: false })
    const environment = core.getInput('environment', { required: true })
    const applicationName =
      core.getInput('application-name') || github.context.repo.repo

    // Parse repository information
    const { gitopsOrg, gitopsRepoName } = parseRepositoryInfo(gitopsRepository)
    core.debug(`Repository parsed as: ${gitopsOrg}/${gitopsRepoName}`)

    // Mask the token to prevent it from being logged
    core.setSecret(gitopsToken)
    core.debug('Token has been masked in logs')

    // Log information (debug only)
    core.debug(`Git Organization: ${gitopsOrg}`)
    core.debug(`Git Repository: ${gitopsRepoName}`)
    core.debug(`Git Branch: ${gitopsBranch || '[Using default branch]'}`)
    core.debug(`Environment: ${environment}`)
    core.debug(`Application Name: ${applicationName}`)

    core.notice(
      `We are going to push [${environment}] ArgoCD ApplicationSet for [${applicationName}] to [${gitopsOrg}/${gitopsRepoName}] on the branch [${gitopsBranch || '[Using default branch]'}].`
    )

    // Ensure the base directory exists and is empty
    await io.rmRF(gitopsRepoBase)
    await io.mkdirP(gitopsRepoBase)

    // Clone the GitOps repository
    await cloneGitOpsRepo(
      gitopsToken,
      gitopsOrg,
      gitopsRepoName,
      gitopsBranch,
      gitopsRepoBase
    )

    // Prepare template data for the ApplicationSet manifest
    const templateData = {
      appsetName: `${applicationName}-${environment}`,
      environment: environment,
      sourceRepo: github.context.repo.repo,
      sourceOrg: github.context.repo.owner,
      sourceBranch: process.env.GITHUB_REF_NAME || 'main'
    }

    // Generate the manifest file
    await generateManifest(
      applicationName,
      environment,
      gitopsRepoBase,
      templateData
    )

    // Commit and push changes
    await commitAndPush(
      gitopsRepoBase,
      applicationName,
      environment,
      gitopsBranch
    )

    core.info(
      `✅ Successfully updated ApplicationSet for ${applicationName} in ${environment} environment`
    )

    // Set outputs for other workflow steps to use
    core.setOutput('time', new Date().toTimeString())
  } catch (error) {
    // Clean up the temporary directory
    try {
      await io.rmRF(gitopsRepoBase)
    } catch (cleanupError) {
      // Ignore cleanup errors
      core.debug(`Failed to clean up directory: ${cleanupError.message}`)
    }

    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
