import { geomToPath } from "./path.js";
import { initFillBufferLoader } from "./fill.js";
import { initLineBufferLoader } from "./line.js";

export function initDataPrep(styles, context) {
  // Build a dictionary of data prep functions, keyed on style.id
  const prepFunctions = {};
  const pathFunctions = initPathFunctions(context);
  styles.forEach(style => {
    let { id, type } = style;
    prepFunctions[id] = 
      (type === "symbol") ? initTextMeasurer(style)
      : makePathAdder(pathFunctions[type]);
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

  return function(data, zoom) {
    ctx.font = data.properties.font;

    data.compressed.forEach(feature => {
      let labelText = feature.properties.labelText;
      if (!labelText) return;
      feature.properties.textWidth = ctx.measureText(labelText).width;
    });

    return data;
  };
}

function initPathFunctions(context) {
  if (context instanceof CanvasRenderingContext2D) {
    return {
      "circle": geomToPath,
      "line": geomToPath,
      "fill": geomToPath,
    };
  }

  const lineLoader = initLineBufferLoader(context);
  const fillLoader = initFillBufferLoader(context, lineLoader);

  return {
    "circle": geomToPath,
    "line": lineLoader,
    "fill": fillLoader,
  };
}

function makePathAdder(pathFunc) {
  return function(data) {
    data.compressed = data.compressed.map(feature => {
      let path = pathFunc(feature);
      return { path, properties: feature.properties };
    });
    return data;
  };
}
