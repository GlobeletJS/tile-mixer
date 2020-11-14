import { initShaping } from 'tile-labeler';
import { serializers } from 'tile-gl';
import { initFeatureGrouper } from "./group-features.js";
import RBush from 'rbush';

export function initBufferConstructors(styles) {
  const layerSerializers = styles
    .reduce((d, s) => (d[s.id] = initSerializer(s), d), {});

  return function(layers, zoom, atlas) {
    const tree = new RBush();

    return Object.entries(layers)
      .reverse() // Reverse order for collision checks
      .map(([id, layer]) => {
        let serialize = layerSerializers[id];
        if (serialize) return serialize(layer, zoom, atlas, tree);
      })
      .reverse()
      .reduce((d, l) => Object.assign(d, l), {});
  };
}

function initSerializer(style) {
  const { id, type: styleType, interactive } = style;

  const transform = (styleType === "symbol")
    ? initShaping(style)
    : serializers[styleType];

  if (!transform) return;

  const compressor = initFeatureGrouper(style);

  return function(layer, zoom, atlas, tree) {
    let { type, extent, features } = layer;

    let transformed = features.map(feature => {
      let { properties, geometry } = feature;
      let buffers = transform(feature, zoom, atlas, tree);
      if (buffers) return { properties, geometry, buffers };
    }).filter(f => f !== undefined);

    if (!transformed.length) return;

    const compressed = compressor(transformed);
    const newLayer = { type, extent, compressed };

    if (interactive) newLayer.features = transformed
      .map(({ properties, geometry }) => ({ properties, geometry }));

    return { [id]: newLayer };
  };
}
