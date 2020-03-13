export function initWorkers(nThreads, codeHref, styles) {
  const tasks = {};
  var msgId = 0;

  // Initialize the worker threads, and send them the styles
  function trainWorker() {
    const worker = new Worker(codeHref);
    worker.postMessage({ id: 0, type: "styles", payload: styles });
    worker.onmessage = handleMsg;
    return worker;
  }
  const workers = Array.from(Array(nThreads), trainWorker);
  const workLoads = Array.from(Array(nThreads), () => 0);

  return {
    startTask,
    cancelTask,
    activeTasks: () => workLoads.reduce( (a, b) => a + b, 0 ),
    terminate: () => workers.forEach( worker => worker.terminate() ),
  }

  function startTask(payload, callback) {
    let workerID = getIdleWorkerID(workLoads);
    workLoads[workerID] += 1;

    msgId += 1;
    tasks[msgId] = { callback, workerID };
    workers[workerID].postMessage({ id: msgId, type: "start", payload });

    return msgId; // Returned ID can be used for later cancellation
  }

  function cancelTask(id) {
    let task = tasks[id];
    if (!task) return;
    workers[task.workerID].postMessage({ id, type: "cancel" });
    workLoads[task.workerID] -= 1;
    delete tasks[id];
  }

  function handleMsg(msgEvent) {
    const msg = msgEvent.data; // { id, type, key, payload }
    const task = tasks[msg.id];
    // NOTE: 'this' is the worker that emitted msgEvent
    if (!task) return this.postMessage({ id: msg.id, type: "cancel" });

    switch (msg.type) {
      case "error":
        task.callback(msg.payload);
        break; // Clean up below

      case "header":
        task.header = msg.payload;
        task.result = initJSON(msg.payload);
        return this.postMessage({ id: msg.id, type: "continue" });

      case "compressed":
      case "features":
        let features = task.result[msg.key][msg.type];
        msg.payload.forEach( feature => features.push(feature) );
        return this.postMessage({ id: msg.id, type: "continue" });

      case "done":
        let err = checkResult(task.result, task.header);
        task.callback(err, task.result);
        break; // Clean up below

      default:
        task.callback("ERROR: worker sent bad message type!");
        break; // Clean up below
    }

    workLoads[task.workerID] -= 1;
    delete tasks[msg.id];
  }
}

function getIdleWorkerID(workLoads) {
  let id = 0;
  for (let i = 1; i < workLoads.length; i++) {
    if (workLoads[i] < workLoads[id]) id = i;
  }
  return id;
}

function initJSON(headers) {
  const json = {};
  Object.entries(headers).forEach( ([key, hdr]) => {
    json[key] = { type: "FeatureCollection", compressed: [] };
    if (hdr.features) json[key].features = [];
    if (hdr.properties) json[key].properties = hdr.properties;
  });
  return json;
}

function checkResult(json, header) {
  let allOk = Object.keys(header)
    .every( k => checkData(json[k], header[k]) );

  return allOk
    ? null
    : "ERROR: JSON from worker failed checks!";
}

function checkData(data, counts) {
  // data is a GeoJSON Feature Collection, augmented with 'compressed' array
  var ok = data.compressed.length === counts.compressed;
  if (counts.features) {
    // We also have raw GeoJSON for querying. Check the length
    ok = ok && data.features.length === counts.features;
  }
  return ok;
}
