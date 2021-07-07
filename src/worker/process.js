import { getStyleFuncs } from "tile-stencil";
import { initSourceFilter } from "./filter.js";
import { initAtlasGetter } from "tile-labeler";
import { initBufferConstructors } from "./buffers.js";

export function initSourceProcessor({ styles, glyphEndpoint }) {
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
