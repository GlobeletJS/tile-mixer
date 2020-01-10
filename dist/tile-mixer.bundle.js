const vectorTypes = ["symbol", "circle", "line", "fill"];

function setParams(userParams) {
  const threads = userParams.threads || 2;

  // Confirm supplied styles are all vector layers reading from the same source
  const layers = userParams.layers;
  if (!layers || !layers.length) fail("no valid array of style layers!");

  let allVectors = layers.every( l => vectorTypes.includes(l.type) );
  if (!allVectors) fail("not all layers are vector types!");

  let sameSource = layers.every( l => l.source === layers[0].source );
  if (!sameSource) fail("supplied layers use different sources!");

  // Construct function to get a tile URL
  if (!userParams.source) fail("parameters.source is required!");
  const getURL = initUrlFunc(userParams.source.tiles);

  return {
    threads,
    layers,
    getURL
  };
}

function initUrlFunc(endpoints) {
  if (!endpoints || !endpoints.length) fail("no valid tile endpoints!");

  // Use a different endpoint for each request
  var index = 0;

  return function(z, x, y) {
    index = (index + 1) % endpoints.length;
    var endpoint = endpoints[index];
    return endpoint.replace(/{z}/, z).replace(/{x}/, x).replace(/{y}/, y);
  };
}

function fail(message) {
  throw Error("ERROR in tile-mixer: " + message);
}

function initWorkers(nThreads, codeHref, styles) {
  const tasks = {};
  var globalMsgId = 0;

  // Initialize the worker threads, and send them the styles
  function trainWorker() {
    const worker = new Worker(codeHref);
    worker.postMessage({ id: 0, type: "styles", payload: styles });
    worker.onmessage = handleMsg;
    return worker;
  }
  const workers = Array.from(Array(nThreads), trainWorker);
  const workLoads = Array.from(Array(nThreads), () => 0);

  return {
    startTask,
    cancelTask,
    activeTasks: () => workLoads.reduce( (a, b) => a + b, 0 ),
    terminate: () => workers.forEach( worker => worker.terminate() ),
  }

  function startTask(payload, callback) {
    let workerID = getIdleWorkerID(workLoads);
    workLoads[workerID] ++;

    const msgId = ++globalMsgId; // Start from 1, since we used 0 for styles
    tasks[msgId] = { callback, workerID };
    workers[workerID].postMessage({ id: msgId, type: "start", payload });

    return msgId; // Returned ID can be used for later cancellation
  }

  function cancelTask(id) {
    let task = tasks[id];
    if (!task) return;
    workers[task.workerID].postMessage({ id, type: "cancel" });
    workLoads[task.workerID] --;
    delete tasks[id];
  }

  function handleMsg(msgEvent) {
    const msg = msgEvent.data; // { id, type, key, payload }
    const task = tasks[msg.id];
    // NOTE: 'this' is the worker that emitted msgEvent
    if (!task) return this.postMessage({ id: msg.id, type: "cancel" });

    switch (msg.type) {
      case "error":
        task.callback(msg.payload);
        break; // Clean up below

      case "header":
        task.header = msg.payload;
        task.result = initJSON(msg.payload);
        return this.postMessage({ id: msg.id, type: "continue" });

      case "compressed":
      case "features":
        let features = task.result[msg.key][msg.type];
        msg.payload.forEach( feature => features.push(feature) );
        return this.postMessage({ id: msg.id, type: "continue" });

      case "done":
        let err = checkResult(task.result, task.header);
        task.callback(err, task.result);
        break; // Clean up below

      default:
        task.callback("ERROR: worker sent bad message type!");
        break; // Clean up below
    }

    workLoads[task.workerID] --;
    delete tasks[msg.id];
  }
}

function getIdleWorkerID(workLoads) {
  let id = 0;
  for (let i = 1; i < workLoads.length; i++) {
    if (workLoads[i] < workLoads[id]) id = i;
  }
  return id;
}

function initJSON(header) {
  const json = {};
  Object.keys(header).forEach(key => {
    json[key] = { type: "FeatureCollection", compressed: [] };
    if (header.features) json[key].features = [];
  });
  return json;
}

