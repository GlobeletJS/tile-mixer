import { setParams } from "./params.js";
import { initWorkers } from "./boss.js";
import workerCode from "../build/worker.bundle.js";

export function initTileMixer(userParams) {
  const params = setParams(userParams);
  const { queue, context: { loadBuffers, loadAtlas } } = params;

  // Initialize workers
  const workerPath = URL.createObjectURL( new Blob([workerCode]) );
  const workers = initWorkers(workerPath, params);
  URL.revokeObjectURL(workerPath);

  // Define request function
  function request({ z, x, y, getPriority, callback }) {
    const reqHandle = {};

    const readTaskId = workers.startTask({ z, x, y }, prepData);
    reqHandle.abort = () => workers.cancelTask(readTaskId);

    function prepData(err, source) {
      if (err) return callback(err);

      const chunks = getPrepFuncs(source, callback);
      const prepTaskId = queue.enqueueTask({ getPriority, chunks });

      reqHandle.abort = () => queue.cancelTask(prepTaskId);
    }

    return reqHandle;
  }

  function getPrepFuncs(source, callback) {
    const { atlas, layers } = source;

    const prepTasks = Object.values(layers)
      .map(l => () => { l.buffers = loadBuffers(l.buffers); });

    if (atlas) prepTasks.push(() => { source.atlas = loadAtlas(atlas); });

    prepTasks.push(() => callback(null, source));
    return prepTasks;
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
