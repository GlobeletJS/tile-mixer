import geojsonvt from 'geojson-vt';

export function initGeojson(source, styles) {
  // TODO: should these be taken from payload? Or, are defaults OK?
  const indexParams = { extent: 512, minZoom: 0, maxZoom: 14, tolerance: 1 };
  const tileIndex = geojsonvt(source.data, indexParams);

  // TODO: does geojson-vt always return only one layer?
  const layerID = styles[0].id;

  return function(tileCoords, callback) {
    const { z, x, y } = tileCoords;

    const tile = tileIndex.getTile(z, x, y);

    const err = (!tile || !tile.features || !tile.features.length)
      ? "ERROR in GeojsonLoader for tile z, x, y = " + [z, x, y].join(", ")
      : null;

    const layer = { type: "FeatureCollection" };
    if (!err) layer.features = tile.features.map(geojsonvtToJSON);

    const json = { [layerID]: layer };
    setTimeout(() => callback(err, json));

    return { abort: () => undefined };
  };
}

function geojsonvtToJSON(value) {
  //http://www.scgis.net/api/ol/v4.1.1/examples/geojson-vt.html
  if (!value.geometry) return value;

  const geometry = value.geometry;

  const types = ['Unknown', 'Point', 'Linestring', 'Polygon'];

  // TODO: What if geometry.length < 1?
  const type = (geometry.length === 1)
    ? types[value.type]
    : 'Multi' + types[value.type];

  const coordinates = 
    (geometry.length != 1) ? [geometry]
    : (type === 'MultiPoint') ? geometry[0]
    : geometry;

  return {
    geometry: { type, coordinates },
    properties: value.tags
  };
}
