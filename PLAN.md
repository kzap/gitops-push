# Implementation Plan for GitOps Push Action

This document outlines the implementation plan for the GitOps Push GitHub Action, which will generate and push ArgoCD application manifests to a GitOps repository.

## Features

The action will:
1. Generate ArgoCD ApplicationSet manifest files based on templates
2. Push these manifests to a specified GitOps repository
3. Organize manifests by environment and application name
4. Support configurable branches and repository destinations

## Implementation Steps

### 1. Add Required Dependencies

```bash
npm install @actions/io handlebars js-yaml @actions/exec
```

- `@actions/io`: File system operations
- `handlebars`: Templating library for generating YAML manifests
- `js-yaml`: YAML parsing and generation
- `@actions/exec`: Execute Git commands

### 2. Update Action Inputs in `action.yml`

Add a new optional input for application name:

```yaml
application-name:
  description: Name of the application (defaults to the current repository name if not specified)
  required: false
```

### 3. Create Directory Structure for Templates

Create the following structure:
```
- src/
  - templates/
    - applicationset.hbs
  - utils/
    - template.js
```

### 4. Create Template Utility Function

Implement a template utility in `src/utils/template.js` that uses Handlebars to fill in variables in templates.

### 5. Create ArgoCD ApplicationSet Template

Create a Handlebars template for ArgoCD ApplicationSet in `src/templates/applicationset.hbs`.

### 6. Update Main Implementation

The main implementation will:

1. Get inputs and set defaults
   - If `application-name` isn't provided, use `github.context.repo.repo`
   
2. Clone or create the GitOps repository
   - Create a temporary directory using `io.mkdirP()`
   - Clone the GitOps repository using Git commands via `exec`
   
3. Generate the manifest files
   - Create the target directory structure: `applicationsets/{applicationName}/`
   - Generate the ApplicationSet manifest with the template
   - Fill in variables:
     - `appsetName`: `{applicationName}-{environment}`
     - `sourceRepo`: Current GitHub repository
     - Other relevant fields
     
4. Commit and push changes
   - Stage the files
   - Create a commit with a descriptive message
   - Push to the specified branch

### 7. Error Handling

- Add comprehensive error handling
- Provide meaningful error messages
- Clean up temporary directories on failure

### 8. Testing

- Write unit tests for template generation
- Write unit tests for repository handling
- Create integration tests for the complete workflow

## Detailed Implementation Steps

### Step 1: Repository Setup and Template Generation

```javascript
// Get inputs
const applicationName = core.getInput('application-name') || github.context.repo.repo
const environment = core.getInput('environment')

// Create directory structure
const gitopsRepoBase = './gitops-repo-base'
await io.mkdirP(gitopsRepoBase)

// Target path for the application manifest
const applicationPath = path.join(gitopsRepoBase, 'applicationsets', applicationName)
await io.mkdirP(applicationPath)

// Generate manifest from template
const templateData = {
  appsetName: `${applicationName}-${environment}`,
  environment: environment,
  sourceRepo: github.context.repo.repo,
  sourceOrg: github.context.repo.owner,
  // Additional variables as needed
}

// Use template utility to generate manifest
const manifestContent = await generateFromTemplate('applicationset', templateData)

// Write manifest to file
const manifestPath = path.join(applicationPath, `${environment}.yml`)
await fs.promises.writeFile(manifestPath, manifestContent)
```

### Step 2: Git Operations

```javascript
// Clone the GitOps repository
await exec.exec('git', [
  'clone',
  `https://x-access-token:${gitopsToken}@github.com/${gitopsOrg}/${gitopsRepoName}.git`,
  gitopsRepoBase
])

// Checkout the target branch
if (gitopsBranch) {
  await exec.exec('git', ['checkout', gitopsBranch], { cwd: gitopsRepoBase })
}

// After generating manifest files
await exec.exec('git', ['add', '.'], { cwd: gitopsRepoBase })
await exec.exec('git', [
  'commit',
  '-m',
  `Update ${applicationName} ApplicationSet for ${environment} environment`
], { cwd: gitopsRepoBase })

// Push changes
await exec.exec('git', ['push', 'origin', gitopsBranch || 'HEAD'], { cwd: gitopsRepoBase })
```

## Next Steps

1. Implement the above plan
2. Add comprehensive documentation
3. Add examples in the README.md
4. Test with real-world GitOps repositories
5. Publish to GitHub Marketplace

This implementation will provide a flexible and reusable GitHub Action for managing ArgoCD applications through a GitOps workflow.