export declare function generateValuesYaml(applicationName: string, environment: string, sourceRepo: string, sourceOrg: string, sourceBranch: string, gitopsPath: string, customValues: string, applicationManifestsPath: string): Promise<string>;
export declare function generateArgoCDAppManifest(customValuesYaml: string, argoCDAppHelmChartGitURL: string): Promise<string>;
