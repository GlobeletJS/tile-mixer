import { setParams } from "./params.js";
import { initWorkers } from "./boss.js";
import { initDataPrep } from "./data-prep.js";
import workerCode from "../build/worker.bundle.js";

export function initTileMixer(userParams) {
  const params = setParams(userParams);
  const queue = params.queue;

  // Initialize workers
  const workerPath = URL.createObjectURL( new Blob([workerCode]) );
  const workers = initWorkers(params.threads, workerPath, params.layers);
  URL.revokeObjectURL(workerPath);

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

      if (params.verbose) {
        console.log("tile-mixer: " + 
          "tile ID = " + [z, x, y].join("/") + ", " +
          "chunks.length = " + chunks.length);
      }

      const prepTaskId = queue.enqueueTask({ getPriority, chunks });
      reqHandle.abort = () => queue.cancelTask(prepTaskId);
    }

    return reqHandle;
  }

  // Return API
  return {
    request,
    activeTasks: () => workers.activeTasks() + queue.countTasks(),
    workerTasks: () => workers.activeTasks(),
    queuedTasks: () => queue.countTasks(),
    terminate: () => workers.terminate(),
  };
}
