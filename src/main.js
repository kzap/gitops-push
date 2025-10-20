import * as core from '@actions/core'
import * as github from '@actions/github'
import * as io from '@actions/io'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  generateCustomValuesYaml,
  generateArgoCDAppManifest
} from './utils/argocd-app-manifest'
import {
  parseRepositoryInfo,
  cloneGitOpsRepo,
  commitAndPush
} from './utils/git'

/**
 * The main function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run() {
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
    const gitopsBranch =
      core.getInput('gitops-branch', { required: false }) || 'main'
    const environment = core.getInput('environment', { required: true })
    const applicationName =
      core.getInput('application-name') || github.context.repo.repo
    const applicationManifestsPath = core.getInput(
      'application-manifests-path',
      { required: true }
    )

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

    // 0. Clone GitOps Repository, ensure it is a temporary directory and empty
    const gitOpsRepoLocalPath = path.join(
      os.tmpdir(),
      `gitops-repo-${Date.now()}`
    )
    await io.rmRF(gitOpsRepoLocalPath)
    await io.mkdirP(gitOpsRepoLocalPath)

    // Clone the GitOps repository
    await cloneGitOpsRepo(
      gitopsToken,
      gitopsOrg,
      gitopsRepoName,
      gitopsBranch,
      gitOpsRepoLocalPath
    )

    // 1. Create ArgoCD Manifest

    // Prepare template data for the ApplicationSet manifest
    customValues = core.getInput('custom-values', { required: false })
    const valuesYaml = await generateCustomValuesYaml({
      applicationName: applicationName,
      environment: environment,
      sourceRepo: gitopsRepoName,
      sourceOrg: gitopsOrg,
      sourceBranch: gitopsBranch,
      customValues: customValues
    })

    // Generate the manifest file
    argocdAppManifest = await generateArgoCDAppManifest(
      applicationName,
      environment,
      gitOpsRepoLocalPath,
      valuesYaml
    )

    // 1c. Save argocd app manifest to a file
    await fs.promises.writeFile(
      path.join(
        gitOpsRepoLocalPath,
        'argocd-apps',
        applicationName,
        `${environment}.yml`
      ),
      argocdAppManifest
    )

    // 2. Copy application manifests to GitOps repository
    await copyApplicationManifests(
      applicationName,
      environment,
      gitOpsRepoLocalPath,
      applicationManifestsPath
    )

    // 3. Post Summary to GitHub Step Summary

    // 3a. Summary of the ArgoCD ApplicationSet
    // 3b. Summary of the files copied to GitOps repository

    // Commit and push changes
    await commitAndPush(
      gitOpsRepoLocalPath,
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
