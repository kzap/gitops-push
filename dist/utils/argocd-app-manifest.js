import * as exec from '@actions/exec';
import { fetchTcTool } from './tools.js';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as yaml from 'js-yaml';
import _ from 'lodash';

async function generateValuesYaml(applicationName, environment, sourceRepo, sourceOrg, sourceBranch, customValues) {
    // define defaultValues YAML object as a JSON object
    const defaultValues = {
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
    };
    // if customValues is not provided, return defaultValues
    if (!customValues) {
        return yaml.dump(defaultValues);
    }
    // parse customValues as YAML object
    try {
        const customValuesYaml = yaml.load(customValues);
        // merge defaultValues and customValues using lodash merge
        const mergedValues = _.merge(defaultValues, customValuesYaml);
        return yaml.dump(mergedValues);
    }
    catch (error) {
        throw new Error(`Invalid custom values YAML: ${error}`);
    }
}
async function generateArgoCDAppManifest(applicationName, environment, customValuesYaml) {
    // download helm tool using tc cache
    await fetchTcTool('helm');
    // store custom values yaml in a temporary file
    const customValuesFilePath = path.join(os.tmpdir(), 'custom-values.yaml');
    await fs.promises.writeFile(customValuesFilePath, customValuesYaml);
    // render the manifest using helm template
    await exec.exec('helm', [
        'template',
        '.',
        '-f',
        customValuesFilePath
    ]);
    return `
  apiVersion: argoproj.io/v1alpha1
  kind: Application
  metadata:
    name: ${applicationName}
    namespace: argocd
  spec:
    project: default
  `;
}

export { generateArgoCDAppManifest, generateValuesYaml };
//# sourceMappingURL=argocd-app-manifest.js.map
