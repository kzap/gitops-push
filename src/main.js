import * as core from '@actions/core'
import * as github from '@actions/github'

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
    const gitopsBranch = core.getInput('gitops-branch', { required: false })
    const environment = core.getInput('environment', { required: true })

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
    core.debug(`Environment: ${environment || 'not specified'}`)

    // Print GitHub context for debugging
    core.startGroup('GitHub Context')
    core.info(JSON.stringify(github.context, null, 2))
    core.endGroup()

    // The rest of your implementation will go here
    // ...

    // Set outputs for other workflow steps to use
    core.setOutput('time', new Date().toTimeString())
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
