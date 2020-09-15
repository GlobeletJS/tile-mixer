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

export function readGeojsonVT(index, layerID, x, y, z, callback){

  var tile = index.getTile(z,x,y);
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

  function abort() {
  }
  return { abort };
}

function geojsonvtToJSON (value){
  //http://www.scgis.net/api/ol/v4.1.1/examples/geojson-vt.html
  if (value.geometry) {
    var type;
    var rawType = value.type;
    var geometry = value.geometry;

    if (rawType === 1) {
      type = geometry.length === 1 ? 'Point' : 'MultiPoint';
    } else if (rawType === 2) {
      type = geometry.length === 1 ? 'LineString' : 'MultiLineString';
    } else if (rawType === 3) {
      type = geometry.length === 1 ? 'Polygon' : 'MultiPolygon';
    }

    if (rawType === 1) {
      return {
        geometry: {
          type: type,
          coordinates: geometry.length == 1 ? geometry[0] : [geometry]
        },
        properties: value.tags
      };
    } else {
      return {
        geometry: {
          type: type,
          coordinates: geometry.length == 1 ? geometry : [geometry]
        },
        properties: value.tags
      };
    }
  } else {
    return value;
  }
}
