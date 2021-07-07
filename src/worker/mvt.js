import Protobuf from "pbf";
import { VectorTile } from "vector-tile-esm";

export function initMVT(source) {
  const getURL = initUrlFunc(source.tiles);

  // TODO: use VectorTile.extent. Requires changes in dependencies, dependents
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
  const req = new XMLHttpRequest();

  req.responseType = type;
  req.onerror = errHandler;
  req.onabort = errHandler;
  req.onload = loadHandler;

  req.open("get", href);
  req.send();

  function errHandler(e) {
    return callback(xhrErr("ended with an ", e.type));
  }

  function loadHandler() {
    const { responseType, status, response } = req;

    const err = (responseType !== type) ?
      xhrErr("Expected responseType ", type, ", got ", responseType) :
      (status !== 200) ? xhrErr("HTTP ", status, " error from ", href) :
      null;

    return callback(err, response);
  }

  return req; // Request can be aborted via req.abort()
}

function xhrErr(...strings) {
  return "XMLHttpRequest: " + strings.join("");
}

function initUrlFunc(endpoints) {
  // Use a different endpoint for each request
  var index = 0;

  return function(z, x, y) {
    index = (index + 1) % endpoints.length;
    const endpoint = endpoints[index];
    return endpoint.replace(/{z}/, z).replace(/{x}/, x).replace(/{y}/, y);
  };
}
