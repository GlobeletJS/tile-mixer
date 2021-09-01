import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs'; // Needed for pbf module
import { worker } from "./worker-plugin.js";
import pkg from "../package.json";

export default [{
  input: 'src/worker/worker.js',
  plugins: [
    resolve({ dedupe: ["pbf"] }),
    commonjs(),
  ],
  output: {
    file: 'build/worker.bundle.js',
    format: 'esm',
    name: pkg.name,
  }
}, {
  input: 'src/main.js',
  plugins: [
    resolve({ dedupe: ["pbf"] }),
    worker(),
  ],
  output: {
    file: pkg.main,
    format: 'esm',
    name: pkg.name,
  }
}];
