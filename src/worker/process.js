import { getStyleFuncs } from 'tile-stencil';
import { initSourceFilter } from "./filter-source.js";
import { initAtlasGetter } from 'tile-labeler';
import { initBufferConstructors } from "./buffers.js";

export function initSourceProcessor({ styles, glyphEndpoint }) {
  const parsedStyles = styles.map(getStyleFuncs);

  const sourceFilter = initSourceFilter(parsedStyles);
  const getAtlas = initAtlasGetter({ parsedStyles, glyphEndpoint });
  const process = initBufferConstructors(parsedStyles);

  return function(source, zoom) {
    const rawLayers = sourceFilter(source, zoom);

    return getAtlas(rawLayers, zoom).then(atlas => {
      const layers = process(rawLayers, zoom, atlas);

      // Note: atlas.data.buffer is a Transferable
      return { atlas: atlas.image, layers };
    });
  };
}
