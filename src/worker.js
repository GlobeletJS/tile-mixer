import { initSourceFilter } from "./filter-source.js";
import { readMVT } from "./read.js";

const tasks = {};
var filter = (data) => data;

onmessage = function(msgEvent) {
  // The message DATA as sent by the parent thread is now a property 
  // of the message EVENT. See
  // https://developer.mozilla.org/en-US/docs/Web/API/MessageEvent
  const { id, type, payload } = msgEvent.data;

  switch (type) {
    case "styles":
      // NOTE: changing global variable!
      filter = initSourceFilter(payload);
      break;
    case "start":
      let callback = (err, result) => sendHeader(id, err, result, payload.zoom);
      let request  = readMVT(payload.href, payload.size, callback);
      tasks[id] = { request, status: "requested" };
      break;
    case "continue":
      sendData(id);
      break;
    case "cancel":
      let task = tasks[id];
      if (task && task.status === "requested") task.request.abort();
      delete tasks[id];
      break;
    default:
      // Bad message type!
  }
}

function sendHeader(id, err, result, zoom) {
  // Make sure we still have an active task for this ID
  let task = tasks[id];
  if (!task) return;  // Task must have been canceled

  if (err) {
    delete tasks[id];
    return postMessage({ id, type: "error", payload: err });
  }

  result = filter(result, zoom);
  task.result = result;
  task.layers = Object.keys(result);
  task.status = "parsed";

  // Send a header with info about each layer
  const header = {};
  task.layers.forEach(key => {
    let data = result[key];
    let counts = { compressed: data.compressed.length };
    if (data.features) counts.features = data.features.length;
    header[key] = counts;
  });
  postMessage({ id, type: "header", payload: header });
}

function sendData(id) {
  // Make sure we still have an active task for this ID
  let task = tasks[id];
  if (!task) return;  // Task must have been canceled

  var currentLayer = task.result[task.layers[0]];
  // Make sure we still have data in this layer
  var dataType = findRemainingData(currentLayer);
  if (!dataType) {
    task.layers.shift();           // Discard this layer
    currentLayer = task.result[task.layers[0]];
  }
  if (task.layers.length == 0) {
    delete tasks[id];
    postMessage({ id, type: "done" });
    return;
  }

  // Get the next chunk of data and send it back to the main thread
  var chunk = getChunk(currentLayer[dataType]);
  postMessage({ id, type: dataType, key: task.layers[0], payload: chunk });
}

function findRemainingData(layer) {
  if (!layer) return false;
  // All layers have a 'compressed' array
  if (layer.compressed.length > 0) return "compressed";
  // 'compressed' array is empty. There might still be a 'features' array
  if (layer.features && layer.features.length > 0) return "features";
  return false;
}

function getChunk(arr) {
  // Limit to 100 KB per postMessage. TODO: Consider 10KB for cheap phones? 
  // See https://dassur.ma/things/is-postmessage-slow/
  const maxChunk = 100000; 

  let chunk = [];
  let chunkSize = 0;

  while (arr[0] && chunkSize < maxChunk) {
    let item = arr.shift();
    chunkSize += JSON.stringify(item).length;
    chunk.push(item);
  }

  return chunk;
}
