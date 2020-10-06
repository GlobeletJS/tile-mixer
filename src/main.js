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

  const getPrepFuncs = initDataPrep(params.layers, params.context);

  // Define request function
  function request({ z, x, y, getPriority, callback }) {
    const reqHandle = {};

    var readInfo ={};
    if (userParams.source.type === "vector") {
      readInfo = { 
        type: "vector",
        href: params.getURL(z, x, y),
        size: 512, 
        zoom: z 
      };
    } else if (userParams.source.type === "geojson") {
      readInfo = {
        type: "geojson",
        source: userParams.source,
        layerID: userParams.layers[0].id,
        size: 512,
        tileX: x,
        tileY: y,
        zoom: z
      };
    }

    const readTaskId = workers.startTask(readInfo, prepData);
    reqHandle.abort = () => workers.cancelTask(readTaskId);

    function prepData(err, source) {
      if (err) return callback(err);

      const chunks = getPrepFuncs(source, z);
      chunks.push( () => callback(null, source) );

      const prepTaskId = queue.enqueueTask({ getPriority, chunks });

      if (params.verbose) {
        console.log("tile-mixer: " + 
          "tileID " + [z, x, y].join("/") + ", " +
          "chunks.length = " + chunks.length + ", " +
          "prepTaskId = " + prepTaskId
        );
      }

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
