import * as yaml from 'js-yaml'

const { generateValuesYaml } = await import(
  '../src/utils/argocd-app-manifest.js'
)

describe('generateValuesYaml', () => {
  it('returns default values YAML when customValues is empty', async () => {
    const out = await generateValuesYaml(
      'my-app',
      'dev',
      'repo',
      'org',
      'main',
      '', // gitopsPath
      '', // customValues
      '' // applicationManifestsPath
    )
    const parsed = yaml.load(out)
    expect(parsed.applicationName).toBe('my-app-dev')
    expect(parsed.application.destination.namespace).toBe('my-app')
    expect(parsed.application.source.repoURL).toContain(
      'github.com/org/repo.git'
    )
    expect(parsed.application.source.targetRevision).toBe('main')
    expect(parsed.application.source.path).toBe('my-app/dev/')
  })

  it('merges custom values over defaults', async () => {
    const custom = `application:\n  destination:\n    namespace: custom-ns\n  source:\n    targetRevision: feature/x`
    const out = await generateValuesYaml(
      'app',
      'staging',
      'repo2',
      'org2',
      'main',
      '', // gitopsPath
      custom, // customValues
      '' // applicationManifestsPath
    )
    const parsed = yaml.load(out)
    expect(parsed.application.destination.namespace).toBe('custom-ns')
    expect(parsed.application.source.targetRevision).toBe('feature/x')
    // unchanged defaults remain
    expect(parsed.application.source.repoURL).toContain(
      'github.com/org2/repo2.git'
    )
  })
})
