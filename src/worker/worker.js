import { initSourceProcessor } from "./process.js";
import { initMVT } from "./mvt.js";
import { initGeojson } from "./geojson.js";

const tasks = {};
var loader, processor;

onmessage = function(msgEvent) {
  const { id, type, payload } = msgEvent.data;

  switch (type) {
    case "setup":
      // NOTE: changing global variable!
      let { styles, glyphEndpoint, source } = payload;
      loader = (source.type === "geojson")
        ? initGeojson(source, styles)
        : initMVT(source);
      processor = initSourceProcessor(payload);
      break;
    case "getTile":
      // let { z, x, y } = payload;
      let callback = (err, result) => process(id, err, result, payload);
      const request = loader(payload, callback);
      tasks[id] = { request, status: "requested" };
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

function process(id, err, result, tileCoords) {
  // Make sure we still have an active task for this ID
  let task = tasks[id];
  if (!task) return;  // Task must have been canceled

  if (err) {
    delete tasks[id];
    return postMessage({ id, type: "error", payload: err });
  }

  task.status = "parsing";
  return processor(result, tileCoords).then(tile => sendTile(id, tile));
}

function sendTile(id, tile) {
  // Make sure we still have an active task for this ID
  let task = tasks[id];
  if (!task) return; // Task must have been canceled

  // Get a list of all the Transferable objects
  const transferables = Object.values(tile.layers)
    .flatMap(l => Object.values(l.buffers).map(b => b.buffer));
  transferables.push(tile.atlas.data.buffer);

  postMessage({ id, type: "data", payload: tile }, transferables);
}
