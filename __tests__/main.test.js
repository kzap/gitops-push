/**
 * Unit tests for the action's main functionality, src/main.js
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)

// Mock @actions/github
const mockContext = {
  repo: {
    owner: 'test-owner',
    repo: 'test-repo'
  }
}

jest.unstable_mockModule('@actions/github', () => ({
  context: mockContext
}))

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main.js')

describe('main.js', () => {
  beforeEach(() => {
    // Setup mock input values
    const mockInputs = {
      'gitops-repository': 'gitops-repo',
      'gitops-token': 'secret-token',
      'gitops-branch': 'main',
      environment: 'production'
    }

    core.getInput.mockImplementation((name) => mockInputs[name] || '')
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('Sets the time output', async () => {
    await run()

    // Verify the time output was set.
    expect(core.setOutput).toHaveBeenNthCalledWith(
      1,
      'time',
      // Simple regex to match a time string in the format HH:MM:SS.
      expect.stringMatching(/^\d{2}:\d{2}:\d{2}/)
    )
  })

  it('Parses repository with owner/repo format', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'gitops-repository') return 'custom-org/custom-repo'
      if (name === 'gitops-token') return 'secret-token'
      return ''
    })

    await run()

    // Verify debug logs for repository parsing
    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining('custom-org/custom-repo')
    )
  })

  it('Uses context owner when repository has no owner', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'gitops-repository') return 'repo-only'
      if (name === 'gitops-token') return 'secret-token'
      return ''
    })

    await run()

    // Verify it used the context owner
    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining('test-owner')
    )
  })

  it('Sets a failed status on error', async () => {
    // Force an error by throwing an exception when required input is requested
    core.getInput.mockImplementation((name, options) => {
      if (name === 'gitops-repository' && options && options.required) {
        throw new Error('Input required and not supplied: gitops-repository')
      }
      if (name === 'gitops-token') return 'token'
      return ''
    })

    await run()

    // Verify that the action was marked as failed
    expect(core.setFailed).toHaveBeenCalledWith(
      'Input required and not supplied: gitops-repository'
    )
  })
})
