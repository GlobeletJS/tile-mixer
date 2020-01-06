function initWorkers(nThreads, codeHref, styles) {

  const tasks = {};
  var globalMsgId = 0;

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
    workLoads[workerID] ++;

    const msgId = ++globalMsgId; // Start from 1, since we used 0 for styles
    tasks[msgId] = { callback, workerID };
    workers[workerID].postMessage({ id: msgId, type: "start", payload });

    return msgId; // Returned ID can be used for later cancellation
  }

  function cancelTask(id) {
    let task = tasks[id];
    if (!task) return;
    workers[task.workerID].postMessage({ id, type: "cancel" });
    workLoads[task.workerID] --;
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

      case "data": 
        let features = task.result[msg.key].features;
        msg.payload.forEach( feature => features.push(feature) );
        return this.postMessage({ id: msg.id, type: "continue" });

      case "done":
        let err = checkJSON(task.result, task.header)
          ? null
          : "ERROR: JSON from worker failed checks!";
        task.callback(err, task.result);
        break; // Clean up below

      default:
        task.callback("ERROR: worker sent bad message type!");
        break; // Clean up below
    }

    workLoads[task.workerID] --;
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

function initJSON(header) {
  const json = {};
  Object.keys(header).forEach(key => {
    json[key] = { type: "FeatureCollection", features: [] };
  });
  return json;
}

function checkJSON(json, header) {
  return Object.keys(header).every(k => json[k].features.length === header[k]);
}

const vectorTypes = ["symbol", "circle", "line", "fill"];

function initTileMixer(params) {
  const nThreads = params.threads || 2;

  // Confirm supplied styles are all vector layers reading from the same source
  const layers = params.layers;
  if (!layers || !layers.length) fail("no valid array of style layers!");

  let allVectors = layers.every( l => vectorTypes.includes(l.type) );
  if (!allVectors) fail("not all layers are vector types!");

  let sameSource = layers.every( l => l.source === layers[0].source );
  if (!sameSource) fail("supplied layers use different sources!");

  // Construct function to get a tile URL
  const source = params.source;
  if (!source) fail("parameters.source is required!");
  const getURL = initUrlFunc(source.tiles);

  // Initialize workers
  const workers = initWorkers(nThreads, "./worker.bundle.js", layers);

  // Define request function
  function request(z, x, y, callback) {
    const url = getURL(z, x, y);
    const payload = { href: url, size: 512, zoom: z };
    return workers.startTask(payload, callback);
  }

  return {
    request,
    cancelTask: (id) => workers.cancelTask(id),
    activeTasks: () => workers.activeTasks(),
    terminate: () => workers.terminate(),
  };
}

function initUrlFunc(endpoints) {
  if (!endpoints || !endpoints.length) fail("no valid tile endpoints!");

  // Use a different endpoint for each request
  var index = 0;

  return function(z, x, y) {
    index = (index + 1) % endpoints.length;
    var endpoint = endpoints[index];
    return endpoint.replace(/{z}/, z).replace(/{x}/, x).replace(/{y}/, y);
  };
}

function fail(message) {
  throw Error("initTileMixer: " + message);
}

export { initTileMixer };
