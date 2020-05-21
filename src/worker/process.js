import { initSymbolParser, getFont } from "./symbol.js";
import { initFeatureGrouper } from "./group-features.js";
import { triangulate } from "./fill.js";
import { parseLine } from "./line.js";

export function initProcessor(style, contextType) {
  const { type, layout, interactive } = style;

  const isLabel = (type === "symbol");
  const compress = (isLabel)
    ? initSymbolParser(style)
    : initFeatureGrouper(style);

  const postProcess =
    (contextType === "Canvas2D") ? f => f
    : (type === "fill") ? triangulate
    : (type === "line") ? parseLine
    : f => f;

  return function(features, zoom) {
    const compressed = compress(features, zoom).map(postProcess);

    const collection = { type: "FeatureCollection", compressed };
    if (interactive) collection.features = features;
    if (isLabel) collection.properties = { font: getFont(layout, zoom) };

    return collection;
  };
}
