import { initGlyphs } from "./glyphs.js";
import { initShaping } from "./shaping.js";

export function initSymbols({ parsedStyles, glyphEndpoint }) {
  const getGlyphs = initGlyphs({ parsedStyles, glyphEndpoint });

  const shapers = parsedStyles.reduce((dict, style) => {
    let { id, type } = style;
    if (type === "symbol") dict[id] = initShaping(style);
    return dict;
  }, {});

  return function(layers, zoom) {
    return getGlyphs(layers, zoom).then(atlas => {
      const shaped = Object.entries(layers).reduce((d, [id, features]) => {
        // TODO: if getGlyphs or a previous step drops the non-symbol layers,
        // then we can drop the if below
        let shaper = shapers[id];
        if (shaper) d[id] = features.map(f => shaper(f, zoom, atlas));
        return d;
      }, {});

      return { atlas: atlas.image, layers: shaped };
    });
  };
}
