import geojsonvt from 'geojson-vt';

export function initGeojson(source, styles) {
  const extent = 512; // TODO: reset to 4096? Then tolerance can be default 3
  const indexParams = { extent, tolerance: 1 };
  const tileIndex = geojsonvt(source.data, indexParams);

  // TODO: does geojson-vt always return only one layer?
  const layerID = styles[0].id;

  return function(tileCoords, callback) {
    const { z, x, y } = tileCoords;

    const tile = tileIndex.getTile(z, x, y);

    const err = (!tile || !tile.features || !tile.features.length)
      ? "ERROR in GeojsonLoader for tile z, x, y = " + [z, x, y].join(", ")
      : null;

    const layer = { type: "FeatureCollection", extent };
    if (!err) layer.features = tile.features.map(geojsonvtToJSON);

    const json = { [layerID]: layer };
    setTimeout(() => callback(err, json));

    return { abort: () => undefined };
  };
}

function geojsonvtToJSON(value) {
  const { geometry, type: typeNum, tags: properties } = value;
  if (!geometry) return value;

  const types = ['Unknown', 'Point', 'LineString', 'Polygon'];

  const type = (geometry.length <= 1)
    ? types[typeNum]
    : 'Multi' + types[typeNum];

  const coordinates =
    (type == "MultiPolygon") ? [geometry]
    : (type === 'Point'|| type === 'LineString') ? geometry[0]
    : geometry;

  return { geometry: { type, coordinates }, properties };
}
