import { setParams } from "./params.js";
import { initWorkers } from "./boss.js";
import { initDataPrep } from "./data-prep.js";
const workerPath = "./worker.bundle.js";

export function initTileMixer(userParams) {
  const params = setParams(userParams);
  const queue = params.queue;

  // Initialize workers and data prep function getter
  const workers = initWorkers(params.threads, workerPath, params.layers);
  const getPrepFuncs = initDataPrep(params.layers);

  // Define request function
  function request({ z, x, y, getPriority, callback }) {
    const reqHandle = {};

    const readInfo = { 
      href: params.getURL(z, x, y),
      size: 512, 
      zoom: z 
    };
    const readTaskId = workers.startTask(readInfo, prepData);
    reqHandle.abort = () => workers.cancelTask(readTaskId);

    function prepData(err, source) {
      if (err) return callback(err);

      const chunks = getPrepFuncs(source, z);
      chunks.push( () => callback(null, source) );

      const prepTaskId = queue.enqueueTask({ getPriority, chunks });
      reqHandle.abort = () => queue.cancelTask(prepTaskId);
    }

    return reqHandle;
  }

  // Return API
  return {
    request,
    activeTasks: () => workers.activeTasks(),
    terminate: () => workers.terminate(),
  };
}
