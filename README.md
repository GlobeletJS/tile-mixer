# tile-mixer

Load vector tiles, re-mixing the layers based on a Mapbox style document

Tiles are requested (via HTTP) from the URL endpoints specified in one of the
sources specified in the style document's 'sources' property. The data is then 
parsed from the [Mapbox vector tile] format to [GeoJSON].

The raw tile data is organized into a set of layers determined by the tile
provider. But for rendering in maps, a new layer definition is specified by the
map designer in the [Mapbox style document]. tile-mixer filters and re-orders
the tile data into a new layers object, where the keys are the names of the
*style* layers, and the values are GeoJSON FeatureCollections.

[Mapbox vector tile]: https://github.com/mapbox/vector-tile-spec
[GeoJSON]: https://en.wikipedia.org/wiki/GeoJSON
[Mapbox style document]: https://docs.mapbox.com/mapbox-gl-js/style-spec/

## Installation
tile-mixer is provided as an ESM import
```javascript
import { initTileMixer } from 'tile-mixer';
```

## Initialization
The exposed method can be used to initialize a tileMixer object:
```javascript
const tileMixer = initTileMixer(parameters);
```

The supplied parameters object has the following properties
- `threads`: Number of [Web Workers] that will be used to load and parse
  tiles from the API. Default: 2
- `source`: The desired [source] value from the 'sources' property of the
  style document. Note that any 'url' property will be ignored. The relevant
  [TileJSON] properties MUST be supplied directly. REQUIRED
- `layers`: An array containing the [layers] from the style document that
  use data from the specified source. REQUIRED

[Web Workers]: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
[source]: https://docs.mapbox.com/mapbox-gl-js/style-spec/#sources
[TileJSON]: https://github.com/mapbox/tilejson-spec
[layers]: https://docs.mapbox.com/mapbox-gl-js/style-spec/#layers

## API
Initialization returns an object with the following methods:
- `.request(z, x, y, callback)`: Requests a tile at the given coordinate
  indices, and executes the supplied callback when complete. Returns an integer 
  task ID for this request
- `.cancel(taskID)`: Cancels any active HTTP requests or processing tasks
  associated with the supplied integer ID
- `.activeTasks()`: Returns the (integer) number of active tasks
- `.terminate()`: Cancels all tasks and terminates the Web Workers
