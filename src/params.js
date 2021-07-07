import * as chunkedQueue from "chunked-queue";

const vectorTypes = ["symbol", "circle", "line", "fill"];

export function setParams(userParams) {
  const {
    threads = 2,
    context,
    source,
    glyphs,
    layers,
    queue = chunkedQueue.init(),
    verbose = false,
  } = userParams;

  // Confirm supplied styles are all vector layers reading from the same source
  if (!layers || !layers.length) fail("no valid array of style layers!");

  const allVectors = layers.every( l => vectorTypes.includes(l.type) );
  if (!allVectors) fail("not all layers are vector types!");

  const sameSource = layers.every( l => l.source === layers[0].source );
  if (!sameSource) fail("supplied layers use different sources!");

  if (!source) fail("parameters.source is required!");

  if (source.type === "vector" && !(source.tiles && source.tiles.length)) {
    fail("no valid vector tile endpoints!");
  }

  return {
    threads,
    context,
    source,
    glyphs,
    layers,
    queue,
    verbose,
  };
}

function fail(message) {
  throw Error("ERROR in tile-mixer: " + message);
}
