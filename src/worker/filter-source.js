import { buildFeatureFilter } from "./filter-feature.js";

export function initSourceFilter(styles) {
  const filters = styles.map(initLayerFilter);

  return function(source, zoom) {
    return filters.map(filter => filter(source, zoom))
      .filter(data => data !== undefined);
  };
}

function initLayerFilter(style) {
  const { id, type, filter,
    minzoom = 0, maxzoom = 99,
    "source-layer": sourceLayer,
  } = style;

  const filterObject = composeFilters(getGeomFilter(type), filter);
  const parsedFilter = buildFeatureFilter(filterObject);

  return function(source, zoom) {
    // source is a dictionary of FeatureCollections, keyed on source-layer
    if (!source || zoom < minzoom || maxzoom < zoom) return;

    let layer = source[sourceLayer];
    if (!layer) return;

    let features = layer.features.filter(parsedFilter);
    if (features.length > 0) return { id, type, features };
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
    case "symbol":
      return ["==", "$type", "Point"]; // TODO: implement line geom labels
    default:
      return; // No condition on geometry
  }
}
