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
    const symbolLayers = rawLayers.filter(l => l.type === "symbol");

    return getGlyphs(symbolLayers, zoom).then(atlas => {
      const processed = rawLayers
        .map(l => processors[l.id](l, zoom, atlas))
        .reduce((d, l) => (d[l.id] = l.features, d), {});

      // TODO: compute symbol collisions...

      // TODO: what if there is no atlas?
      // Note: atlas.data.buffer is a Transferable
      return { atlas: atlas.image, layers: processed };
    });
  };
}

function initProcessor(style) {
  const { id, type, interactive } = style;

  const process =
    (type === "symbol") ? initShaping(style)
    : (type === "fill") ? triangulate
    : (type === "line") ? parseLine
    : f => f; // TODO: handle circle layers

  const compress = initFeatureGrouper(style);

  return function(layer, zoom, atlas) {
    let processed = layer.features.map(f => process(f, zoom, atlas));
    //if (!interactive) delete layer.features;
    return { id, features: compress(processed) };
  };
}
