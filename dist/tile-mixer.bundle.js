initZeroTimeouts();

function initZeroTimeouts() {
  // setTimeout with true zero delay. https://github.com/GlobeletJS/zero-timeout
  const timeouts = [];
  var taskId = 0;

  // Make a unique message, that won't be confused with messages from
  // other scripts or browser tabs
  const messageKey = "zeroTimeout_$" + Math.random().toString(36).slice(2);

  // Make it clear where the messages should be coming from
  const loc = window.location;
  var targetOrigin = loc.protocol + "//" + loc.hostname;
  if (loc.port !== "") targetOrigin += ":" + loc.port;

  // When a message is received, execute a timeout from the list
  window.addEventListener("message", evnt => {
    if (evnt.source != window || evnt.data !== messageKey) return;
    evnt.stopPropagation();

    let task = timeouts.shift();
    if (!task || task.canceled) return;
    task.func(...task.args);
  }, true);

  // Now define the external functions to set or cancel a timeout
  window.setZeroTimeout = function(func, ...args) {
    timeouts.push({ id: taskId++, func, args });
    window.postMessage(messageKey, targetOrigin);
    return taskId;
  };

  window.clearZeroTimeout = function(id) {
    let task = timeouts.find(timeout => timeout.id === id);
    if (task) task.canceled = true;
  };
}

function init() {
  const tasks = [];
  var taskId = 0;
  var queueIsRunning = false;

  return {
    enqueueTask,
    cancelTask,
    sortTasks,
  };

  function enqueueTask(newTask) {
    let defaultPriority = () => 0;
    tasks.push({ 
      id: taskId++,
      getPriority: newTask.getPriority || defaultPriority,
      chunks: newTask.chunks,
    });
    if (!queueIsRunning) setZeroTimeout(runTaskQueue);
    return taskId;
  }

  function cancelTask(id) {
    let task = tasks.find(task => task.id === id);
    if (task) task.canceled = true;
  }

  function sortTasks() {
    tasks.sort( (a, b) => compareNums(a.getPriority(), b.getPriority()) );
  }

  function compareNums(a, b) {
    if (a === b) return 0;
    return (a === undefined || a < b) ? -1 : 1;
  }

  function runTaskQueue() {
    // Remove canceled and completed tasks
    while (isDone(tasks[0])) tasks.shift();

    queueIsRunning = (tasks.length > 0);
    if (!queueIsRunning) return;

    // Get the next chunk from the current task, and run it
    let chunk = tasks[0].chunks.shift();
    chunk();

    setZeroTimeout(runTaskQueue);
  }

  function isDone(task) {
    return task && (task.canceled || task.chunks.length < 1);
  }
}

const vectorTypes = ["symbol", "circle", "line", "fill"];

function setParams(userParams) {
  const threads = userParams.threads || 2;

  // Confirm supplied styles are all vector layers reading from the same source
  const layers = userParams.layers;
  if (!layers || !layers.length) fail("no valid array of style layers!");

  let allVectors = layers.every( l => vectorTypes.includes(l.type) );
  if (!allVectors) fail("not all layers are vector types!");

  let sameSource = layers.every( l => l.source === layers[0].source );
  if (!sameSource) fail("supplied layers use different sources!");

  // Construct function to get a tile URL
  if (!userParams.source) fail("parameters.source is required!");
  const getURL = initUrlFunc(userParams.source.tiles);

  // Construct the task queue, if not supplied
  const queue = (userParams.queue)
    ? userParams.queue
    : init();

  return {
    threads,
    layers,
    getURL,
    queue
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
  throw Error("ERROR in tile-mixer: " + message);
}

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

function pointPath(path, point) {
  // Draws a Point geometry, which is an array of two coordinates
  path.moveTo(point[0], point[1]);
  path.lineTo(point[0], point[1]);
}

function linePath(path, points) {
  // Draws a LineString geometry, which is an array of Points.
  var p = points[0], i = 0, n = points.length;
  path.moveTo(p[0], p[1]);
  while (++i < n) p = points[i], path.lineTo(p[0], p[1]);
}

function polygonPath(path, lines) {
  // Draws a Polygon geometry, which is an array of LineStrings
  var i = -1, n = lines.length;
  while (++i < n) linePath(path, lines[i]);
}

const pathFuncs = {
  Point: pointPath,
  LineString: linePath,
  Polygon: polygonPath,
};

function geomToPath(geometry) {
  // Converts a GeoJSON Feature geometry to a Path2D object

  var type = geometry.type;
  var isMulti = type.substring(0, 5) === "Multi";
  if (isMulti) type = type.substring(5);

  const pathFunc = pathFuncs[type];

  const path = new Path2D();

  const coords = geometry.coordinates;
  if (isMulti) {
    // While loops faster than forEach: https://jsperf.com/loops/32
    var i = -1, n = coords.length;
    while (++i < n) pathFunc(path, coords[i]);

  } else {
    pathFunc(path, coords);
  }

  return path;
}

function initDataPrep(styles) {
  // Build a dictionary of data prep functions, keyed on style.id
  const prepFunctions = {};
  styles.forEach(style => {
    prepFunctions[style.id] = (style.type === "symbol")
      ? initTextMeasurer()
      : addPaths;
  });

  // Return a function that creates an array of prep calls for a source
  return function (source, zoom) {
    return Object.keys(source)
      .map( id => () => prepFunctions[id](source[id], zoom) );
  };
}

function initTextMeasurer(style) {
  // TODO: This closure only saves one createElement call. Is it worth it?
  const ctx = document.createElement("canvas").getContext("2d");

  return function(data, zoom) {
    ctx.font = data.properties.font;

    data.compressed.forEach(feature => {
      let labelText = feature.properties.labelText;
      if (!labelText) return;
      feature.properties.textWidth = ctx.measureText(labelText).width;
    });

    return data;
  };
}

function addPaths(data) {
  data.compressed.forEach(feature => {
    // TODO: Does this need to be interruptable?
    feature.path = geomToPath(feature.geometry);
    delete feature.geometry; // Allow it to be garbage collected
  });

  return data;
}

const workerPath = "./worker.bundle.js";

function initTileMixer(userParams) {
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

export { initTileMixer };
