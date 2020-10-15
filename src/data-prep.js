export function initDataPrep(context) {
  // Return a function that creates an array of prep calls for a source
  return function (source) {
    let { atlas, layers } = source;

    const prepTasks = Object.values(layers)
      .map(layer => () => loadFeatures(layer));

    if (atlas) {
      prepTasks.push(() => { source.atlas = context.loadAtlas(atlas); });
    }

    return prepTasks;
  };

  function loadFeatures(features) {
    // TODO: make this more functional? Note: keeping feature.properties
    features.forEach(feature => {
      feature.path = context.loadBuffers(feature.buffers);
      delete feature.buffers;  // Should we do this?
    });
  }
}
