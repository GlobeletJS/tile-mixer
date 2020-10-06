import Protobuf from 'pbf';
import { VectorTile } from 'vector-tile-esm';

export function readMVT(dataHref, size, callback) {
  // Input dataHref is the path to a file containing a Mapbox Vector Tile

  return xhrGet(dataHref, "arraybuffer", parseMVT);

  function parseMVT(err, data) {
    if (err) return callback(err, data);
    const tile = new VectorTile(new Protobuf(data));
    callback(null, mvtToJSON(tile, size));
  }
}

function mvtToJSON(tile, size) {
  const jsonLayers = {};
  Object.values(tile.layers).forEach(layer => {
    jsonLayers[layer.name] = layer.toGeoJSON(size);
  });
  return jsonLayers;
}

function xhrGet(href, type, callback) {
  var req = new XMLHttpRequest();
  req.responseType = type;

  req.onerror = errHandler;
  req.onabort = errHandler;
  req.onload = loadHandler;

  req.open('get', href);
  req.send();

  function errHandler(e) {
    let err = "XMLHttpRequest ended with an " + e.type;
    return callback(err);
  }
  function loadHandler(e) {
    if (req.responseType !== type) {
      let err = "XMLHttpRequest: Wrong responseType. Expected " +
        type + ", got " + req.responseType;
      return callback(err, req.response);
    }
    if (req.status !== 200) {
      let err = "XMLHttpRequest: HTTP " + req.status + " error from " + href;
      return callback(err, req.response);
    }
    return callback(null, req.response);
  }

  return req; // Request can be aborted via req.abort()
}

export function readGeojsonVT(index, layerID, x, y, z, callback) {
  // TODO: does geojson-vt always return only one layer?

  var tile = index.getTile(z,x,y);

  // TODO: is tile.features an array? If so, can we use a map statement here?
  var jsonTile = [];
  if (tile && tile !== "null" && tile !== "undefined" && tile.features.length > 0) {
    for (let i = 0; i < tile.features.length; i++) {
      jsonTile[i] = geojsonvtToJSON(tile.features[i]);
    }
  }
  var jsonLayer = {};
  jsonLayer[layerID] =  {"type": "FeatureCollection", "features": jsonTile};

  const errMsg =
    "ERROR in GeojsonLoader for tile z,x,y = " + [z, x, y].join(",");
  if (jsonLayer[layerID].features.length > 0) {
    setTimeout(() => callback(null, jsonLayer));
  } else {
    setTimeout(() => callback(errMsg));
  }

  return { abort: () => undefined };
}

function geojsonvtToJSON (value) {
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
