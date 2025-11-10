import * as tc from '@actions/tool-cache'
import * as core from '@actions/core'
import * as path from 'path'
import * as exec from '@actions/exec'
import type { ExecOptions } from '@actions/exec'

type SupportedTool = 'helm'
type PlatformSubset = Extract<NodeJS.Platform, 'linux' | 'darwin' | 'win32'>

const toolDownloadUrl: Record<
  SupportedTool,
  Record<string, Record<PlatformSubset, string>>
> = {
  helm: {
    latest: {
      linux: 'https://get.helm.sh/helm-v3.14.4-linux-amd64.tar.gz',
      darwin: 'https://get.helm.sh/helm-v3.14.4-darwin-amd64.tar.gz',
      win32: 'https://get.helm.sh/helm-v3.14.4-windows-amd64.zip'
    }
  }
}

export async function fetchTcTool(
  tool: SupportedTool,
  version: string = 'latest'
): Promise<boolean> {
  // Ensure runner envs exist for tool-cache when running outside GitHub Actions
  if (!process.env.RUNNER_TOOL_CACHE) {
    process.env.RUNNER_TOOL_CACHE = `${process.cwd()}/.runner_tool_cache`
  }
  if (!process.env.RUNNER_TEMP) {
    process.env.RUNNER_TEMP = `${process.cwd()}/.runner_temp`
  }
  const platform = process.platform as PlatformSubset
  const toolDirectory = tc.find(tool, version, platform)
  if (toolDirectory) {
    core.info(
      `Tool ${tool} version ${version} is already cached in ${toolDirectory}`
    )
    core.addPath(toolDirectory)
    return true
  } else {
    core.info(`Tool ${tool} version ${version} is not cached, downloading...`)
  }

  // check if we have a download url for the tool
  if (!toolDownloadUrl[tool]) {
    throw new Error(`No download url found for tool: ${tool}`)
  }

  // check if we have a download url for the current version
  if (!toolDownloadUrl[tool][version]) {
    throw new Error(
      `No download url found for tool: ${tool} version: ${version}`
    )
  }

  // check if we have a download url for the current platform
  if (!toolDownloadUrl[tool][version][platform]) {
    throw new Error(
      `No download url found for tool: ${tool} version: ${version} on platform: ${platform}`
    )
  }

  // download the tool using tc cache
  let downloadUrl = toolDownloadUrl[tool][version][platform]
  const arch = process.arch
  const archLabel = arch === 'x64' ? 'amd64' : arch === 'arm64' ? 'arm64' : arch
  // Replace architecture segment in URL if needed
  downloadUrl = downloadUrl.replace('amd64', archLabel)

  const downloadPath = await tc.downloadTool(downloadUrl)
  const isZip = downloadUrl.endsWith('.zip')
  const extractedPath = isZip
    ? await tc.extractZip(downloadPath)
    : await tc.extractTar(downloadPath)

  const platformName = platform === 'win32' ? 'windows' : platform
  const binaryDir = path.join(extractedPath, `${platformName}-${archLabel}`)
  const cachedPath = await tc.cacheDir(binaryDir, tool, version)
  core.addPath(cachedPath)
  core.info(`Tool ${tool} version ${version} has been cached in ${cachedPath}`)
  return true
}

export async function setupTool(tool: SupportedTool): Promise<boolean> {
  // if tool is helm run, do helm plugin install https://github.com/aslafy-z/helm-git --version 1.4.1
  if (tool === 'helm') {
    let {
      exitCode: helmPluginInstallExitCode,
      stdout: helmPluginInstallStdout,
      stderr: helmPluginInstallStderr
    } = await execWithOutput('helm', [
      'plugin',
      'install',
      'https://github.com/aslafy-z/helm-git',
      '--version',
      '1.4.1'
    ])
    if (helmPluginInstallExitCode !== 0) {
      throw new Error(
        `helm plugin install failed with exit code ${helmPluginInstallExitCode}: ${helmPluginInstallStderr}`
      )
    }
    core.info('Helm git plugin installed')

    // show output of helm plugin list
    let {
      exitCode: helmPluginListExitCode,
      stdout: helmPluginListStdout,
      stderr: helmPluginListStderr
    } = await execWithOutput('helm', ['plugin', 'list'])
    if (helmPluginListExitCode !== 0) {
      throw new Error(
        `helm plugin list failed with exit code ${helmPluginListExitCode}: ${helmPluginListStderr}`
      )
    }
    core.info(`Helm plugins list: ${helmPluginListStdout}`)
    return true
  }
  return false
}

export async function execWithOutput(
  command: string,
  args: string[],
  options?: ExecOptions
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let stdout = ''
  let stderr = ''
  const defaultOptions: ExecOptions = {
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString()
      },
      stderr: (data: Buffer) => {
        stderr += data.toString()
      }
    }
  }
  const finalOptions = { ...defaultOptions, ...options }

  core.info(`Executing command: ${command} ${args.join(' ')}`)
  const exitCode = await exec.exec(command, args, finalOptions)
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() }
}
