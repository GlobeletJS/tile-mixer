export function initFillBufferLoader(context, lineLoader) {
  const { gl, constructFillVao } = context;

  return function(feature) {
    const vertexPositions = {
      buffer: gl.createBuffer(),
      numComponents: 2,
      type: gl.FLOAT,
      normalize: false,
      stride: 0,
      offset: 0
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositions.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, feature.vertices, gl.STATIC_DRAW);

    const indices = {
      buffer: gl.createBuffer(),
      vertexCount: feature.indices.length,
      type: gl.UNSIGNED_SHORT,
      offset: 0
    };
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices.buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, feature.indices, gl.STATIC_DRAW);

    const attributes = { a_position: vertexPositions };
    const fillVao = constructFillVao({ attributes, indices });
    const path = { fillVao, indices };

    const strokePath = lineLoader(feature);

    return Object.assign(path, strokePath);
  }
}
