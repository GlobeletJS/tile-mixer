import * as chunkedQueue from 'chunked-queue';

const vectorTypes = ["symbol", "circle", "line", "fill"];

export function setParams(userParams) {
  const {
    threads = 2,
    context,
    layers,
    source,
    verbose = false,
    queue = chunkedQueue.init(),
  } = userParams;

  // Confirm supplied styles are all vector layers reading from the same source
  if (!layers || !layers.length) fail("no valid array of style layers!");

  let allVectors = layers.every( l => vectorTypes.includes(l.type) );
  if (!allVectors) fail("not all layers are vector types!");

  let sameSource = layers.every( l => l.source === layers[0].source );
  if (!sameSource) fail("supplied layers use different sources!");

  // Construct function to get a tile URL
  if (!source) fail("parameters.source is required!");
  const getURL = initUrlFunc(source.tiles);

  return {
    context,
    threads,
    layers,
    getURL,
    queue,
    verbose,
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
