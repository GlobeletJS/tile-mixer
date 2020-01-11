import { parseLayer         } from 'tile-stencil';
import { initFeatureGrouper } from "./group-features.js";
import { initLabelParser, getFont } from "./parse-labels.js";

export function initSourceFilter(styles) {
  // Make an [ID, getter] pair for each layer
  const filters = styles.map(parseLayer)
    .map(style => [style.id, makeLayerFilter(style)]);

  return function(source, zoom) {
    const filtered = {};
    filters.forEach(([id, filter]) => {
      let data = filter(source, zoom);
      if (data) filtered[id] = data;
    });
    return filtered; // Dictionary of FeatureCollections, keyed on style.id
  };
}

function makeLayerFilter(style) {
  const minzoom = style.minzoom || 0;
  const maxzoom = style.maxzoom || 99; // NOTE: doesn't allow maxzoom = 0

  const sourceLayer = style["source-layer"];
  //const filter = buildFeatureFilter(style.filter);
  const filter = style.filter;
  const layout = style.layout;
  const interactive = style.interactive;

  const isLabel = style.type === "symbol";
  const compress = (isLabel)
    ? initLabelParser(style)
    : initFeatureGrouper(style);

  return function(source, zoom) {
    // source is a dictionary of FeatureCollections, keyed on source-layer
    if (!source) return false;
    if (zoom < minzoom || maxzoom < zoom) return false;

    let layer = source[sourceLayer];
    if (!layer) return false;

    let features = layer.features.filter(filter);
    if (features.length < 1) return false;

    let compressed = compress(features, zoom);

    let collection = { type: "FeatureCollection", compressed };
    if (interactive) collection.features = features;
    if (isLabel) collection.properties = { font: getFont(layout, zoom) };

    return collection;
  };
}
