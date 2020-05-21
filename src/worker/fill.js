import earcut from 'earcut';
import { flattenLine } from "./line.js";

export function triangulate(feature) {
  const { geometry, properties } = feature;

  // Get an array of points for the outline
  const points = new Float32Array( flattenLine(geometry) );

  // Normalize coordinate structure
  var { type, coordinates } = geometry;
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
    indices: new Uint16Array(combined.indices),
    points,
  };
}
