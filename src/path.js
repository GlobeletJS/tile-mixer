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

export function geomToPath(feature) {
  var { geometry: { type, coordinates } } = feature;

  var isMulti = type.substring(0, 5) === "Multi";
  if (isMulti) type = type.substring(5);

  const pathFunc = pathFuncs[type];

  const path = new Path2D();

  if (isMulti) {
    // While loops faster than forEach: https://jsperf.com/loops/32
    var i = -1, n = coordinates.length;
    while (++i < n) pathFunc(path, coordinates[i]);

  } else {
    pathFunc(path, coordinates);
  }

  return path;
}
