import * as yaml from 'js-yaml'
import * as path from 'path'
import * as fs from 'fs'

const { generateArgoCDAppManifest } = await import(
  '../dist/utils/argocd-app-manifest.js'
)

describe('generateArgoCDAppManifest (real helm)', () => {
  const fixtureChart = path.resolve(
    path.join(
      path.dirname(new URL(import.meta.url).pathname),
      '../__fixtures__/helm/argocd-app'
    )
  )

  beforeAll(async () => {
    // Ensure tool-cache env vars are set for @actions/tool-cache
    const toolCacheDir = path.join(
      process.cwd(),
      '__tests__',
      '.runner_tool_cache'
    )
    const runnerTempDir = path.join(process.cwd(), '__tests__', '.runner_temp')
    await fs.promises.mkdir(toolCacheDir, { recursive: true })
    await fs.promises.mkdir(runnerTempDir, { recursive: true })
    process.env.RUNNER_TOOL_CACHE = toolCacheDir
    process.env.RUNNER_TEMP = runnerTempDir
  })

  it('generates ArgoCD Application manifest from helm template', async () => {
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
      customValues,
      fixtureChart
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
})
