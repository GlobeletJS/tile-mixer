import { getStyleFuncs } from 'tile-stencil';
import { initSourceFilter } from "./filter-source.js";
import { initSymbols } from 'tile-labeler';
import { serializers } from 'tile-gl';
import { initFeatureGrouper } from "./group-features.js";

export function initSourceProcessor({ styles, glyphEndpoint }) {
  const parsedStyles = styles.map(getStyleFuncs);

  const sourceFilter = initSourceFilter(parsedStyles);
  const process = initProcessor(parsedStyles);
  const processSymbols = initSymbols({ parsedStyles, glyphEndpoint });
  const compressors = parsedStyles
    .reduce((d, s) => (d[s.id] = initCompressor(s), d), {});

  return function(source, zoom) {
    const rawLayers = sourceFilter(source, zoom);

    const mainTask = process(rawLayers);
    const symbolTask = processSymbols(rawLayers, zoom);

    return Promise.all([mainTask, symbolTask]).then(([layers, symbols]) => {
      // Merge symbol layers into layers dictionary
      Object.assign(layers, symbols.layers);
      // Compress features. TODO: don't overwrite layers object!
      Object.entries(layers).forEach(([id, layer]) => {
        layers[id] = compressors[id](layer);
      });
      // TODO: what if there is no atlas?
      // Note: atlas.data.buffer is a Transferable
      return { atlas: symbols.atlas, layers };
    });
  };
}

function initProcessor(styles) {
  const transforms = styles
    .reduce((d, s) => (d[s.id] = serializers[s.type], d), {});

  return function(layers) {
    const data = Object.entries(layers).reduce((d, [id, layer]) => {
      let transform = transforms[id];
      if (!transform) return d;

      let { type, extent, features } = layer;
      let mapped = features.map(feature => {
        let { properties, geometry } = feature;
        let buffers = transform(feature);
        if (buffers) return { properties, geometry, buffers };
      }).filter(f => f !== undefined);

      if (mapped.length) d[id] = { type, extent, features: mapped };
      return d;
    }, {});

    return Promise.resolve(data);
  }
}

function initCompressor(style) {
  const { id, interactive } = style;
  const grouper = initFeatureGrouper(style);

  return function(layer) {
    const { type, extent, features } = layer;
    const compressed = grouper(features);
    const newLayer = { type, extent, compressed };

    if (interactive) newLayer.features = features
      .map(({ properties, geometry }) => ({ properties, geometry }));

    return newLayer;
  };
}
