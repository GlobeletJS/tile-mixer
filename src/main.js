import { initWorkers } from "./boss.js";
import { initPreRenderer } from "./prerender.js";

const vectorTypes = ["symbol", "circle", "line", "fill"];

export function initTileMixer(params) {
  // TODO: move parameter checks out?
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

  // Initialize chunked queue, OR input it?
  // What about prioritization? TODO
  // Initialize prerenderer
  //const preRenderer = initPreRenderer(layers);

  // Define request function  TODO: Wrap callback with pre-renderer
  function request(z, x, y, callback) {
    const url = getURL(z, x, y);
    const payload = { href: url, size: 512, zoom: z };
    return workers.startTask(payload, callback);
  }

  // Returned API  TODO: Extend canceler to stop prerendering
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
