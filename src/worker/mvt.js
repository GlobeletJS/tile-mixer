import Protobuf from 'pbf';
import { VectorTile } from 'vector-tile-esm';

export function initMVT(source) {
  const getURL = initUrlFunc(source.tiles);

  // TODO: use VectorTile.extent. Requires changes in vector-tile-esm, tile-painter
  const size = 512;

  return function(tileCoords, callback) {
    const { z, x, y } = tileCoords;
    const dataHref = getURL(z, x, y);

    return xhrGet(dataHref, "arraybuffer", parseMVT);

    function parseMVT(err, data) {
      if (err) return callback(err, data);
      const tile = new VectorTile(new Protobuf(data));
      const json = Object.values(tile.layers)
        .reduce((d, l) => (d[l.name] = l.toGeoJSON(size), d), {});
      callback(null, json);
    }
  };
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

function initUrlFunc(endpoints) {
  // Use a different endpoint for each request
  var index = 0;

  return function(z, x, y) {
    index = (index + 1) % endpoints.length;
    var endpoint = endpoints[index];
    return endpoint.replace(/{z}/, z).replace(/{x}/, x).replace(/{y}/, y);
  };
}
