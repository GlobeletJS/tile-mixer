import { setParams } from "./params.js";
import { initWorkers } from "./boss.js";
import { initDataPrep } from "./data-prep.js";
const workerPath = "./worker.bundle.js";

export function initTileMixer(userParams) {
  const params = setParams(userParams);

  // Initialize workers
  const workers = initWorkers(params.threads, workerPath, params.layers);

  // Initialize chunked queue, OR input it? What about prioritization? TODO
  // Initialize data prep functions
  const getPrepFuncs = initDataPrep(params.layers);

  // Define request function
  function request(z, x, y, callback) {
    const url = params.getURL(z, x, y);
    const payload = { href: url, size: 512, zoom: z };
    const wrapCb = (err, src) => prepCallback(err, src, z, callback);
    return workers.startTask(payload, wrapCb);
  }

  // Returned API  TODO: Extend canceler to stop prerendering
  return {
    request,
    cancelTask: (id) => workers.cancelTask(id),
    activeTasks: () => workers.activeTasks(),
    terminate: () => workers.terminate(),
  };

  function prepCallback(err, source, zoom, callback) {
    if (err) return callback(err);

    getPrepFuncs(source, zoom).forEach( func => func() );

    return callback(null, source);
  }
}
