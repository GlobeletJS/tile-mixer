import { initChunkQueue } from "./queue.js";

const vectorTypes = ["symbol", "circle", "line", "fill"];

export function setParams(userParams) {
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
    : initChunkQueue();

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
