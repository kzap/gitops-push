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
const { run, parseRepositoryInfo } = await import('../src/main.js')

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
    // Clear environment variables for this test
    const originalEnv = process.env
    process.env = { ...originalEnv }
    delete process.env.GITOPS_REPOSITORY

    // Set up to return empty string for gitops-repository
    core.getInput.mockImplementation((name) => {
      if (name === 'gitops-token') return 'token'
      return ''
    })

    await run()

    // Verify that the action was marked as failed with the new error message
    expect(core.setFailed).toHaveBeenCalledWith(
      'gitops-repository input or GITOPS_REPOSITORY environment variable must be provided'
    )

    // Restore original environment
    process.env = originalEnv
  })

  it('Uses GITHUB_REPOSITORY owner when repo is specified without owner', () => {
    // Set GITHUB_REPOSITORY environment variable
    const originalEnv = process.env
    process.env = { ...originalEnv, GITHUB_REPOSITORY: 'orgName/test-repo' }

    // Mock the context to get owner from GITHUB_REPOSITORY
    mockContext.repo.owner = 'orgName'

    // Call the function directly
    const result = parseRepositoryInfo('gitops-repo')

    // Verify it used the GITHUB_REPOSITORY owner
    expect(result.gitopsOrg).toBe('orgName')
    expect(result.gitopsRepoName).toBe('gitops-repo')

    // Restore original environment
    process.env = originalEnv
  })
})
