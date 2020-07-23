import { getTokenParser } from "./tokens.js";
import * as sdfManager from 'sdf-manager';

export function initGlyphs({ parsedStyles, glyphEndpoint }) {
  const textGetters = parsedStyles.filter(s => s.type === "symbol")
    .reduce((d, s) => (d[s.id] = initTextGetter(s), d), {});

  const getAtlas = sdfManager.initGetter(glyphEndpoint);

  return function(symbolLayers, zoom) {
    const fonts = symbolLayers
      .forEach(l => textGetters[l.id](l.features, zoom))
      .reduce(collectCharCodes, {});

    return getAtlas(fonts);
  };
}

function collectCharCodes(fonts, layer) {
  let features = layer.features.filter(f => f.labelText !== undefined);
  features.forEach(f => {
    let font = fonts[f.font] || (fonts[f.font] = new Set());
    let codes = f.labelText.split("").map(c => c.charCodeAt(0));
    codes.forEach(font.add, font);
  });
}

function initTextGetter(style) {
  const layout = style.layout;

  return function(features, zoom) {
    features.forEach(feature => {
      const textField = layout["text-field"](zoom, feature);
      const text = getTokenParser(textField)(feature.properties);
      if (!text) return;

      const transformCode = layout["text-transform"](zoom, feature);

      // NOTE: modifying the feature in-place!
      feature.labelText = getTextTransform(transformCode)(text);
      feature.font = layout["text-font"](zoom, feature);
    });
  }
}

function getTextTransform(code) {
  switch (code) {
    case "uppercase":
      return f => f.toUpperCase();
    case "lowercase":
      return f => f.toLowerCase();
    case "none":
    default:
      return f => f;
  }
}
