import * as yaml from 'js-yaml'
import { jest } from '@jest/globals'

// Mock the dependencies before importing the module
const mockExec = jest.fn()
const mockFetchTcTool = jest.fn()

jest.unstable_mockModule('@actions/exec', () => ({
  exec: mockExec
}))

jest.unstable_mockModule('../dist/utils/tools.js', () => ({
  fetchTcTool: mockFetchTcTool
}))

const { generateArgoCDAppManifest } = await import(
  '../dist/utils/argocd-app-manifest.js'
)

describe('generateArgoCDAppManifest', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetchTcTool.mockResolvedValue(undefined)
  })

  it('generates ArgoCD Application manifest from helm template', async () => {
    const mockYaml = `---
# Source: argocd-app/templates/application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app-dev
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/org/repo.git
    targetRevision: main
    path: my-app/dev/
  destination:
    server: https://kubernetes.default.svc
    namespace: my-app
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true`

    mockExec.mockImplementation(async (command, args, options) => {
      if (options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from(mockYaml))
      }
      return 0
    })

    const customValues = `applicationName: my-app-dev
applicationNamespace: argocd
application:
  project: default
  destination:
    server: https://kubernetes.default.svc
    namespace: my-app
  source:
    repoURL: https://github.com/org/repo.git
    targetRevision: main
    path: my-app/dev/`

    const result = await generateArgoCDAppManifest(
      'my-app',
      'dev',
      customValues
    )

    // Verify fetchTcTool was called for helm
    expect(mockFetchTcTool).toHaveBeenCalledWith('helm')

    // Verify helm template was called with correct arguments
    expect(mockExec).toHaveBeenCalledWith(
      'helm',
      expect.arrayContaining([
        'template',
        'my-app',
        expect.stringContaining('argocd-app'),
        '-f',
        expect.any(String)
      ]),
      expect.any(Object)
    )

    // Verify the result is valid YAML
    expect(result).toBeTruthy()
    expect(() => yaml.loadAll(result)).not.toThrow()

    // Parse and verify the generated manifest
    const manifests = yaml.loadAll(result)
    const app = manifests[0]

    expect(app.apiVersion).toBe('argoproj.io/v1alpha1')
    expect(app.kind).toBe('Application')
    expect(app.metadata.name).toBe('my-app-dev')
    expect(app.metadata.namespace).toBe('argocd')
    expect(app.spec.project).toBe('default')
    expect(app.spec.source.repoURL).toBe('https://github.com/org/repo.git')
    expect(app.spec.source.targetRevision).toBe('main')
    expect(app.spec.source.path).toBe('my-app/dev/')
    expect(app.spec.destination.namespace).toBe('my-app')
    expect(app.spec.syncPolicy.automated.prune).toBe(true)
    expect(app.spec.syncPolicy.automated.selfHeal).toBe(true)
  })

  it('handles custom values with additional fields', async () => {
    const mockYaml = `---
# Source: argocd-app/templates/application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: custom-app-prod
  namespace: argocd
spec:
  project: production
  source:
    repoURL: https://github.com/myorg/myrepo.git
    targetRevision: v1.0.0
    path: apps/production/
  destination:
    server: https://kubernetes.default.svc
    namespace: custom-namespace
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true`

    mockExec.mockImplementation(async (command, args, options) => {
      if (options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from(mockYaml))
      }
      return 0
    })

    const customValues = `applicationName: custom-app-prod
applicationNamespace: argocd
application:
  project: production
  destination:
    server: https://kubernetes.default.svc
    namespace: custom-namespace
  source:
    repoURL: https://github.com/myorg/myrepo.git
    targetRevision: v1.0.0
    path: apps/production/`

    const result = await generateArgoCDAppManifest(
      'custom-app',
      'prod',
      customValues
    )

    const manifests = yaml.loadAll(result)
    const app = manifests[0]

    expect(app.metadata.name).toBe('custom-app-prod')
    expect(app.spec.project).toBe('production')
    expect(app.spec.source.targetRevision).toBe('v1.0.0')
    expect(app.spec.source.path).toBe('apps/production/')
    expect(app.spec.destination.namespace).toBe('custom-namespace')
  })

  it('throws error when helm template fails', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      if (options?.listeners?.stderr) {
        options.listeners.stderr(Buffer.from('Error: template: invalid values'))
      }
      return 1 // non-zero exit code
    })

    const customValues = `invalid: yaml: content`

    await expect(
      generateArgoCDAppManifest('my-app', 'dev', customValues)
    ).rejects.toThrow(/helm template failed with exit code 1/)
  })

  it('uses correct chart path', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      if (options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from('apiVersion: v1\nkind: Test'))
      }
      return 0
    })

    const customValues = `applicationName: test-app
applicationNamespace: argocd
application:
  project: default
  destination:
    server: https://kubernetes.default.svc
    namespace: test
  source:
    repoURL: https://github.com/test/test.git
    targetRevision: main
    path: test/`

    await generateArgoCDAppManifest('test-app', 'dev', customValues)

    // Verify the chart path ends with the expected directory
    const callArgs = mockExec.mock.calls[0]
    const chartPathArg = callArgs[1][2]
    expect(chartPathArg).toContain('argocd-app')
  })

  it('passes application name as release name to helm template', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      if (options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from('apiVersion: v1\nkind: Test'))
      }
      return 0
    })

    const customValues = `applicationName: release-name-test
applicationNamespace: argocd
application:
  project: default
  destination:
    server: https://kubernetes.default.svc
    namespace: test
  source:
    repoURL: https://github.com/test/test.git
    targetRevision: main
    path: test/`

    await generateArgoCDAppManifest('release-name-test', 'dev', customValues)

    // Verify release name is passed correctly
    const callArgs = mockExec.mock.calls[0]
    expect(callArgs[1][1]).toBe('release-name-test')
  })
})
