// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

const config = {
  input: 'src/index.ts',
  external: [
    '@actions/core',
    '@actions/github',
    '@actions/io',
    '@actions/exec',
    '@actions/tool-cache',
    'fs',
    'path',
    'os',
    'js-yaml',
    'lodash'
  ],
  output: [
    {
      esModule: true,
      file: 'dist/index.js',
      format: 'es',
      sourcemap: true
    },
    {
      dir: 'dist',
      format: 'es',
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: 'src',
      entryFileNames: '[name].js'
    }
  ],
  plugins: [
    commonjs(),
    nodeResolve({ preferBuiltins: true, extensions: ['.js', '.ts'] }),
    typescript({ include: ['src/**/*.ts'] })
  ]
}

export default config
