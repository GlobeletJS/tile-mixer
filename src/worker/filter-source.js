import { getStyleFuncs      } from 'tile-stencil';
import { buildFeatureFilter } from "./filter-feature.js";
import { initProcessor } from "./process.js";

export function initSourceFilter({ styles, contextType }) {
  // Make an [ID, getter] pair for each layer
  const filters = styles.map(getStyleFuncs)
    .map(style => {
      return {
        id: style.id, 
        filter: makeLayerFilter(style),
        process: initProcessor(style, contextType),
      };
    });

  return function(source, zoom) {
    const filtered = {};
    filters.forEach(({ id, filter, process }) => {
      let features = filter(source, zoom);
      if (features) filtered[id] = process(features);
    });
    return filtered; // Dictionary of FeatureCollections, keyed on style.id
  };
}

function makeLayerFilter(style) {
  const { type, filter, 
    minzoom = 0, maxzoom = 99,
    "source-layer": sourceLayer,
  } = style;

  const filterObject = composeFilters(getGeomFilter(type), filter);
  const parsedFilter = buildFeatureFilter(filterObject);

  return function(source, zoom) {
    // source is a dictionary of FeatureCollections, keyed on source-layer
    if (!source || zoom < minzoom || maxzoom < zoom) return false;

    let layer = source[sourceLayer];
    if (!layer) return;

    let features = layer.features.filter(parsedFilter);
    if (features.length > 0) return features;
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
