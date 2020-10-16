import geojsonvt from 'geojson-vt';

export function initGeojson(source) {
  // TODO: shouldn't source already have a data property with valid GeoJSON?
  const data = {
    "type": "FeatureCollection",
    "features": source.features,
  };

  // TODO: should these be taken from payload? Or, are defaults OK?
  const indexParams = { extent: 512, minZoom: 0, maxZoom: 14 };

  const tileIndex = geojsonvt(data, indexParams);

  return function(tileCoords, callback) {
    // TODO: does geojson-vt always return only one layer?
    const { layerID, z, x, y } = tileCoords;

    var tile = tileIndex.getTile(z, x, y);

    // TODO: is tile.features an array? If so, can we use a map statement here?
    var jsonTile = [];
    if (tile && tile.features.length > 0) {
      for (let i = 0; i < tile.features.length; i++) {
        jsonTile[i] = geojsonvtToJSON(tile.features[i]);
      }
    }
    var jsonLayer = {};
    jsonLayer[layerID] =  { "type": "FeatureCollection", "features": jsonTile };

    const errMsg = "ERROR in GeojsonLoader for tile z,x,y = " +
      [z, x, y].join(",");

    if (jsonLayer[layerID].features.length > 0) {
      setTimeout(() => callback(null, jsonLayer));
    } else {
      setTimeout(() => callback(errMsg));
    }

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
