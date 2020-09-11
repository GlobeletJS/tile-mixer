import { initSourceProcessor } from "./process.js";
import { readMVT } from "./read.js";
import { readGeojsonVT } from "./read.js";
import geojsonvt from 'geojson-vt';

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
      filter = initSourceProcessor(payload);
      break;
    case "start":
      let callback = (err, result) => process(id, err, result, payload.zoom);
      let request;
      if(payload.type === "vector"){
        request = readMVT(payload.href, payload.size, callback);
      }
      if(payload.type === "geojson"){
        console.log("payload source:"+ JSON.stringify(payload.source));
        var tileIndex = geojsonvt({"type":"FeatureCollection", "features":payload.source.features}, {extent: 512});
        console.log("Index: "+ JSON.stringify(tileIndex.getTile(0,0,0)));
        request = readGeojsonVT(tileIndex, payload.layerID, payload.tileX, payload.tileY, payload.zoom, payload.size, callback);
      }
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

function process(id, err, result, zoom) {
  // Make sure we still have an active task for this ID
  let task = tasks[id];
  if (!task) return;  // Task must have been canceled

  if (err) {
    delete tasks[id];
    return postMessage({ id, type: "error", payload: err });
  }

  task.status = "parsing";
  return filter(result, zoom).then(tile => sendTile(id, tile));
}

function sendTile(id, tile) {
  // Make sure we still have an active task for this ID
  let task = tasks[id];
  if (!task) return; // Task must have been canceled

  // Get a list of all the Transferable objects
  const transferables = Object.values(tile.layers)
    .flatMap(features => features.flatMap(getFeatureBuffers));
  transferables.push(tile.atlas.data.buffer);

  postMessage({ id, type: "data", payload: tile }, transferables);
}

function getFeatureBuffers(feature) {
  return Object.values(feature.buffers).map(b => b.buffer);
}
