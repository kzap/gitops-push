import * as exec from '@actions/exec'
import * as core from '@actions/core'
import { fetchTcTool, setupTool } from './tools'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import * as yaml from 'js-yaml'
import _ from 'lodash'

// Generate the Values YAML file for the ArgoCD ApplicationSet Manifest using the templating tool (helm)
//
// @param {string} applicationName - The name of the application
// @param {string} environment - The environment of the application
// @param {string} sourceRepo - The name of the source repository
// @param {string} sourceOrg - The organization of the source repository
// @param {string} sourceBranch - The branch of the source repository
// @param {string} gitopsPath - The path in the gitops repository where all the files will be pushed
// @param {string} customValues - The custom values yaml for the application
// @param {string} applicationManifestsPath - The path to the application manifests directory
// @returns {Promise<string>} The path to the generated Values YAML file
//
// @example
// generateValuesYaml(
//   applicationName: 'my-application',
//   environment: 'production',
//   sourceRepo: 'my-repo',
//   sourceOrg: 'my-org',
//   sourceBranch: 'main',
//   gitopsPath: './',
//   customValues: 'custom-values.yaml',
//   applicationManifestsPath: './'
// )
export async function generateValuesYaml(
  applicationName: string,
  environment: string,
  sourceRepo: string,
  sourceOrg: string,
  sourceBranch: string,
  gitopsPath: string,
  customValues: string,
  applicationManifestsPath: string
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
        path: `${path.join(gitopsPath, applicationName, environment, applicationManifestsPath, '/')}`
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

// Generate the ArgoCD ApplicationSet Manifest file using the templating tool (helm)
//
// @param {string} customValuesYaml - The custom values yaml for the application
// @param {string} argoCDAppHelmChart - The path to the ArgoCD app helm chart
// @returns {Promise<string>} The path to the generated ArgoCD ApplicationSet Manifest
//
// @example
// generateArgoCDAppManifest(
//   applicationName: 'my-application',
//   environment: 'production',
//   customValuesYaml: 'custom-values.yaml',
//   argoCDAppHelmChart: '../templates/helm/argocd-app'
// )
export async function generateArgoCDAppManifest(
  customValuesYaml: string,
  argoCDAppHelmChart: string
): Promise<string> {
  // download helm tool using tc cache
  await fetchTcTool('helm')
  await setupTool('helm')

  // store custom values yaml in a temporary random file name
  const randomCustomValuesFileName = `gitops-push-custom-values-${Date.now()}-${Math.random().toString(36).substring(2, 15)}.yaml`
  const customValuesFilePath = path.join(
    os.tmpdir(),
    randomCustomValuesFileName
  )
  await fs.promises.writeFile(customValuesFilePath, customValuesYaml)

  // resolve and validate path to the helm chart
  // If relative path is provided, resolve it from current working directory
  const resolvedChartPath = path.isAbsolute(argoCDAppHelmChart)
    ? argoCDAppHelmChart
    : path.resolve(process.cwd(), argoCDAppHelmChart)

  const chartYamlPath = path.join(resolvedChartPath, 'Chart.yaml')
  try {
    await fs.promises.readFile(chartYamlPath)
  } catch {
    throw new Error(`we cant find helm chart in path given: ${chartYamlPath}`)
  }

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
    ['template', 'argocd-app', resolvedChartPath, '-f', customValuesFilePath],
    options
  )

  if (exitCode !== 0) {
    throw new Error(
      `helm template failed with exit code ${exitCode}: ${stderr}`
    )
  }

  // remove custom values file
  await fs.promises.unlink(customValuesFilePath)

  // save output to a temporary file
  const randomOutputFileName = `gitops-push-output-manifest-${Date.now()}-${Math.random().toString(36).substring(2, 15)}.yaml`
  const outputFilePath = path.join(os.tmpdir(), randomOutputFileName)
  await fs.promises.writeFile(outputFilePath, stdout.trim())

  core.info(
    `✅ Successfully generated ArgoCD ApplicationSet Manifest at ${outputFilePath}`
  )

  // save to github summary
  await core.summary
    .addHeading(`ArgoCD ApplicationSet Manifest:`)
    .addCodeBlock(stdout.trim(), 'yaml')
    .write()

  return outputFilePath
}
