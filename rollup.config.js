import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from "@rollup/plugin-babel";
import { terser } from 'rollup-plugin-terser';
// import { eslint } from 'rollup-plugin-eslint';

export default {
  input: './index.js',
  output: {
    exports: 'auto',
    file: './dist/index.js',
    format: 'cjs', // 定打包后的⽂件符合commonjs规范
    name: 'axios-api-catch',
  },
  plugins: [
    resolve(),
    commonjs(),
    // eslint({
    //   throwOnError: true,
    //   throwOnWarning: true,
    //   include: ['src/**'],
    //   exclude: ['node_modules/**']
    // }),
    babel({
      exclude: 'node_modules/**', // 防止打包node_modules下的文件
      babelHelpers: 'runtime' // 使plugin-transform-runtime生效
    }),
    terser()
  ]
}
