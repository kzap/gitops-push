import * as core from '@actions/core'
import * as github from '@actions/github'
import * as io from '@actions/io'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  generateValuesYaml,
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
  let gitopsRepoLocalPath = ''
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
    const gitopsPath = core.getInput('gitops-path', { required: false }) || './'
    const environment = core.getInput('environment', { required: true })
    const applicationName =
      core.getInput('application-name') || github.context.repo.repo
    const applicationManifestsPath =
      core.getInput('application-manifests-path', { required: false }) || './'
    const customValues =
      core.getInput('custom-values', { required: false }) || ''
    const argoCDAppHelmChartGitURL =
      core.getInput('argocd-app-helm-chart', { required: false }) ||
      'git+https://github.com/kzap/gitops-push@templates/helm/argocd-app-0.1.0.tgz?ref=main'

    // Parse repository information
    const { gitopsOrg, gitopsRepoName } = parseRepositoryInfo(gitopsRepository)
    core.info(`✅ Repository parsed as: ${gitopsOrg}/${gitopsRepoName}`)

    // Mask the token to prevent it from being logged
    core.setSecret(gitopsToken)
    core.info('🔐 Token has been masked in logs')

    // Log information (debug only)
    core.info(`🔍 Git Organization: ${gitopsOrg}`)
    core.info(`🔍 Git Repository: ${gitopsRepoName}`)
    core.info(`🔍 Git Branch: ${gitopsBranch}`)
    core.info(`🔍 Git Path: ${gitopsPath}`)
    core.info(`🔍 Environment: ${environment}`)
    core.info(`🔍 Application Name: ${applicationName}`)
    core.info(`🔍 Application Manifests Path: ${applicationManifestsPath}`)
    core.info(`🔍 ArgoCD App Helm Chart: ${argoCDAppHelmChartGitURL}`)
    core.info(`🔍 Custom Values: ${customValues}`)

    core.notice(
      `We are going to push [Env: ${environment}] ArgoCD ApplicationSet for [App: ${applicationName}] to [Repo: ${gitopsOrg}/${gitopsRepoName}] on the branch [Branch: ${gitopsBranch || '[Using default branch]'}].`
    )

    // 0. Clone GitOps Repository

    // Ensure it is a temporary directory and empty to avoid conflicts
    gitopsRepoLocalPath = path.join(os.tmpdir(), `gitops-repo-${Date.now()}`)
    await io.rmRF(gitopsRepoLocalPath)
    await io.mkdirP(gitopsRepoLocalPath)

    // Clone the GitOps repository
    await cloneGitOpsRepo(
      gitopsToken,
      gitopsOrg,
      gitopsRepoName,
      gitopsBranch,
      gitopsRepoLocalPath
    )

    // 1. Create ArgoCD Manifest

    // Prepare template data for the ApplicationSet manifest
    const valuesYaml = await generateValuesYaml(
      applicationName,
      environment,
      gitopsRepoName,
      gitopsOrg,
      gitopsBranch,
      gitopsPath,
      customValues,
      applicationManifestsPath
    )

    // Generate the manifest file to a temporary file
    const argocdAppManifest = await generateArgoCDAppManifest(
      valuesYaml,
      argoCDAppHelmChartGitURL
    )

    // 2. Copy files to the GitOps repository and commit/push

    // Commit and push changes - this will organize files into applicationName/environment/
    await commitAndPush(
      gitopsRepoLocalPath,
      gitopsPath,
      gitopsBranch,
      applicationName,
      environment,
      argocdAppManifest,
      applicationManifestsPath
    )

    core.info(
      `✅ Successfully updated ApplicationSet for ${applicationName} in ${environment} environment`
    )

    // Set outputs for other workflow steps to use
    core.setOutput('time', new Date().toTimeString())
  } catch (error) {
    // Clean up the temporary directory
    try {
      await io.rmRF(gitopsRepoLocalPath)
    } catch (cleanupError) {
      // Ignore cleanup errors
      core.debug(
        `Failed to clean up directory: ${
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError)
        }`
      )
    }

    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
