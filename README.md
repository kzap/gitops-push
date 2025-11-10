[![E2E Test](https://github.com/kzap/gitops-push/actions/workflows/e2e.yml/badge.svg)](https://github.com/kzap/gitops-push/actions/workflows/e2e.yml)
[![Coverage](./badges/coverage.svg)](./coverage/lcov-report/index.html)

# GitOps Push Action

This GitHub Action automates the deployment of applications using GitOps
principles with ArgoCD. It generates ArgoCD ApplicationSet manifests from your
application manifests and pushes them to a GitOps repository, enabling
declarative, version-controlled deployments across multiple environments.

# What's New

Please refer to the
[release page](https://github.com/kzap/gitops-push/releases/latest) for the
latest release notes.

# Usage

<!-- start usage -->

```yaml
- uses: kzap/gitops-push@v1
  with:
    # GitHub token with push permissions to the GitOps repository
    # Required: true
    gitops-token: ''

    # Name of the GitOps repository (format: owner/repo)
    # Can also be specified via GITOPS_REPOSITORY environment variable
    # Required: false (but either input or env var must be provided)
    gitops-repository: ''

    # Branch name to push to in the GitOps repository
    # Defaults to the repository's default branch
    # Required: false
    gitops-branch: ''

    # Path in the GitOps repository where all files will be pushed
    # Defaults to the current directory if not specified
    # Required: false
    gitops-path: ''

    # The environment to deploy to (e.g., dev, staging, production)
    # Required: true
    environment: ''

    # Name of the application
    # Defaults to the current repository name if not specified
    # Required: false
    application-name: ''

    # Path to the application manifests directory to be copied to GitOps repo
    # Defaults to the current directory if not specified
    # Required: false
    application-manifests-path: ''

    # Path to the Helm chart used to render the ArgoCD Application
    # Default: './templates/helm/argocd-app'
    # Required: false
    argocd-app-helm-chart: ''

    # Custom values YAML for the application
    # Defaults to an empty string if not specified
    # Required: false
    custom-values: ''
```

<!-- end usage -->

# Scenarios

- [What's New](#whats-new)
- [Usage](#usage)
- [Scenarios](#scenarios)
  - [Basic deployment to a GitOps repository](#basic-deployment-to-a-gitops-repository)
  - [Multi-environment deployments](#multi-environment-deployments)
  - [Custom application name and path](#custom-application-name-and-path)
  - [Using custom values](#using-custom-values)
  - [Deploy to specific branch in GitOps repo](#deploy-to-specific-branch-in-gitops-repo)
  - [Using environment variable for repository](#using-environment-variable-for-repository)
  - [Complete example with all inputs](#complete-example-with-all-inputs)
- [How It Works](#how-it-works)
- [Directory Structure](#directory-structure)
- [Recommended Permissions](#recommended-permissions)
- [License](#license)

## Basic deployment to a GitOps repository

Deploy your application manifests to a GitOps repository for a specific
environment:

```yaml
- name: Checkout
  uses: actions/checkout@v5

- name: Deploy to GitOps
  uses: kzap/gitops-push@v1
  with:
    gitops-token: ${{ secrets.GITOPS_TOKEN }}
    gitops-repository: myorg/gitops-repo
    environment: production
```

## Multi-environment deployments

Deploy to different environments using GitHub Actions matrix strategy:

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        environment: [dev, staging, production]
    environment: ${{ matrix.environment }}
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Deploy to ${{ matrix.environment }}
        uses: kzap/gitops-push@v1
        with:
          gitops-token: ${{ secrets.GITOPS_TOKEN }}
          gitops-repository: myorg/gitops-repo
          environment: ${{ matrix.environment }}
```

## Custom application name and path

Specify a custom application name and the path to your application manifests:

```yaml
- name: Deploy with custom settings
  uses: kzap/gitops-push@v1
  with:
    gitops-token: ${{ secrets.GITOPS_TOKEN }}
    gitops-repository: myorg/gitops-repo
    environment: production
    application-name: my-custom-app
    application-manifests-path: ./k8s/manifests
```

## Using custom values

Pass custom Helm values to configure your ArgoCD Application:

```yaml
- name: Deploy with custom values
  uses: kzap/gitops-push@v1
  with:
    gitops-token: ${{ secrets.GITOPS_TOKEN }}
    gitops-repository: myorg/gitops-repo
    environment: production
    custom-values: |
      replicaCount: 3
      image:
        tag: v1.2.3
      resources:
        limits:
          memory: 512Mi
```

## Deploy to specific branch in GitOps repo

Push to a specific branch in your GitOps repository:

```yaml
- name: Deploy to feature branch
  uses: kzap/gitops-push@v1
  with:
    gitops-token: ${{ secrets.GITOPS_TOKEN }}
    gitops-repository: myorg/gitops-repo
    gitops-branch: feature/new-deployment
    environment: staging
```

## Using environment variable for repository

Set the GitOps repository via environment variable:

```yaml
env:
  GITOPS_REPOSITORY: myorg/gitops-repo

jobs:
  deploy:
    runs-on: ubuntu-latest
steps:
  - name: Checkout
        uses: actions/checkout@v5

      - name: Deploy to GitOps
        uses: kzap/gitops-push@v1
    with:
          gitops-token: ${{ secrets.GITOPS_TOKEN }}
          environment: production
```

## Complete example with all inputs

A comprehensive example using all available inputs:

```yaml
name: Full Deployment
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
steps:
      - name: Checkout source repository
        uses: actions/checkout@v5

      - name: Deploy to GitOps repository
        uses: kzap/gitops-push@v1
    with:
          gitops-token: ${{ secrets.GITOPS_TOKEN }}
          gitops-repository: myorg/gitops-repo
          gitops-branch: main
          gitops-path: applications
          environment: production
          application-name: my-app
          application-manifests-path: ./deploy/manifests
          argocd-app-helm-chart: ./deploy/argocd-helm
          custom-values: |
            namespace: production
            replicaCount: 3
            autoscaling:
              enabled: true
              minReplicas: 2
              maxReplicas: 10
```

# How It Works

This action automates the GitOps workflow by:

1. **Cloning the GitOps Repository**: Securely clones your GitOps repository to
   a temporary location
2. **Generating ArgoCD Manifests**: Creates an ArgoCD ApplicationSet manifest
   using a Helm chart template
3. **Organizing Files**: Structures your deployment files in the GitOps
   repository as:
   ```
   <gitops-path>/
   ├── application-sets/
   │   └── <application-name>-<environment>.yaml  # ArgoCD ApplicationSet manifest
   └── applications/
       └── <application-name>/
           └── <environment>/
               └── [your application manifests]
   ```
4. **Committing and Pushing**: Commits the changes with a descriptive message
   and pushes to the GitOps repository
5. **ArgoCD Sync**: ArgoCD automatically detects the changes and syncs your
   application to the cluster

The action generates ArgoCD ApplicationSet manifests that enable:

- Automatic discovery of application environments
- Declarative, version-controlled deployments
- Easy rollbacks via Git history
- Multi-cluster deployments
- Environment-specific configurations

# Directory Structure

After running the action, your GitOps repository will have the following
structure:

```
gitops-repo/
└── <gitops-path>/
    ├── application-sets/
    │   ├── my-app-dev.yaml
    │   ├── my-app-staging.yaml
    │   └── my-app-production.yaml
    └── applications/
        └── my-app/
            ├── dev/
            │   ├── deployment.yaml
            │   ├── service.yaml
            │   └── ingress.yaml
            ├── staging/
            │   ├── deployment.yaml
            │   ├── service.yaml
            │   └── ingress.yaml
            └── production/
                ├── deployment.yaml
                ├── service.yaml
                └── ingress.yaml
```

The `application-sets` directory contains the ArgoCD ApplicationSet manifests
that tell ArgoCD where to find your application manifests and how to deploy
them.

The `applications` directory contains your actual Kubernetes manifests organized
by application name and environment.

# Recommended Permissions

When using this action in your GitHub Actions workflow, the following
permissions are recommended:

For the **source repository** workflow:

```yaml
permissions:
  contents: read # Read source code
```

For the **GitOps token** (used to push to GitOps repository):

```yaml
# The token must have the following permissions on the GitOps repository:
# - contents: write  # Push commits
```

You can use a fine-grained Personal Access Token (PAT) or GitHub App token with
write access to the GitOps repository. Store it as a secret and reference it via
`${{ secrets.GITOPS_TOKEN }}`.

**Security Best Practice**: Use a dedicated bot account or GitHub App with
minimal permissions (write access only to the GitOps repository) rather than a
personal token.

# License

The scripts and documentation in this project are released under the
[MIT License](LICENSE).
