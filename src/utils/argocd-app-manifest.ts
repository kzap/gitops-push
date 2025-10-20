import * as exec from '@actions/exec'
import { fetchTcTool } from './tools'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

export async function generateCustomValuesYaml(
  applicationName: string,
  environment: string,
  sourceRepo: string,
  sourceOrg: string,
  sourceBranch: string,
  customValues: string
): Promise<string> {
  return `
  apiVersion: argoproj.io/v1alpha1
  kind: Application
  metadata:
    name: ${applicationName}
    namespace: argocd
  spec:
    project: default
    source:
      repoURL: https://github.com/${sourceOrg}/${sourceRepo}.git
      targetRevision: ${sourceBranch}
      path: k8s/${environment}
  `
}

export async function generateArgoCDAppManifest(
  applicationName: string,
  environment: string,
  customValuesYaml: string
) {
  // download helm tool using tc cache
  await fetchTcTool('helm')

  // store custom values yaml in a temporary file
  const customValuesFilePath = path.join(os.tmpdir(), 'custom-values.yaml')
  await fs.promises.writeFile(customValuesFilePath, customValuesYaml)

  // render the manifest using helm template
  const manifest = await exec.exec('helm', [
    'template',
    '.',
    '-f',
    customValuesFilePath
  ])

  return `
  apiVersion: argoproj.io/v1alpha1
  kind: Application
  metadata:
    name: ${applicationName}
    namespace: argocd
  spec:
    project: default
  `
}
