import * as exec from '@actions/exec'
import { fetchTcTool } from './tools'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import * as yaml from 'js-yaml'
import _ from 'lodash'

export async function generateValuesYaml(
  applicationName: string,
  environment: string,
  sourceRepo: string,
  sourceOrg: string,
  sourceBranch: string,
  customValues: string
): Promise<string> {
  // define defaultValues YAML object as a JSON object
  const defaultValues: Record<string, any> = {
    applicationName: `${applicationName}-${environment}`,
    application: {
      destination: {
        namespace: applicationName
      },
      source: {
        repoURL: `https://github.com/${sourceOrg}/${sourceRepo}.git`,
        targetRevision: sourceBranch,
        path: `${applicationName}/${environment}/`
      }
    }
  }

  // if customValues is not provided, return defaultValues
  if (!customValues) {
    return yaml.dump(defaultValues)
  }

  // parse customValues as YAML object
  try {
    const customValuesYaml = yaml.load(customValues)

    // merge defaultValues and customValues using lodash merge
    const mergedValues = _.merge(defaultValues, customValuesYaml)
    return yaml.dump(mergedValues)
  } catch (error) {
    throw new Error(`Invalid custom values YAML: ${error}`)
  }
}

export async function generateArgoCDAppManifest(
  applicationName: string,
  environment: string,
  customValuesYaml: string
): Promise<string> {
  // download helm tool using tc cache
  await fetchTcTool('helm')

  // store custom values yaml in a temporary file
  const customValuesFilePath = path.join(os.tmpdir(), 'custom-values.yaml')
  await fs.promises.writeFile(customValuesFilePath, customValuesYaml)

  // path to the helm chart
  const chartPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    '../templates/helm/argocd-app'
  )

  // capture stdout from helm template command
  let stdout = ''
  let stderr = ''
  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString()
      },
      stderr: (data: Buffer) => {
        stderr += data.toString()
      }
    }
  }

  // render the manifest using helm template
  const exitCode = await exec.exec(
    'helm',
    ['template', applicationName, chartPath, '-f', customValuesFilePath],
    options
  )

  if (exitCode !== 0) {
    throw new Error(
      `helm template failed with exit code ${exitCode}: ${stderr}`
    )
  }

  return stdout.trim()
}
