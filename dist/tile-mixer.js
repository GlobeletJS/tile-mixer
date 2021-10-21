function buildFeatureFilter(filterObj) {
  // filterObj is a filter definition following the 'deprecated' syntax:
  // https://maplibre.org/maplibre-gl-js-docs/style-spec/other/#other-filter
  if (!filterObj) return () => true;
  const [type, ...vals] = filterObj;

  // If this is a combined filter, the vals are themselves filter definitions
  switch (type) {
    case "all": {
      const filters = vals.map(buildFeatureFilter);  // Iteratively recursive!
      return (d) => filters.every( filt => filt(d) );
    }
    case "any": {
      const filters = vals.map(buildFeatureFilter);
      return (d) => filters.some( filt => filt(d) );
    }
    case "none": {
      const filters = vals.map(buildFeatureFilter);
      return (d) => filters.every( filt => !filt(d) );
    }
    default:
      return getSimpleFilter(filterObj);
  }
}

function getSimpleFilter(filterObj) {
  const [type, key, ...vals] = filterObj;
  const getVal = initFeatureValGetter(key);

  switch (type) {
    // Existential Filters
    case "has":
      return d => !!getVal(d); // !! forces a Boolean return
    case "!has":
      return d => !getVal(d);

    // Comparison Filters
    case "==":
      return d => getVal(d) === vals[0];
    case "!=":
      return d => getVal(d) !== vals[0];
    case ">":
      return d => getVal(d) > vals[0];
    case ">=":
      return d => getVal(d) >= vals[0];
    case "<":
      return d => getVal(d) < vals[0];
    case "<=":
      return d => getVal(d) <= vals[0];

    // Set Membership Filters
    case "in" :
      return d => vals.includes( getVal(d) );
    case "!in" :
      return d => !vals.includes( getVal(d) );
    default:
      console.log("prepFilter: unknown filter type = " + filterObj[0]);
  }
  // No recognizable filter criteria. Return a filter that is always true
  return () => true;
}

function initFeatureValGetter(key) {
  switch (key) {
    case "$type":
      // NOTE: data includes MultiLineString, MultiPolygon, etc-NOT IN SPEC
      return f => {
        const t = f.geometry.type;
        if (t === "MultiPoint") return "Point";
        if (t === "MultiLineString") return "LineString";
        if (t === "MultiPolygon") return "Polygon";
        return t;
      };
    case "$id":
      return f => f.id;
    default:
      return f => f.properties[key];
  }
}

function initLayerFilter(style) {
  const { id, type: styleType, filter,
    minzoom = 0, maxzoom = 99,
    "source-layer": sourceLayer,
  } = style;

  const filterObject = composeFilters(getGeomFilter(styleType), filter);
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

function init(userParams) {
  const { layers } = setParams(userParams);

  const filters = layers.map(initLayerFilter);

  return function(source, zoom) {
    return filters.reduce((d, f) => Object.assign(d, f(source, zoom)), {});
  };
}

const vectorTypes = ["symbol", "circle", "line", "fill"];

function setParams(userParams) {
  const { layers } = userParams;

  // Confirm supplied styles are all vector layers reading from the same source
  if (!layers || !layers.length) fail("no valid array of style layers");

  const allVectors = layers.every(l => vectorTypes.includes(l.type));
  if (!allVectors) fail("not all layers are vector types");

  const sameSource = layers.every(l => l.source === layers[0].source);
  if (!sameSource) fail("supplied layers use different sources");

  return { layers };
}

function fail(message) {
  throw Error("ERROR in tile-mixer: " + message);
}

export { init };
