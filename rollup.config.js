// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

const config = {
  input: 'src/index.js',
  output: {
    esModule: true,
    file: 'dist/index.js',
    format: 'es',
    sourcemap: true
  },
  plugins: [
    commonjs(),
    nodeResolve({ preferBuiltins: true, extensions: ['.js', '.ts'] }),
    typescript({ include: ['src/**/*.ts'] })
  ]
}

export default config
