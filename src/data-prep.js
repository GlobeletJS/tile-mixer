import {
  initLineBufferLoader,
  initFillBufferLoader,
  initTextBufferLoader,
  initAtlasLoader,
} from 'tile-gl';

export function initDataPrep(styles, context) {
  const lineLoader = initLineBufferLoader(context);
  const fillLoader = initFillBufferLoader(context, lineLoader);
  const textLoader = initTextBufferLoader(context);
  const loadAtlas  = initAtlasLoader(context);

  const pathFuncs = {
    "circle": () => undefined, // TODO
    "line": makePathAdder(lineLoader),
    "fill": makePathAdder(fillLoader),
    "symbol": makePathAdder(textLoader), // TODO: add sprite handling
  };

  // Build a dictionary of data prep functions, keyed on style.id
  const prepFunctions = styles.reduce((dict, style) => {
    let { id, type } = style;
    dict[id] = pathFuncs[type];
    return dict;
  }, {});

  // Return a function that creates an array of prep calls for a source
  return function (source, zoom) {
    let { atlas, layers } = source;

    const prepTasks = Object.keys(layers)
      .map(id => () => prepFunctions[id](layers[id], zoom));

    prepTasks.push(() => { source.atlas = loadAtlas(atlas); });

    return prepTasks;
  };
}

function makePathAdder(pathFunc) {
  // TODO: make this more functional? Note: keeping feature.properties
  return (features) => features.forEach(feature => {
    feature.path = pathFunc(feature.buffers);
    delete feature.buffers;  // Should we do this?
  });
}
