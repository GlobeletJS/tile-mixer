import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs'; // Needed for pbf module
import pkg from "../package.json";

export default [{
  input: 'src/main.js',
  plugins: [
    resolve(),
  ],
  output: {
    file: pkg.main,
    format: 'esm',
    name: pkg.name,
  }
}, {
  input: 'src/worker.js',
  plugins: [
    resolve(),
    commonjs(),
  ],
  output: {
    file: 'dist/worker.bundle.js',
    format: 'esm',
    name: pkg.name,
  }
}];
