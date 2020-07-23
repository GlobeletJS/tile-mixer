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
  Object.keys(buffers).forEach(key => {
    if (key === "indices") {
      let indexShift = buffers.vertices.length / 2;
      let shifted = newBuffers[key].map(i => i + indexShift);
      buffers[key].push(...shifted);
    } else {
      buffers[key].push(...newBuffers[key]);
    }
  });
}

function makeTypedArrays(feature) {
  const { properties, buffers } = feature;
  // Note: modifying in place!
  Object.keys(buffers).forEach(key => {
    if (key === "indices") {
      buffers[key] = new Uint16Array(buffers[key]);
    } else {
      buffers[key] = new Float32Array(buffers[key]);
    }
  });
  return feature;
}
