export function initFeatureGrouper(style) {
  // Find the names of the feature properties that affect rendering
  const renderPropertyNames = Object.values(style.paint)
    .filter(styleFunc => styleFunc.type === "property")
    .map(styleFunc => styleFunc.property);

  return function(features) {
    // Group features that will be styled the same
    const groups = {};
    features.forEach(feature => {
      // Keep only the properties relevant to rendering
      let properties = renderPropertyNames
        .reduce((d, k) => (d[k] = feature.properties[k], d), {});

      // Look up the appropriate group, or create it if it doesn't exist
      let key = Object.entries(properties).join();
      if (!groups[key]) groups[key] = initFeature(feature, properties);

      // Append this features buffers to the grouped feature
      appendBuffers(groups[key].buffers, feature.buffers);
    });

    return Object.values(groups).map(makeTypedArrays);
  };
}

function initFeature(template, renderProperties) {
  const properties = Object.assign({}, renderProperties);
  const buffers = Object.keys(template.buffers)
    .reduce((d, k) => (d[k] = [], d), {});

  return { properties, buffers };
}

function appendBuffers(buffers, newBuffers) {
  const appendix = Object.assign({}, newBuffers);
  if (buffers.indices) {
    let indexShift = buffers.position.length / 2;
    appendix.indices = newBuffers.indices.map(i => i + indexShift);
  }
  Object.keys(buffers).forEach(k => {
    // NOTE: The 'obvious' buffers[k].push(...appendix[k]) fails with
    //  the error "Maximum call stack size exceeded"
    let base = buffers[k];
    appendix[k].forEach(a => base.push(a));
  });
}

function makeTypedArrays(feature) {
  const { properties, buffers } = feature;
  // Note: modifying in place!
  Object.keys(buffers).forEach(key => {
    buffers[key] = (key === "indices")
      ? new Uint16Array(buffers[key])
      : new Float32Array(buffers[key]);
  });
  return feature;
}
