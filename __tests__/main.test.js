/**
 * Unit tests for the action's main functionality, src/main.js
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import * as path from 'path'

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

// Mock @actions/io
const mockIo = {
  mkdirP: jest.fn().mockImplementation(() => Promise.resolve()),
  rmRF: jest.fn().mockImplementation(() => Promise.resolve()),
  cp: jest.fn().mockImplementation(() => Promise.resolve())
}
jest.unstable_mockModule('@actions/io', () => mockIo)

// Mock @actions/exec
const mockExec = {
  exec: jest.fn().mockImplementation((cmd, args) => {
    // Mock git diff to indicate changes exist (non-zero exit = has changes)
    if (args && args.includes('diff')) {
      return Promise.reject(new Error('Has changes'))
    }
    return Promise.resolve(0)
  })
}
jest.unstable_mockModule('@actions/exec', () => mockExec)

// Mock fs
const mockFs = {
  default: {},
  promises: {
    writeFile: jest.fn().mockImplementation(() => Promise.resolve()),
    readFile: jest
      .fn()
      .mockImplementation(() => Promise.resolve('template content')),
    readdir: jest.fn().mockResolvedValue([])
  },
  existsSync: jest.fn().mockReturnValue(true)
}
jest.unstable_mockModule('fs', () => mockFs)

// Mock @actions/tool-cache so fetchTcTool is a no-op
const mockToolCache = {
  find: jest.fn().mockReturnValue('/tmp/tool-dir'),
  addPath: jest.fn(),
  downloadTool: jest.fn().mockResolvedValue('/tmp/download.tar.gz'),
  extractTar: jest.fn().mockResolvedValue('/tmp/extracted'),
  cacheDir: jest.fn().mockResolvedValue('/tmp/cached')
}
jest.unstable_mockModule('@actions/tool-cache', () => mockToolCache)

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main.js')
const { parseRepositoryInfo } = await import('../src/utils/git.js')

describe('main.js', () => {
  beforeEach(() => {
    // Setup mock input values
    const mockInputs = {
      'gitops-repository': 'gitops-repo',
      'gitops-token': 'secret-token',
      'gitops-branch': 'main',
      'application-manifests-path': 'k8s',
      environment: 'production',
      'application-name': 'test-app',
      'argocd-app-helm-chart': path.resolve(
        path.join(
          path.dirname(new URL(import.meta.url).pathname),
          '../__fixtures__/helm/argocd-app'
        )
      )
    }

    core.getInput.mockImplementation((name) => mockInputs[name] || '')

    // Mock process.env
    process.env.GITHUB_REF_NAME = 'main'
    process.env.GITHUB_STEP_SUMMARY = '/tmp/step_summary.md'
    process.env.RUNNER_TOOL_CACHE = '/tmp/runner_tool_cache'
    process.env.RUNNER_TEMP = '/tmp/runner_temp'
  })

  afterEach(() => {
    jest.resetAllMocks()
    // Clean up env variables
    delete process.env.GITHUB_REF_NAME
    delete process.env.GITHUB_STEP_SUMMARY
    delete process.env.RUNNER_TOOL_CACHE
    delete process.env.RUNNER_TEMP
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

  it('Uses application-name from input when provided', async () => {
    // Mock input with custom application name
    core.getInput.mockImplementation((name) => {
      if (name === 'application-name') return 'custom-app'
      if (name === 'gitops-token') return 'secret-token'
      if (name === 'gitops-repository') return 'test-org/gitops-repo'
      if (name === 'environment') return 'staging'
      return ''
    })

    await run()

    // Verify that the custom application name was used
    expect(core.notice).toHaveBeenCalledWith(
      expect.stringContaining('custom-app')
    )
  })

  it('Uses repository name as application-name when not provided', async () => {
    // Remove application-name from inputs
    core.getInput.mockImplementation((name) => {
      if (name === 'application-name') return ''
      if (name === 'gitops-token') return 'secret-token'
      if (name === 'gitops-repository') return 'test-org/gitops-repo'
      if (name === 'environment') return 'staging'
      return ''
    })

    await run()

    // Verify that the repository name was used as application name
    expect(core.notice).toHaveBeenCalledWith(
      expect.stringContaining('test-repo')
    )
  })
})
