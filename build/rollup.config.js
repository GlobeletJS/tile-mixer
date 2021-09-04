import resolve from '@rollup/plugin-node-resolve';
import pkg from "../package.json";

export default {
  input: 'src/index.js',
  plugins: [
    resolve(),
  ],
  external: [
    ...Object.keys(pkg.peerDependencies || {})
  ],
  output: {
    file: pkg.main,
    format: 'esm',
    name: pkg.name,
  }
};