function checkResult(json, header) {
  let allOk = Object.keys(header)
    .every( k => checkData(json[k], header[k]) );

  return allOk
    ? null
    : "ERROR: JSON from worker failed checks!";
}

function checkData(data, counts) {
  // data is a GeoJSON Feature Collection, augmented with 'compressed' array
  var ok = data.compressed.length === counts.compressed;
  if (counts.features) {
    // We also have raw GeoJSON for querying. Check the length
    ok = ok && data.features.length === counts.features;
  }
  return ok;
}

// From mapbox-gl-js, style-spec/deref.js

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var csscolorparser = createCommonjsModule(function (module, exports) {
// (c) Dean McNamee <dean@gmail.com>, 2012.
//
// https://github.com/deanm/css-color-parser-js
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

// http://www.w3.org/TR/css3-color/
var kCSSColorTable = {
  "transparent": [0,0,0,0], "aliceblue": [240,248,255,1],
  "antiquewhite": [250,235,215,1], "aqua": [0,255,255,1],
  "aquamarine": [127,255,212,1], "azure": [240,255,255,1],
  "beige": [245,245,220,1], "bisque": [255,228,196,1],
  "black": [0,0,0,1], "blanchedalmond": [255,235,205,1],
  "blue": [0,0,255,1], "blueviolet": [138,43,226,1],
  "brown": [165,42,42,1], "burlywood": [222,184,135,1],
  "cadetblue": [95,158,160,1], "chartreuse": [127,255,0,1],
  "chocolate": [210,105,30,1], "coral": [255,127,80,1],
  "cornflowerblue": [100,149,237,1], "cornsilk": [255,248,220,1],
  "crimson": [220,20,60,1], "cyan": [0,255,255,1],
  "darkblue": [0,0,139,1], "darkcyan": [0,139,139,1],
  "darkgoldenrod": [184,134,11,1], "darkgray": [169,169,169,1],
  "darkgreen": [0,100,0,1], "darkgrey": [169,169,169,1],
  "darkkhaki": [189,183,107,1], "darkmagenta": [139,0,139,1],
  "darkolivegreen": [85,107,47,1], "darkorange": [255,140,0,1],
  "darkorchid": [153,50,204,1], "darkred": [139,0,0,1],
  "darksalmon": [233,150,122,1], "darkseagreen": [143,188,143,1],
  "darkslateblue": [72,61,139,1], "darkslategray": [47,79,79,1],
  "darkslategrey": [47,79,79,1], "darkturquoise": [0,206,209,1],
  "darkviolet": [148,0,211,1], "deeppink": [255,20,147,1],
  "deepskyblue": [0,191,255,1], "dimgray": [105,105,105,1],
  "dimgrey": [105,105,105,1], "dodgerblue": [30,144,255,1],
  "firebrick": [178,34,34,1], "floralwhite": [255,250,240,1],
  "forestgreen": [34,139,34,1], "fuchsia": [255,0,255,1],
  "gainsboro": [220,220,220,1], "ghostwhite": [248,248,255,1],
  "gold": [255,215,0,1], "goldenrod": [218,165,32,1],
  "gray": [128,128,128,1], "green": [0,128,0,1],
  "greenyellow": [173,255,47,1], "grey": [128,128,128,1],
  "honeydew": [240,255,240,1], "hotpink": [255,105,180,1],
  "indianred": [205,92,92,1], "indigo": [75,0,130,1],
  "ivory": [255,255,240,1], "khaki": [240,230,140,1],
  "lavender": [230,230,250,1], "lavenderblush": [255,240,245,1],
  "lawngreen": [124,252,0,1], "lemonchiffon": [255,250,205,1],
  "lightblue": [173,216,230,1], "lightcoral": [240,128,128,1],
  "lightcyan": [224,255,255,1], "lightgoldenrodyellow": [250,250,210,1],
  "lightgray": [211,211,211,1], "lightgreen": [144,238,144,1],
  "lightgrey": [211,211,211,1], "lightpink": [255,182,193,1],
  "lightsalmon": [255,160,122,1], "lightseagreen": [32,178,170,1],
  "lightskyblue": [135,206,250,1], "lightslategray": [119,136,153,1],
  "lightslategrey": [119,136,153,1], "lightsteelblue": [176,196,222,1],
  "lightyellow": [255,255,224,1], "lime": [0,255,0,1],
  "limegreen": [50,205,50,1], "linen": [250,240,230,1],
  "magenta": [255,0,255,1], "maroon": [128,0,0,1],
  "mediumaquamarine": [102,205,170,1], "mediumblue": [0,0,205,1],
  "mediumorchid": [186,85,211,1], "mediumpurple": [147,112,219,1],
  "mediumseagreen": [60,179,113,1], "mediumslateblue": [123,104,238,1],
  "mediumspringgreen": [0,250,154,1], "mediumturquoise": [72,209,204,1],
  "mediumvioletred": [199,21,133,1], "midnightblue": [25,25,112,1],
  "mintcream": [245,255,250,1], "mistyrose": [255,228,225,1],
  "moccasin": [255,228,181,1], "navajowhite": [255,222,173,1],
  "navy": [0,0,128,1], "oldlace": [253,245,230,1],
  "olive": [128,128,0,1], "olivedrab": [107,142,35,1],
  "orange": [255,165,0,1], "orangered": [255,69,0,1],
  "orchid": [218,112,214,1], "palegoldenrod": [238,232,170,1],
  "palegreen": [152,251,152,1], "paleturquoise": [175,238,238,1],
  "palevioletred": [219,112,147,1], "papayawhip": [255,239,213,1],
  "peachpuff": [255,218,185,1], "peru": [205,133,63,1],
  "pink": [255,192,203,1], "plum": [221,160,221,1],
  "powderblue": [176,224,230,1], "purple": [128,0,128,1],
  "rebeccapurple": [102,51,153,1],
  "red": [255,0,0,1], "rosybrown": [188,143,143,1],
  "royalblue": [65,105,225,1], "saddlebrown": [139,69,19,1],
  "salmon": [250,128,114,1], "sandybrown": [244,164,96,1],
  "seagreen": [46,139,87,1], "seashell": [255,245,238,1],
  "sienna": [160,82,45,1], "silver": [192,192,192,1],
  "skyblue": [135,206,235,1], "slateblue": [106,90,205,1],
  "slategray": [112,128,144,1], "slategrey": [112,128,144,1],
  "snow": [255,250,250,1], "springgreen": [0,255,127,1],
  "steelblue": [70,130,180,1], "tan": [210,180,140,1],
  "teal": [0,128,128,1], "thistle": [216,191,216,1],
  "tomato": [255,99,71,1], "turquoise": [64,224,208,1],
  "violet": [238,130,238,1], "wheat": [245,222,179,1],
  "white": [255,255,255,1], "whitesmoke": [245,245,245,1],
  "yellow": [255,255,0,1], "yellowgreen": [154,205,50,1]};

function clamp_css_byte(i) {  // Clamp to integer 0 .. 255.
  i = Math.round(i);  // Seems to be what Chrome does (vs truncation).
  return i < 0 ? 0 : i > 255 ? 255 : i;
}

function clamp_css_float(f) {  // Clamp to float 0.0 .. 1.0.
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

function parse_css_int(str) {  // int or percentage.
  if (str[str.length - 1] === '%')
    return clamp_css_byte(parseFloat(str) / 100 * 255);
  return clamp_css_byte(parseInt(str));
}

function parse_css_float(str) {  // float or percentage.
  if (str[str.length - 1] === '%')
    return clamp_css_float(parseFloat(str) / 100);
  return clamp_css_float(parseFloat(str));
}

function css_hue_to_rgb(m1, m2, h) {
  if (h < 0) h += 1;
  else if (h > 1) h -= 1;

  if (h * 6 < 1) return m1 + (m2 - m1) * h * 6;
  if (h * 2 < 1) return m2;
  if (h * 3 < 2) return m1 + (m2 - m1) * (2/3 - h) * 6;
  return m1;
}

function parseCSSColor(css_str) {
  // Remove all whitespace, not compliant, but should just be more accepting.
  var str = css_str.replace(/ /g, '').toLowerCase();

  // Color keywords (and transparent) lookup.
  if (str in kCSSColorTable) return kCSSColorTable[str].slice();  // dup.

  // #abc and #abc123 syntax.
  if (str[0] === '#') {
    if (str.length === 4) {
      var iv = parseInt(str.substr(1), 16);  // TODO(deanm): Stricter parsing.
      if (!(iv >= 0 && iv <= 0xfff)) return null;  // Covers NaN.
      return [((iv & 0xf00) >> 4) | ((iv & 0xf00) >> 8),
              (iv & 0xf0) | ((iv & 0xf0) >> 4),
              (iv & 0xf) | ((iv & 0xf) << 4),
              1];
    } else if (str.length === 7) {
      var iv = parseInt(str.substr(1), 16);  // TODO(deanm): Stricter parsing.
      if (!(iv >= 0 && iv <= 0xffffff)) return null;  // Covers NaN.
      return [(iv & 0xff0000) >> 16,
              (iv & 0xff00) >> 8,
              iv & 0xff,
              1];
    }

    return null;
  }

  var op = str.indexOf('('), ep = str.indexOf(')');
  if (op !== -1 && ep + 1 === str.length) {
    var fname = str.substr(0, op);
    var params = str.substr(op+1, ep-(op+1)).split(',');
    var alpha = 1;  // To allow case fallthrough.
    switch (fname) {
      case 'rgba':
        if (params.length !== 4) return null;
        alpha = parse_css_float(params.pop());
        // Fall through.
      case 'rgb':
        if (params.length !== 3) return null;
        return [parse_css_int(params[0]),
                parse_css_int(params[1]),
                parse_css_int(params[2]),
                alpha];
      case 'hsla':
        if (params.length !== 4) return null;
        alpha = parse_css_float(params.pop());
        // Fall through.
      case 'hsl':
        if (params.length !== 3) return null;
        var h = (((parseFloat(params[0]) % 360) + 360) % 360) / 360;  // 0 .. 1
        // NOTE(deanm): According to the CSS spec s/l should only be
        // percentages, but we don't bother and let float or percentage.
        var s = parse_css_float(params[1]);
        var l = parse_css_float(params[2]);
        var m2 = l <= 0.5 ? l * (s + 1) : l + s - l * s;
        var m1 = l * 2 - m2;
        return [clamp_css_byte(css_hue_to_rgb(m1, m2, h+1/3) * 255),
                clamp_css_byte(css_hue_to_rgb(m1, m2, h) * 255),
                clamp_css_byte(css_hue_to_rgb(m1, m2, h-1/3) * 255),
                alpha];
      default:
        return null;
    }
  }

  return null;
}

try { exports.parseCSSColor = parseCSSColor; } catch(e) { }
});
var csscolorparser_1 = csscolorparser.parseCSSColor;

function buildInterpFunc(base, sampleVal) {
  // Return a function to interpolate the value of y(x), given endpoints
  // p0 = (x0, y0) and p2 = (x1, y1)

  const scale = getScale(base);
  const interpolate = getInterpolator(sampleVal);

  return (p0, x, p1) => interpolate( p0[1], scale(p0[0], x, p1[0]), p1[1] );
}

function getScale(base) {
  // Return a function to find the relative position of x between a and b

  // Exponential scale follows mapbox-gl-js, style-spec/function/index.js
  // NOTE: https://github.com/mapbox/mapbox-gl-js/issues/2698 not addressed!
  const scale = (base === 1)
    ? (a, x, b) => (x - a) / (b - a)  // Linear scale
    : (a, x, b) => (Math.pow(base, x - a) - 1) / (Math.pow(base, b - a) - 1);

  // Add check for zero range
  return (a, x, b) => (a === b)
    ? 0
    : scale(a, x, b);
}

function getInterpolator(sampleVal) {
  // Return a function to find an interpolated value between end values v1, v2,
  // given relative position t between the two end positions

  var type = typeof sampleVal;
  if (type === "string" && csscolorparser_1(sampleVal)) type = "color";

  switch (type) {
    case "number": // Linear interpolator
      return (v1, t, v2) => v1 + t * (v2 - v1);

    case "color":  // Interpolate RGBA
      return (v1, t, v2) => 
        interpColor( csscolorparser_1(v1), t, csscolorparser_1(v2) );

    default:       // Assume step function
      return (v1, t, v2) => v1;
  }
}

function interpColor(c0, t, c1) {
  // Inputs c0, c1 are 4-element RGBA arrays as returned by parseCSSColor
  let c = c0.map( (c0_i, i) => c0_i + t * (c1[i] - c0_i) );

  return "rgba(" +
    Math.round(c[0]) + ", " +
    Math.round(c[1]) + ", " + 
    Math.round(c[2]) + ", " +
    c[3] + ")";
}

function autoGetters(properties = {}, defaults) {
  const getters = {};
  Object.keys(defaults).forEach(key => {
    getters[key] = buildStyleFunc(properties[key], defaults[key]);
  });
  return getters;
}

function buildStyleFunc(style, defaultVal) {
  var styleFunc, getArg;

  if (style === undefined) {
    styleFunc = () => defaultVal;
    styleFunc.type = "constant";

  } else if (typeof style !== "object" || Array.isArray(style)) {
    styleFunc = () => style;
    styleFunc.type = "constant";

  } else if (!style.property || style.property === "zoom") {
    getArg = (zoom, feature) => zoom;
    styleFunc = getStyleFunc(style, getArg);
    styleFunc.type = "zoom";

  } else {
    let propertyName = style.property;
    getArg = (zoom, feature) => feature.properties[propertyName];
    styleFunc = getStyleFunc(style, getArg);
    styleFunc.type = "property";
    styleFunc.property = propertyName;

  } // NOT IMPLEMENTED: zoom-and-property functions

  return styleFunc;
}

function getStyleFunc(style, getArg) {
  if (style.type === "identity") return getArg;

  // We should be building a stop function now. Make sure we have enough info
  var stops = style.stops;
  if (!stops || stops.length < 2 || stops[0].length !== 2) {
    console.log("buildStyleFunc: style = " + JSON.stringify(style));
    console.log("ERROR in buildStyleFunc: failed to understand style!");
    return;
  }

  var stopFunc = buildStopFunc(stops, style.base);
  return (zoom, feature) => stopFunc( getArg(zoom, feature) );
}

function buildStopFunc(stops, base = 1) {
  const izm = stops.length - 1;
  const interpolateVal = buildInterpFunc(base, stops[0][1]);

  return function(x) {
    let iz = stops.findIndex(stop => stop[0] > x);

    if (iz === 0) return stops[0][1]; // x is below first stop
    if (iz < 0) return stops[izm][1]; // x is above last stop

    return interpolateVal(stops[iz-1], x, stops[iz]);
  }
}

const layoutDefaults = {
  "background": {
    "visibility": "visible",
  },
  "fill": {
    "visibility": "visible",
  },
  "line": {
    "visibility": "visible",
    "line-cap": "butt",
    "line-join": "miter",
    "line-miter-limit": 2,
    "line-round-limit": 1.05,
  },
  "symbol": {
    "visibility": "visible",

    "symbol-placement": "point",
    "symbol-spacing": 250,
    "symbol-avoid-edges": false,
    "symbol-sort-key": undefined,
    "symbol-z-order": "auto",

    "icon-allow-overlap": false,
    "icon-ignore-placement": false,
    "icon-optional": false,
    "icon-rotation-alignment": "auto",
    "icon-size": 1,
    "icon-text-fit": "none",
    "icon-text-fit-padding": [0, 0, 0, 0],
    "icon-image": undefined,
    "icon-rotate": 0,
    "icon-padding": 2,
    "icon-keep-upright": false,
    "icon-offset": [0, 0],
    "icon-anchor": "center",
    "icon-pitch-alignment": "auto",

    "text-pitch-alignment": "auto",
    "text-rotation-alignment": "auto",
    "text-field": "",
    "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
    "text-size": 16,
    "text-max-width": 10,
    "text-line-height": 1.2,
    "text-letter-spacing": 0,
    "text-justify": "center",
    "text-radial-offset": 0,
    "text-variable-anchor": undefined,
    "text-anchor": "center",
    "text-max-angle": 45,
    "text-rotate": 0,
    "text-padding": 2.0,
    "text-keep-upright": true,
    "text-transform": "none",
    "text-offset": [0, 0],
    "text-allow-overlap": false,
    "text-ignore-placement": false,
    "text-optional": false,
  },
  "raster": {
    "visibility": "visible",
  },
  "circle": {
    "visibility": "visible",
  },
  "fill-extrusion": {
    "visibility": "visible",
  },
  "heatmap": {
    "visibility": "visible",
  },
  "hillshade": {
    "visibility": "visible",
  },
};

const paintDefaults = {
  "background": {
    "background-color": "#000000",
    "background-opacity": 1,
    "background-pattern": undefined,
  },
  "fill": {
    "fill-antialias": true,
    "fill-opacity": 1,
    "fill-color": "#000000",
    "fill-outline-color": undefined,
    "fill-outline-width": 1, // non-standard!
    "fill-translate": [0, 0],
    "fill-translate-anchor": "map",
    "fill-pattern": undefined,
  },
  "line": {
    "line-opacity": 1,
    "line-color": "#000000",
    "line-translate": [0, 0],
    "line-translate-anchor": "map",
    "line-width": 1,
    "line-gap-width": 0,
    "line-offset": 0,
    "line-blur": 0,
    "line-dasharray": undefined,
    "line-pattern": undefined,
    "line-gradient": undefined,
  },
  "symbol": {
    "icon-opacity": 1,
    "icon-color": "#000000",
    "icon-halo-color": "rgba(0, 0, 0, 0)",
    "icon-halo-width": 0,
    "icon-halo-blur": 0,
    "icon-translate": [0, 0],
    "icon-translate-anchor": "map",

    "text-opacity": 1,
    "text-color": "#000000",
    "text-halo-color": "rgba(0, 0, 0, 0)",
    "text-halo-width": 0,
    "text-halo-blur": 0,
    "text-translate": [0, 0],
    "text-translate-anchor": "map",
  },
  "raster": {
    "raster-opacity": 1,
    "raster-hue-rotate": 0,
    "raster-brighness-min": 0,
    "raster-brightness-max": 1,
    "raster-saturation": 0,
    "raster-contrast": 0,
    "raster-resampling": "linear",
    "raster-fade-duration": 300,
  },
  "circle": {
    "circle-radius": 5,
    "circle-color": "#000000",
    "circle-blur": 0,
    "circle-opacity": 1,
    "circle-translate": [0, 0],
    "circle-translate-anchor": "map",
    "circle-pitch-scale": "map",
    "circle-pitch-alignment": "viewport",
    "circle-stroke-width": 0,
    "circle-stroke-color": "#000000",
    "circle-stroke-opacity": 1,
  },
  "fill-extrusion": {
    "fill-extrusion-opacity": 1,
    "fill-extrusion-color": "#000000",
    "fill-extrusion-translate": [0, 0],
    "fill-extrusion-translate-anchor": "map",
    "fill-extrusion-height": 0,
    "fill-extrusion-base": 0,
    "fill-extrusion-vertical-gradient": true,
  },
  "heatmap": {
    "heatmap-radius": 30,
    "heatmap-weight": 1,
    "heatmap-intensity": 1,
    "heatmap-color": ["interpolate",["linear"],["heatmap-density"],0,"rgba(0, 0, 255,0)",0.1,"royalblue",0.3,"cyan",0.5,"lime",0.7,"yellow",1,"red"],
    "heatmap-opacity": 1,
  },
  "hillshade": {
    "hillshade-illumination-direction": 335,
    "hillshade-illumination-anchor": "viewport",
    "hillshade-exaggeration": 0.5,
    "hillshade-shadow-color": "#000000",
    "hillshade-highlight-color": "#FFFFFF",
    "hillshade-accent-color": "#000000",
  },
};

function getStyleFuncs(inputLayer) {
  const layer = Object.assign({}, inputLayer); // Leave input unchanged

  // Replace rendering properties with functions
  layer.layout = autoGetters(layer.layout, layoutDefaults[layer.type]);
  layer.paint  = autoGetters(layer.paint,  paintDefaults[layer.type] );

  return layer;
}

// https://developer.mozilla.org/en-US/docs/Web/CSS/font-weight#Common_weight_name_mapping
// Some obscure names from https://css3-tutorial.net/text-font/font-weight/
// But the 2 sources conflict!! The mapping is not standardized!
const fontWeights = {
  "thin": 100,
  "hairline": 100,
  "extra-light": 200,
  "ultra-light": 200,
  "light": 300,
  "book": 300,
  "regular": 400,
  "normal": 400,
  "plain": 400,
  "roman": 400,
  "standard": 400,
  "medium": 500,
  "semi-bold": 600,
  "demi-bold": 600,
  "bold": 700,
  "extra-bold": 800,
  "ultra-bold": 800,
  "heavy": 900,
  "black": 900,
  "fat": 900,
  "poster": 900,
  "ultra-black": 950,
  "extra-black": 950,
  "heavy-black": 950,
};
const wNames = Object.keys(fontWeights);

function popFontWeight(words, defaultWeight) {
  // Input words is an array of words from a font descriptor string, 
  // where the last word (or two) may contain font-weight info. 
  // Returns a numeric font-weight (if found), or defaultWeight
  // NOTES
  //  - ASSUMES font-style info (italics) has already been removed.
  //  - Input words array may be shortened!

  // If the last word is already a numeric weight, just remove and return it
  if (typeof words.slice(-1)[0] === "number") return words.pop();

  // Check if the last word matches one of the weight names in the dictionary
  var test = words.slice(-1)[0].toLowerCase();
  let wName = wNames.find(w => w == test || w.replace("-", "") == test);
  if (wName) {
    words.pop();
    return fontWeights[wName];
  }

  // Try again with the last 2 words
  test = words.slice(-2).join(" ").toLowerCase();
  wName = wNames.find(w => w.replace("-", " ") == test);
  if (wName) {
    words.pop();
    words.pop();
  }
  return fontWeights[wName] || defaultWeight;
}

const italicRE = /(italic|oblique)$/i;
const fontCache = {};

function getFontString(fonts, size, lineHeight) {
  // TODO: Need to pre-load all needed fonts, using FontFace API
  if (!Array.isArray(fonts)) fonts = [fonts];

  // Check if we already calculated the CSS for this font
  var cssData = fontCache[fonts.join(",")];
  if (cssData) return combine(cssData, size, lineHeight);

  var weight = 400;
  var style = 'normal';
  var fontFamilies = [];
  fonts.forEach(font => {
    var parts = font.split(' ');

    // Get font-style from end of string
    var maybeStyle = parts[parts.length - 1].toLowerCase();
    if (["normal", "italic", "oblique"].includes(maybeStyle)) {
      style = maybeStyle;
      parts.pop();
    } else if (italicRE.test(maybeStyle)) {
      // Style is part of the last word. Separate the parts
      // NOTE: haven't seen an example of this?
      // Idea from the mapbox-to-css module on NPM
      style = italicRE.exec(maybeStyle)[0];
      parts[parts.length - 1].replace(italicRE, '');
    }

    // Get font-weight
    weight = popFontWeight(parts, weight);

    // Get font-family
    // Special handling for Noto Sans, from mapbox-to-css module on NPM
    var fontFamily = parts.join(" ")
      .replace('Klokantech Noto Sans', 'Noto Sans');
    if (fontFamily.indexOf(" ") !== -1) { // Multi-word string. Wrap it in quotes
      fontFamily = '"' + fontFamily + '"';
    }
    fontFamilies.push(fontFamily);
  });

  fontFamilies.push("sans-serif"); // Last resort fallback

  // CSS font property: font-style font-weight font-size/line-height font-family
  cssData = fontCache[fonts.join(",")] = [style, weight, fontFamilies];

  return combine(cssData, size, lineHeight);
}
function combine(cssData, size, lineHeight) {
  // Round fontSize to the nearest 0.1 pixel
  size = Math.round(10.0 * size) * 0.1;

  // Combine with line height
  let sizes = (lineHeight) 
    ? size + "px/" + lineHeight 
    : size + "px";

  return [cssData[0], cssData[1], sizes, cssData[2]].join(" ");
}

function pointPath(path, point) {
  // Draws a Point geometry, which is an array of two coordinates
  path.moveTo(point[0], point[1]);
  path.lineTo(point[0], point[1]);
}

function linePath(path, points) {
  // Draws a LineString geometry, which is an array of Points.
  var p = points[0], i = 0, n = points.length;
  path.moveTo(p[0], p[1]);
  while (++i < n) p = points[i], path.lineTo(p[0], p[1]);
}

function polygonPath(path, lines) {
  // Draws a Polygon geometry, which is an array of LineStrings
  var i = -1, n = lines.length;
  while (++i < n) linePath(path, lines[i]);
}

const pathFuncs = {
  Point: pointPath,
  LineString: linePath,
  Polygon: polygonPath,
};

function geomToPath(geometry) {
  // Converts a GeoJSON Feature geometry to a Path2D object

  var type = geometry.type;
  var isMulti = type.substring(0, 5) === "Multi";
  if (isMulti) type = type.substring(5);

  const pathFunc = pathFuncs[type];

  const path = new Path2D();

  const coords = geometry.coordinates;
  if (isMulti) {
    // While loops faster than forEach: https://jsperf.com/loops/32
    var i = -1, n = coords.length;
    while (++i < n) pathFunc(path, coords[i]);

  } else {
    pathFunc(path, coords);
  }

  return path;
}

function initDataPrep(rawStyles) {
  // Parse the style functions
  const styles = rawStyles.map(getStyleFuncs);

  // Build a dictionary of data prep functions, keyed on style.id
  const prepFunctions = {};
  styles.forEach(style => {
    prepFunctions[style.id] = (style.type === "symbol")
      ? initTextMeasurer(style)
      : addPaths;
  });

  // Return a function that creates an array of prep calls for a source
  return function (source, zoom) {
    return Object.keys(source)
      .map( id => () => prepFunctions[id](source[id], zoom) );
  };
}

function initTextMeasurer(style) {
  // TODO: This closure only saves one createElement call. Is it worth it?
  const ctx = document.createElement("canvas").getContext("2d");
  const layout = style.layout;

  return function(data, zoom) {
    const fontSize = layout["text-size"](zoom);
    const fontFace = layout["text-font"](zoom);
    const lineHeight = layout["text-line-height"](zoom);
    const font = getFontString(fontFace, fontSize, lineHeight);

    if (!data.properties) data.properties = {};
    data.properties.font = font;
    ctx.font = font;

    data.compressed.forEach(feature => {
      let labelText = feature.properties.labelText;
      if (!labelText) return;
      feature.properties.textWidth = ctx.measureText(labelText).width;
    });

    return data;
  };
}

function addPaths(data) {
  data.compressed.forEach(feature => {
    // TODO: Does this need to be interruptable?
    feature.path = geomToPath(feature.geometry);
    delete feature.geometry; // Allow it to be garbage collected
  });

  return data;
}

const workerPath = "./worker.bundle.js";

function initTileMixer(userParams) {
  const params = setParams(userParams);

  // Initialize workers
  const workers = initWorkers(params.threads, workerPath, params.layers);

  // Initialize chunked queue, OR input it? What about prioritization? TODO
  // Initialize data prep functions
  const getPrepFuncs = initDataPrep(params.layers);

  // Define request function
  function request(z, x, y, callback) {
    const url = params.getURL(z, x, y);
    const payload = { href: url, size: 512, zoom: z };
    const wrapCb = (err, src) => prepCallback(err, src, z, callback);
    return workers.startTask(payload, wrapCb);
  }

  // Returned API  TODO: Extend canceler to stop prerendering
  return {
    request,
    cancelTask: (id) => workers.cancelTask(id),
    activeTasks: () => workers.activeTasks(),
    terminate: () => workers.terminate(),
  };

  function prepCallback(err, source, zoom, callback) {
    if (err) return callback(err);

    getPrepFuncs(source, zoom).forEach( func => func() );

    return callback(null, source);
  }
}

export { initTileMixer };
