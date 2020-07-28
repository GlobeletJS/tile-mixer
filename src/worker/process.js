import { initSourceFilter } from "./filter-source.js";
import { getStyleFuncs } from 'tile-stencil';
import { initGlyphs } from "./glyphs.js";
import { initShaping } from "./shaping.js";
import { triangulate } from "./fill.js";
import { parseLine } from "./line.js";
import { initFeatureGrouper } from "./group-features.js";

export function initSourceProcessor({ styles, glyphEndpoint }) {
  const parsedStyles = styles.map(getStyleFuncs);

  const sourceFilter = initSourceFilter(parsedStyles);
  const getGlyphs = initGlyphs({ parsedStyles, glyphEndpoint });
  const processors = parsedStyles
    .reduce((d, s) => (d[s.id] = initProcessor(s), d), {});

  return function(source, zoom) {
    const rawLayers = sourceFilter(source, zoom);

    return getGlyphs(rawLayers, zoom).then(atlas => {
      const processed = Object.entries(rawLayers)
        .reduce((dict, [id, features]) => {
          dict[id] = processors[id](features, zoom, atlas);
          return dict;
        }, {});

      // TODO: compute symbol collisions...

      // TODO: what if there is no atlas?
      // Note: atlas.data.buffer is a Transferable
      return { atlas: atlas.image, layers: processed };
    });
  };
}

function initProcessor(style) {
  const { id, type, interactive } = style; // TODO: handle interactive layers

  const process =
    (type === "symbol") ? initShaping(style)
    : (type === "fill") ? triangulate
    : (type === "line") ? parseLine
    : f => f; // TODO: handle circle layers

  const compress = initFeatureGrouper(style);

  return function(features, zoom, atlas) {
    let processed = features.map(f => process(f, zoom, atlas));
    return compress(processed);
  };
}
