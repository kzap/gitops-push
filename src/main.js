import * as core from '@actions/core'
import * as github from '@actions/github'
import { wait } from './wait.js'

/**
 * The main function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run() {
  try {
    const ms = core.getInput('milliseconds')

    // Get service-name input or default to repo name
    const context = github.context
    let serviceName = core.getInput('service-name')
    if (!serviceName) {
      serviceName = context.repo.repo
    }

    // Get environment input
    const environment = core.getInput('environment')

    // Debug logs are only output if the `ACTIONS_STEP_DEBUG` secret is true
    core.debug(`Waiting ${ms} milliseconds ...`)
    core.debug(`Service Name: ${serviceName}`)
    core.debug(`Environment: ${environment}`)

    // Log the current timestamp, wait, then log the new timestamp
    core.debug(new Date().toTimeString())
    await wait(parseInt(ms, 10))
    core.debug(new Date().toTimeString())

    // Set outputs for other workflow steps to use
    core.setOutput('time', new Date().toTimeString())
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
