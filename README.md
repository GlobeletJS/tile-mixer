# tile-mixer

![tests](https://github.com/GlobeletJS/tile-mixer/actions/workflows/node.js.yml/badge.svg)

Re-mix vector tile layers based on a MapLibre style document

Raw [vector tile][] data is organized into a set of layers determined by the
tile provider. But for rendering in maps, a new layer definition is specified
by the map designer in the [MapLibre style document][MapLibre]. tile-mixer 
filters and re-orders the tile data into a new layers object, where the keys
are the names of the *style* layers, and the values are [GeoJSON 
FeatureCollections][GeoJSON].

[vector tile]: https://github.com/mapbox/vector-tile-spec
[GeoJSON]: https://en.wikipedia.org/wiki/GeoJSON
[MapLibre]: https://maplibre.org/maplibre-gl-js-docs/style-spec/

## Initialization
A tile-mixer function can be initialized as follows:
```javascript
import * as tileMixer from 'tile-mixer';

const mixer = tileMixer.init(parameters);
```

The supplied parameters object has the following properties:
- `layers` (REQUIRED): An array containing the [layers][] from the style
  document that use data from a given [source][]

[layers]: https://maplibre.org/maplibre-gl-js-docs/style-spec/layers/
[source]: https://maplibre.org/maplibre-gl-js-docs/style-spec/sources/

## API
Initialization returns a function with the following signature:
```javascript
const remixedLayers = mixer(source, zoom);
```

The arguments are:
- `source`: A dictionary of GeoJSON FeatureCollections, with each collection
  containing the features for each layer of the tile, as returned by
  [tile-retriever][]
- `zoom`: The native zoom level of the tile (usually its z-index)

The return value is a dictionary of FeatureCollections of the remixed tile data.
The data structure is comparable to the input source, with the keys of the
dictionary replaced by the names of the layers from the style document

[tile-retriever]: https://github.com/GlobeletJS/tile-retriever
