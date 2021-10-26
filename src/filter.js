import { buildFeatureFilter } from "tile-stencil";

export function initLayerFilter(style) {
  const { id, filter, minzoom = 0, maxzoom = 99,
    "source-layer": sourceLayer,
  } = style;

  const filterObject = composeFilters(getGeomFilter(style), filter);
  const parsedFilter = buildFeatureFilter(filterObject);

  return function(source, zoom) {
    // source is a dictionary of FeatureCollections, keyed on source-layer
    if (!source || zoom < minzoom || maxzoom < zoom) return;

    const layer = source[sourceLayer];
    if (!layer) return;

    const { type, extent, features: rawFeatures } = layer;
    const features = rawFeatures.filter(parsedFilter);
    if (features.length > 0) return { [id]: { type, extent, features } };
  };
}

function composeFilters(filter1, filter2) {
  if (!filter1) return filter2;
  if (!filter2) return filter1;
  return ["all", filter1, filter2];
}

function getGeomFilter(style) {
  switch (style.type) {
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
