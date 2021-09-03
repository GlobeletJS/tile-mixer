import resolve from '@rollup/plugin-node-resolve';
import { worker } from "./worker-plugin.js";
import pkg from "../package.json";

export default [{
  input: 'src/worker/worker.js',
  plugins: [
    resolve({ dedupe: ["pbf-esm"] }),
  ],
  output: {
    file: 'build/worker.bundle.js',
    format: 'esm',
    name: pkg.name,
  }
}, {
  input: 'src/main.js',
  plugins: [
    resolve({ dedupe: ["pbf-esm"] }),
    worker(),
  ],
  output: {
    file: pkg.main,
    format: 'esm',
    name: pkg.name,
  }
}];
