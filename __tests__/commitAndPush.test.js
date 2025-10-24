/**
 * Unit tests for commitAndPush function
 */
import { jest } from '@jest/globals'
import * as path from 'path'

// Mock @actions/core
const mockCore = {
  debug: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  setFailed: jest.fn()
}
jest.unstable_mockModule('@actions/core', () => mockCore)

// Mock @actions/github
jest.unstable_mockModule('@actions/github', () => ({
  context: {
    repo: {
      owner: 'test-owner',
      repo: 'test-repo'
    }
  }
}))

// Mock @actions/exec
const mockExec = {
  exec: jest.fn()
}
jest.unstable_mockModule('@actions/exec', () => mockExec)

// Mock fs
const mockFs = {
  default: {},
  promises: {
    writeFile: jest.fn().mockResolvedValue(undefined),
    readdir: jest.fn().mockResolvedValue([])
  },
  existsSync: jest.fn().mockReturnValue(true)
}
jest.unstable_mockModule('fs', () => mockFs)

// Mock @actions/io
const mockIo = {
  mkdirP: jest.fn().mockResolvedValue(undefined),
  rmRF: jest.fn().mockResolvedValue(undefined),
  cp: jest.fn().mockResolvedValue(undefined)
}
jest.unstable_mockModule('@actions/io', () => mockIo)

// Import the function to test
const { commitAndPush } = await import('../dist/utils/git.js')

