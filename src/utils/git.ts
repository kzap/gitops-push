import * as exec from '@actions/exec'
import * as core from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs'
import * as path from 'path'
import * as io from '@actions/io'
import { execWithOutput } from './tools'

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
export async function commitAndPush(
  gitopsRepoLocalPath: string,
  gitopsPath: string,
  gitopsBranch: string,
  applicationName: string,
  environment: string,
  argocdAppManifestPath: string,
  applicationManifestsPath: string
) {
  // Prefix of path where we put the ArgoCD App to separate it from the application manifests
  const gitopsArgoAppsPrefix = 'argocd-apps'
  const gitopsBasePath = path.join(gitopsRepoLocalPath, gitopsPath)

  try {
    // Create the target directory structure: `${gitopsBasePath}/${gitopsArgoAppsPrefix}/${applicationName}`
    const argocdAppTargetDir = path.join(
      gitopsBasePath,
      gitopsArgoAppsPrefix,
      applicationName
    )
    await io.mkdirP(argocdAppTargetDir)
    core.info(`✅ Created directory for ArgoCD App: ${argocdAppTargetDir}`)

    // Write the ArgoCD application manifest to the target directory
    const argocdAppTargetFile = path.join(
      argocdAppTargetDir,
      `${environment}.yaml`
    )
    await io.cp(argocdAppManifestPath, argocdAppTargetFile)
    core.info(
      `✅ Copied ArgoCD application manifest to: ${argocdAppTargetFile}`
    )

    // Create the app manifests target directory structure: `${gitopsBasePath}/${applicationName}/${environment}/${applicationManifestsPath}`
    const appManifestsTargetDir = path.join(
      gitopsBasePath,
      applicationName,
      environment,
      applicationManifestsPath
    )
    await io.mkdirP(appManifestsTargetDir)
    core.info(
      `✅ Created directory for App Manifests: ${appManifestsTargetDir}`
    )

    // Copy application manifests from applicationManifestsPath to target directory
    if (fs.existsSync(applicationManifestsPath)) {
      const files = await fs.promises.readdir(applicationManifestsPath, {
        withFileTypes: true
      })

      for (const file of files) {
        const sourcePath = path.join(applicationManifestsPath, file.name)
        const destPath = path.join(appManifestsTargetDir, file.name)

        if (file.isDirectory()) {
          // Recursively copy directory
          await io.cp(sourcePath, destPath, { recursive: true })
          core.info(`Copied directory: ${sourcePath} -> ${destPath}`)
        } else {
          // Copy file
          await io.cp(sourcePath, destPath)
          core.info(`Copied file: ${sourcePath} -> ${destPath}`)
        }
      }
    } else {
      core.warning(
        `Application manifests path does not exist: ${applicationManifestsPath}`
      )
    }

    // Show github status output for the changes
    let {
      exitCode: gitStatusExitCode,
      stdout: gitStatusStdout,
      stderr: gitStatusStderr
    } = await execWithOutput('git', ['status'], {
      cwd: gitopsBasePath
    })
    core.info(`🤖🤖🤖 Git status output: ${gitStatusStdout}`)

    // Show directory tree structure
    let {
      exitCode: treeExitCode,
      stdout: treeStdout,
      stderr: treeStderr
    } = await execWithOutput('tree', ['-L', '2', '-a', '-I', 'node_modules'], {
      cwd: gitopsBasePath
    })
    core.info(`🤖🤖🤖 Tree output: ${treeStdout}`)

    // Add ArgoCD app changes
    await exec.exec('git', ['add', './' + gitopsArgoAppsPrefix], {
      cwd: gitopsBasePath
    })
    // Add application manifests changes
    await exec.exec('git', ['add', './' + applicationName], {
      cwd: gitopsBasePath
    })

    // Check if there are any changes to commit
    let {
      exitCode: gitDiffExitCode,
      stdout: gitDiffStdout,
      stderr: gitDiffStderr
    } = await execWithOutput('git', ['diff', '--cached', '--quiet'], {
      cwd: gitopsBasePath,
      ignoreReturnCode: true
    })
    core.info(`🤖🤖🤖 Has changes: ${gitDiffExitCode}`)
    if (gitDiffExitCode === 0) {
      core.info('No changes to commit')
      return
    }

    // Create commit with detailed message
    const commitMessage = `Deploy ${applicationName} to ${environment}

Updated deployment manifests for ${applicationName} in ${environment} environment.
- ArgoCD application manifest
- Application manifests from ${path.basename(applicationManifestsPath)}`

    await exec.exec('git', ['commit', '-m', commitMessage], {
      cwd: gitopsBasePath
    })

    // Push changes with retry logic
    const pushBranch = gitopsBranch || 'HEAD'
    const maxRetries = 4
    const retryDelays = [2000, 4000, 8000, 16000] // exponential backoff in ms

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await exec.exec('git', ['push', '-u', 'origin', pushBranch], {
          cwd: gitopsBasePath
        })
        core.info(`✅ Successfully pushed changes to ${pushBranch}`)
        return
      } catch (error) {
        if (attempt < maxRetries) {
          const delay = retryDelays[attempt]
          core.warning(
            `Push failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay / 1000}s...`
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
        } else {
          throw error
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to commit and push changes: ${message}`)
  }
}
