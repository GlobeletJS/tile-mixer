import { initLayerFilter } from "./filter.js";

export function init(userParams) {
  const { layers } = setParams(userParams);

  const filters = layers.map(initLayerFilter);

  return function(source, zoom) {
    return filters.reduce((d, f) => Object.assign(d, f(source, zoom)), {});
  };
}

const vectorTypes = ["symbol", "circle", "line", "fill"];

function setParams(userParams) {
  const { layers } = userParams;

  // Confirm supplied styles are all vector layers reading from the same source
  if (!layers || !layers.length) fail("no valid array of style layers");

  const allVectors = layers.every(l => vectorTypes.includes(l.type));
  if (!allVectors) fail("not all layers are vector types");

  const sameSource = layers.every(l => l.source === layers[0].source);
  if (!sameSource) fail("supplied layers use different sources");

  return { layers };
}

function fail(message) {
  throw Error("ERROR in tile-mixer: " + message);
}
