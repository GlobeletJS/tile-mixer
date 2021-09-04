import { getStyleFuncs } from "tile-stencil";
import { initSourceFilter } from "./filter.js";
import { initAtlasGetter } from "tile-labeler";
import { initBufferConstructors } from "./buffers.js";

export function init(userParams) {
  const { glyphEndpoint, styles } = setParams(userParams);
  const parsedStyles = styles.map(getStyleFuncs);

  const sourceFilter = initSourceFilter(parsedStyles);
  const getAtlas = initAtlasGetter({ parsedStyles, glyphEndpoint });
  const process = initBufferConstructors(parsedStyles);

  return function(source, tileCoords) {
    const rawLayers = sourceFilter(source, tileCoords.z);

    return getAtlas(rawLayers, tileCoords.z).then(atlas => {
      const layers = process(rawLayers, tileCoords, atlas);

      // Note: atlas.data.buffer is a Transferable
      return { atlas: atlas.image, layers };
    });
  };
}

const vectorTypes = ["symbol", "circle", "line", "fill"];

function setParams(userParams) {
  const { glyphs, layers } = userParams;

  // Confirm supplied styles are all vector layers reading from the same source
  if (!layers || !layers.length) fail("no valid array of style layers");

  const allVectors = layers.every(l => vectorTypes.includes(l.type));
  if (!allVectors) fail("not all layers are vector types");

  const sameSource = layers.every(l => l.source === layers[0].source);
  if (!sameSource) fail("supplied layers use different sources");

  // TODO: check typeof glyphs. Should be a string, but what if undefined?

  return { glyphEndpoint: glyphs, styles: layers };
}

function fail(message) {
  throw Error("ERROR in tile-mixer: " + message);
}
