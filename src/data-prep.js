import { getStyleFuncs } from 'tile-stencil';
import { getFontString } from "./font.js";
import { geomToPath } from "./path.js";

export function initDataPrep(rawStyles) {
  // Parse the style functions
  const styles = rawStyles.map(getStyleFuncs);

  // Build a dictionary of data prep functions, keyed on style.id
  const prepFunctions = {};
  styles.forEach(style => {
    prepFunctions[style.id] = (style.type === "symbol")
      ? initTextMeasurer(style)
      : addPaths;
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
  const layout = style.layout;

  return function(data, zoom) {
    const fontSize = layout["text-size"](zoom);
    const fontFace = layout["text-font"](zoom);
    const lineHeight = layout["text-line-height"](zoom);
    const font = getFontString(fontFace, fontSize, lineHeight);

    if (!data.properties) data.properties = {};
    data.properties.font = font;
    ctx.font = font;

    data.compressed.forEach(feature => {
      let labelText = feature.properties.labelText;
      if (!labelText) return;
      feature.properties.textWidth = ctx.measureText(labelText).width;
    });

    return data;
  };
}

function addPaths(data) {
  data.compressed.forEach(feature => {
    // TODO: Does this need to be interruptable?
    feature.path = geomToPath(feature.geometry);
    delete feature.geometry; // Allow it to be garbage collected
  });

  return data;
}
