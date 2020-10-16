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
