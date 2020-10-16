export function initDataPrep(context) {
  const { loadBuffers, loadAtlas } = context;

  // Return a function that creates an array of prep calls for a source
  return function (source, callback) {
    const { atlas, layers } = source;

    const prepTasks = Object.values(layers)
      .map(layer => () => loadFeatures(layer));

    if (atlas) prepTasks.push(() => { source.atlas = loadAtlas(atlas); });

    prepTasks.push(() => callback(null, source));

    return prepTasks;
  };

  function loadFeatures(features) {
    // TODO: make this more functional? Note: keeping feature.properties
    features.forEach(feature => {
      feature.path = loadBuffers(feature.buffers);
      delete feature.buffers;  // Should we do this?
    });
  }
}