describe('commitAndPush', () => {
  const gitOpsRepoPath = '/tmp/gitops-repo'
  const applicationName = 'test-app'
  const environment = 'production'
  const branch = 'main'
  const argocdManifest = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: test-app
  namespace: argocd`
  const manifestsPath = '/path/to/manifests'

  beforeEach(() => {
    jest.clearAllMocks()
    // Default mock: git operations succeed, diff indicates changes exist
    mockExec.exec.mockImplementation((cmd, args) => {
      if (args.includes('diff')) {
        // Reject to indicate changes exist (non-zero exit code)
        return Promise.reject(new Error('Has changes'))
      }
      return Promise.resolve(0)
    })
    mockFs.existsSync.mockReturnValue(true)
    mockFs.promises.readdir.mockResolvedValue([])
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should create target directory structure', async () => {
    await commitAndPush(
      gitOpsRepoPath,
      applicationName,
      environment,
      branch,
      argocdManifest,
      manifestsPath
    )

    const expectedTargetDir = path.join(
      gitOpsRepoPath,
      applicationName,
      environment
    )
    expect(mockIo.mkdirP).toHaveBeenCalledWith(expectedTargetDir)
  })

  it('should write ArgoCD manifest to target directory', async () => {
    await commitAndPush(
      gitOpsRepoPath,
      applicationName,
      environment,
      branch,
      argocdManifest,
      manifestsPath
    )

    const expectedManifestPath = path.join(
      gitOpsRepoPath,
      applicationName,
      environment,
      'application.yaml'
    )
    expect(mockFs.promises.writeFile).toHaveBeenCalledWith(
      expectedManifestPath,
      argocdManifest
    )
  })

  it('should copy files from application manifests directory', async () => {
    const mockFiles = [
      { name: 'deployment.yaml', isDirectory: () => false },
      { name: 'service.yaml', isDirectory: () => false }
    ]
    mockFs.promises.readdir.mockResolvedValue(mockFiles)

    await commitAndPush(
      gitOpsRepoPath,
      applicationName,
      environment,
      branch,
      argocdManifest,
      manifestsPath
    )

    const targetDir = path.join(gitOpsRepoPath, applicationName, environment)
    expect(mockIo.cp).toHaveBeenCalledWith(
      path.join(manifestsPath, 'deployment.yaml'),
      path.join(targetDir, 'deployment.yaml')
    )
    expect(mockIo.cp).toHaveBeenCalledWith(
      path.join(manifestsPath, 'service.yaml'),
      path.join(targetDir, 'service.yaml')
    )
  })

  it('should recursively copy directories from application manifests', async () => {
    const mockFiles = [
      { name: 'charts', isDirectory: () => true },
      { name: 'deployment.yaml', isDirectory: () => false }
    ]
    mockFs.promises.readdir.mockResolvedValue(mockFiles)

    await commitAndPush(
      gitOpsRepoPath,
      applicationName,
      environment,
      branch,
      argocdManifest,
      manifestsPath
    )

    const targetDir = path.join(gitOpsRepoPath, applicationName, environment)
    expect(mockIo.cp).toHaveBeenCalledWith(
      path.join(manifestsPath, 'charts'),
      path.join(targetDir, 'charts'),
      { recursive: true }
    )
  })

  it('should warn if application manifests path does not exist', async () => {
    mockFs.existsSync.mockReturnValue(false)

    await commitAndPush(
      gitOpsRepoPath,
      applicationName,
      environment,
      branch,
      argocdManifest,
      manifestsPath
    )

    expect(mockCore.warning).toHaveBeenCalledWith(
      expect.stringContaining('does not exist')
    )
  })

  it('should create commit with deployment message', async () => {
    await commitAndPush(
      gitOpsRepoPath,
      applicationName,
      environment,
      branch,
      argocdManifest,
      manifestsPath
    )

    expect(mockExec.exec).toHaveBeenCalledWith(
      'git',
      [
        'commit',
        '-m',
        expect.stringContaining('Deploy test-app to production')
      ],
      { cwd: gitOpsRepoPath }
    )
  })

  it('should push changes with -u flag', async () => {
    await commitAndPush(
      gitOpsRepoPath,
      applicationName,
      environment,
      branch,
      argocdManifest,
      manifestsPath
    )

    expect(mockExec.exec).toHaveBeenCalledWith(
      'git',
      ['push', '-u', 'origin', branch],
      { cwd: gitOpsRepoPath }
    )
  })

  it('should skip commit if no changes detected', async () => {
    // Mock git diff to indicate no changes (success = no diff)
    mockExec.exec.mockImplementation((cmd, args) => {
      if (args.includes('diff')) {
        return Promise.resolve(0) // No changes
      }
      return Promise.resolve(0)
    })

    await commitAndPush(
      gitOpsRepoPath,
      applicationName,
      environment,
      branch,
      argocdManifest,
      manifestsPath
    )

    expect(mockCore.info).toHaveBeenCalledWith('No changes to commit')
    expect(mockExec.exec).not.toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['commit']),
      expect.anything()
    )
  })

  it('should retry push on failure with exponential backoff', async () => {
    jest.useFakeTimers()

    let pushAttempts = 0
    mockExec.exec.mockImplementation((cmd, args) => {
      if (args.includes('push')) {
        pushAttempts++
        if (pushAttempts < 3) {
          return Promise.reject(new Error('Network error'))
        }
        return Promise.resolve(0)
      }
      if (args.includes('diff')) {
        return Promise.reject(new Error('Has changes'))
      }
      return Promise.resolve(0)
    })

    const pushPromise = commitAndPush(
      gitOpsRepoPath,
      applicationName,
      environment,
      branch,
      argocdManifest,
      manifestsPath
    )

    // Fast-forward timers to allow retries
    await jest.runAllTimersAsync()
    await pushPromise

    expect(pushAttempts).toBe(3)
    expect(mockCore.warning).toHaveBeenCalledWith(
      expect.stringContaining('retrying')
    )

    jest.useRealTimers()
  })

  it('should fail after maximum retries', async () => {
    jest.useFakeTimers()

    let pushAttempts = 0
    mockExec.exec.mockImplementation((cmd, args) => {
      if (args.includes('push')) {
        pushAttempts++
        return Promise.reject(new Error('Network error'))
      }
      if (args.includes('diff')) {
        return Promise.reject(new Error('Has changes'))
      }
      return Promise.resolve(0)
    })

    let error
    const pushPromise = commitAndPush(
      gitOpsRepoPath,
      applicationName,
      environment,
      branch,
      argocdManifest,
      manifestsPath
    ).catch((e) => {
      error = e
    })

    // Fast-forward all timers
    await jest.runAllTimersAsync()
    await pushPromise

    expect(error).toBeDefined()
    expect(error.message).toContain('Failed to commit and push')
    expect(pushAttempts).toBe(5) // Initial + 4 retries

    jest.useRealTimers()
  })

  it('should handle git add operation', async () => {
    await commitAndPush(
      gitOpsRepoPath,
      applicationName,
      environment,
      branch,
      argocdManifest,
      manifestsPath
    )

    expect(mockExec.exec).toHaveBeenCalledWith('git', ['add', '.'], {
      cwd: gitOpsRepoPath
    })
  })

  it('should use HEAD as default branch if not specified', async () => {
    await commitAndPush(
      gitOpsRepoPath,
      applicationName,
      environment,
      '', // empty branch
      argocdManifest,
      manifestsPath
    )

    expect(mockExec.exec).toHaveBeenCalledWith(
      'git',
      ['push', '-u', 'origin', 'HEAD'],
      { cwd: gitOpsRepoPath }
    )
  })

  it('should throw error on write failure', async () => {
    mockFs.promises.writeFile.mockRejectedValue(new Error('Permission denied'))

    await expect(
      commitAndPush(
        gitOpsRepoPath,
        applicationName,
        environment,
        branch,
        argocdManifest,
        manifestsPath
      )
    ).rejects.toThrow('Failed to commit and push')
  })

  it('should throw error on directory creation failure', async () => {
    mockIo.mkdirP.mockRejectedValue(new Error('Cannot create directory'))

    await expect(
      commitAndPush(
        gitOpsRepoPath,
        applicationName,
        environment,
        branch,
        argocdManifest,
        manifestsPath
      )
    ).rejects.toThrow('Failed to commit and push')
  })
})
