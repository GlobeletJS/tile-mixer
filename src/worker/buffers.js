import { initSerializer } from "tile-gl";
import { concatBuffers } from "./concat-buffers.js";
import RBush from "rbush";

export function initBufferConstructors(styles) {
  const layerSerializers = styles
    .reduce((d, s) => (d[s.id] = initLayerSerializer(s), d), {});

  return function(layers, tileCoords, atlas) {
    const tree = new RBush();

    return Object.entries(layers)
      .reverse() // Reverse order for collision checks
      .map(([id, layer]) => {
        const serialize = layerSerializers[id];
        if (serialize) return serialize(layer, tileCoords, atlas, tree);
      })
      .reverse()
      .reduce((d, l) => Object.assign(d, l), {});
  };
}

function initLayerSerializer(style) {
  const { id, interactive } = style;

  const transform = initSerializer(style);

  if (!transform) return;

  return function(layer, tileCoords, atlas, tree) {
    const { type, extent, features } = layer;

    const transformed = features.map(feature => {
      const { properties, geometry } = feature;
      const buffers = transform(feature, tileCoords, atlas, tree);
      // NOTE: if no buffers, we don't even want to keep the original
      // feature--because it won't be visible to the user (not rendered)
      if (buffers) return { properties, geometry, buffers };
    }).filter(f => f !== undefined);

    if (!transformed.length) return;

    const newLayer = { type, extent, buffers: concatBuffers(transformed) };

    if (interactive) newLayer.features = transformed
      .map(({ properties, geometry }) => ({ properties, geometry }));

    return { [id]: newLayer };
  };
}
