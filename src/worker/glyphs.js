import { getTokenParser } from "./tokens.js";
import * as sdfManager from 'sdf-manager';

export function initGlyphs({ parsedStyles, glyphEndpoint }) {
  const textGetters = parsedStyles
    .reduce((d, s) => (d[s.id] = initTextGetter(s), d), {});

  const getAtlas = sdfManager.initGetter(glyphEndpoint);

  return function(layers, zoom) {
    const fonts = Object.entries(layers)
      .map(([id, features]) => textGetters[id](features, zoom))
      .reduce(collectCharCodes, {});

    return getAtlas(fonts);
  };
}

function collectCharCodes(fonts, features) {
  features.filter(f => f.labelText !== undefined)
    .forEach(f => {
      let font = fonts[f.font] || (fonts[f.font] = new Set());
      let codes = f.labelText.split("").map(c => c.charCodeAt(0));
      codes.forEach(font.add, font);
    });
  return fonts;
}

function initTextGetter(style) {
  const { type, layout } = style;
  if (type !== "symbol") return () => [];

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
    return features;
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
