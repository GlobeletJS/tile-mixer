# tile-mixer

![tests](https://github.com/GlobeletJS/tile-mixer/actions/workflows/node.js.yml/badge.svg)

Re-mix vector tile layers based on a MapLibre style document

Raw [vector tile][] data is organized into a set of layers determined by the
tile provider. But for rendering in maps, a new layer definition is specified
by the map designer in the [MapLibre style document][MapLibre]. tile-mixer 
filters and re-orders the tile data into a new layers object, where the keys
are the names of the *style* layers, and the values are GeoJSON 
FeatureCollections.

Vector features are also converted into WebGL buffers and other custom
structures that can be rendered more quickly, e.g., by [tile-setter][].
See below for details of the returned data structure.

[vector tile]: https://github.com/mapbox/vector-tile-spec
[GeoJSON]: https://en.wikipedia.org/wiki/GeoJSON
[MapLibre]: https://maplibre.org/maplibre-gl-js-docs/style-spec/
[tile-setter]: https://github.com/GlobeletJS/tile-setter

## Initialization
A tile-mixer function can be initialized as follows:
```javascript
import * as tileMixer 'tile-mixer';

const mixer = tileMixer.init(parameters);
```

The supplied parameters object has the following properties
- `glyphs`: The [glyphs][] property from the style document. Used for
  processing text labels in symbol layers
- `layers` (REQUIRED): An array containing the [layers][] from the style
  document that use data from a given [source][]

[glyphs]: https://maplibre.org/maplibre-gl-js-docs/style-spec/glyphs/
[layers]: https://maplibre.org/maplibre-gl-js-docs/style-spec/layers/
[source]: https://maplibre.org/maplibre-gl-js-docs/style-spec/sources/

## API
Initialization returns a function with the following signature:
```javascript
const tilePromise = mixer(source, tileCoords);
```

The arguments are:
- `source`: A dictionary of GeoJSON FeatureCollections, with each collection
  containing the features for each layer of the tile, as returned by
  [tile-retriever][]
- `tileCoords`: An object with properties `{ z, x, y }`, corresponding to the
  coordinate indices of the supplied tile

The return value is a [Promise][] that resolves to the remixed tile data.
See below for a description of the data structure

[tile-retriever]: https://github.com/GlobeletJS/tile-retriever
[Promise]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise

## Format of returned data
The returned data structure is as follows:
```javascript
{
  atlas,
  layers: { 
    layerId_1: { type, extent, buffers, features },
    layerId_2: { type, extent, buffers, features },
    ...
    layerId_N: { type, extent, buffers, features }
  }
}
```

The `.atlas` property points to an atlas of the signed distance functions 
(SDFs) for the glyphs needed to render text label features in the tile. 
For more information about glyphs and SDFs, see the [tile-labeler][] module.

The `.layers` property points to a dictionary of layers of processed tile data,
keyed on the ID of the relevant style layer. Each layer has the following
properties:
- `type`: The [type of the style layer][styleType] that defines how these
  features will be rendered
- `extent`: The extent of the geometry of the features in the layer (See the
  [vector tile specification][vector tile])
- `buffers`: Geometry and style information for the features of the layer,
  serialized into buffers by [tile-gl][] and [tile-labeler][] functions
- `features` (Optional): The original GeoJSON features. Only present for
  style layers where `layer.interactive === true`. This array is suitable
  for interactive querying of individual layer features

[tile-labeler]: https://github.com/GlobeletJS/tile-labeler
[styleType]: https://maplibre.org/maplibre-gl-js-docs/style-spec/layers/#type
[tile-gl]: https://github.com/GlobeletJS/tile-gl
