# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build/Lint/Test Commands
- Build: `npm run package`
- Format: `npm run format:write`
- Lint: `npm run lint`
- Test (all): `npm run test`
- Test (single): `NODE_OPTIONS=--experimental-vm-modules NODE_NO_WARNINGS=1 npx jest __tests__/filename.test.js`
- Build + lint + test: `npm run all`

## Code Style Guidelines
- **Formatting**: Prettier with 80 char width, 2 space indent, single quotes, no semicolons
- **Linting**: ESLint with recommended, Jest, and Prettier configurations
- **Imports**: ES modules (import/export), organized by external then internal
- **Error Handling**: Always use try/catch blocks for async actions, use core.setFailed() for errors
- **Naming**: camelCase for variables/functions, descriptive names
- **Documentation**: JSDoc comments for functions
- **Testing**: Jest for unit tests, mocking external dependencies

This is a GitHub Action project using Node.js with modern ES modules.