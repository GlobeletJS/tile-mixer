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
    .reduce((d, s) => (d[s.id] = initFeatureGrouper(s), d), {});

  return function(source, zoom) {
    const rawLayers = sourceFilter(source, zoom);

    const mainTask = process(rawLayers);
    const symbolTask = processSymbols(rawLayers, zoom);

    return Promise.all([mainTask, symbolTask]).then(([layers, symbols]) => {
      // Merge symbol layers into layers dictionary
      Object.assign(layers, symbols.layers);
      // Compress features
      Object.entries(layers).forEach(([id, features]) => {
        layers[id] = compressors[id](features);
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
    const data = Object.entries(layers).reduce((d, [id, features]) => {
      let transform = transforms[id];
      if (transform) d[id] = addBuffers(features, transform);
      return d;
    }, {});

    return Promise.resolve(data);
  }
}

function addBuffers(features, transform) {
  return features.map(feature => {
    const { properties, geometry } = feature;
    const buffers = transform(feature);
    if (buffers) return { properties, geometry, buffers };
  }).filter(f => f !== undefined);
}

function initCompressor(style) {
  const { id, interactive } = style;
  const grouper = initFeatureGrouper(style);

  return function(layer) {
    const compressed = grouper(layer.features);
    const newLayer = { extent: layer.extent, compressed };
    if (interactive) {
      newLayer.features = layer.features.map(f => {
        let { properties, geometry } = f;
        return { properties, geometry };
      });
    }
  };
}
