import earcut from 'earcut';

export function triangulate(feature) {
  var { geometry: { type, coordinates }, properties } = feature;

  // Normalize coordinate structure
  if (type === "Polygon") {
    coordinates = [coordinates];
  } else if (type !== "MultiPolygon") {
    return feature; // Triangulation only makes sense for Polygons/MultiPolygons
  }

  const combined = coordinates
    .map(coord => {
      let { vertices, holes, dimensions } = earcut.flatten(coord);
      let indices = earcut(vertices, holes, dimensions);
      return { vertices, indices };
    })
    .reduce((accumulator, current) => {
      let indexShift = accumulator.vertices.length / 2;
      accumulator.vertices.push(...current.vertices);
      accumulator.indices.push(...current.indices.map(h => h + indexShift));
      return accumulator;
    });

  return {
    properties: Object.assign({}, properties),
    vertices: new Float32Array(combined.vertices),
    indices: new Uint16Array(combined.indices)
  };
}
