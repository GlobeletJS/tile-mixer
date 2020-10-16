import { setParams } from "./params.js";
import { initWorkers } from "./boss.js";
import { initDataPrep } from "./data-prep.js";
import workerCode from "../build/worker.bundle.js";

export function initTileMixer(userParams) {
  const params = setParams(userParams);
  const queue = params.queue;

  // Initialize workers
  const workerPath = URL.createObjectURL( new Blob([workerCode]) );
  const workers = initWorkers(workerPath, params);
  URL.revokeObjectURL(workerPath);

  const getPrepFuncs = initDataPrep(params.context);

  // Define request function
  function request({ z, x, y, getPriority, callback }) {
    const reqHandle = {};

    const type = params.source.type;
    const readInfo = {
      type,
      z, x, y,
      source: params.source,
      layerID: params.layers[0].id,
      size: 512,
    };
    if (type === "vector") readInfo.href = params.getURL(z, x, y);

    const readTaskId = workers.startTask(readInfo, prepData);
    reqHandle.abort = () => workers.cancelTask(readTaskId);

    function prepData(err, source) {
      if (err) return callback(err);

      const chunks = getPrepFuncs(source, callback);
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
