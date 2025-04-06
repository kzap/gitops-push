import * as core from '@actions/core'
import * as github from '@actions/github'

/**
 * The main function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run() {
  try {
    // Get inputs
    const gitopsRepository = core.getInput('gitops-repository', {
      required: true
    })
    const gitopsToken = core.getInput('gitops-token', { required: true })
    const gitopsBranch = core.getInput('gitops-branch')
    const environment = core.getInput('environment')

    // Process repository information
    let gitopsOrg = ''
    let gitopsRepoName = ''

    if (gitopsRepository.includes('/')) {
      // If gitops-repository contains a slash, split it to get org and repo name
      const parts = gitopsRepository.split('/')
      gitopsOrg = parts[0]
      gitopsRepoName = parts[1]
      core.debug(`Using provided repository: ${gitopsOrg}/${gitopsRepoName}`)
    } else {
      // If not, use the current repository's owner as the org
      gitopsOrg = github.context.repo.owner
      gitopsRepoName = gitopsRepository
      core.debug(`Using context owner: ${gitopsOrg}/${gitopsRepoName}`)
    }

    // Mask the token to prevent it from being logged
    core.setSecret(gitopsToken)
    core.debug('Token has been masked in logs')

    // Log information (debug only)
    core.debug(`Git Organization: ${gitopsOrg}`)
    core.debug(`Git Repository: ${gitopsRepoName}`)
    core.debug(`Git Branch: ${gitopsBranch || 'default branch'}`)
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
