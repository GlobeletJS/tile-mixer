import { getStyleFuncs      } from 'tile-stencil';
import { buildFeatureFilter } from "./filter-feature.js";
import { initFeatureGrouper } from "./group-features.js";
import { initLabelParser, getFont } from "./parse-labels.js";

export function initSourceFilter(styles) {
  // Make an [ID, getter] pair for each layer
  const filters = styles.map(getStyleFuncs)
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
  const { type, layout, interactive, minzoom = 0, maxzoom = 99 } = style;

  const sourceLayer = style["source-layer"];
  const filterObject = composeFilters(getGeomFilter(type), style.filter);
  const filter = buildFeatureFilter(filterObject);

  const isLabel = type === "symbol";
  const compress = (isLabel)
    ? initLabelParser(style)
    : initFeatureGrouper(style);

  return function(source, zoom) {
    // source is a dictionary of FeatureCollections, keyed on source-layer
    if (!source || zoom < minzoom || maxzoom < zoom) return false;

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

function composeFilters(filter1, filter2) {
  if (!filter1) return filter2;
  if (!filter2) return filter1;
  return ["all", filter1, filter2];
}

function getGeomFilter(type) {
  switch (type) {
    case "circle":
      return ["==", "$type", "Point"];
    case "line":
      return ["!=", "$type", "Point"]; // Could be LineString or Polygon
    case "fill":
      return ["==", "$type", "Polygon"];
    default:
      return; // No condition on geometry
  }
}
