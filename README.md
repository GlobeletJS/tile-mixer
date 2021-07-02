# tile-mixer

Load vector tiles, re-mixing the layers based on a MapLibre style document

Tiles are requested (via HTTP) from the URL endpoints specified in one of the
sources specified in the style document's 'sources' property. The data is then 
parsed from the [Mapbox vector tile][] format to [GeoJSON][].

The raw tile data is organized into a set of layers determined by the tile
provider. But for rendering in maps, a new layer definition is specified by the
map designer in the [MapLibre style document][MapLibre]. tile-mixer filters and
re-orders the tile data into a new layers object, where the keys are the names
of the *style* layers, and the values are GeoJSON FeatureCollections.

Vector features are also converted into WebGL buffers and other custom
structures that can be rendered more quickly, e.g., by [tile-setter][].
See below for details of the returned data structure.

[Mapbox vector tile]: https://github.com/mapbox/vector-tile-spec
[GeoJSON]: https://en.wikipedia.org/wiki/GeoJSON
[MapLibre]: https://maplibre.org/maplibre-gl-js-docs/style-spec/
[tile-setter]: https://github.com/GlobeletJS/tile-setter

## Format of returned data
The returned data is a dictionary of layers, keyed on the .id of the style
for that layer.

The returned layers are structured similarly to GeoJSON FeatureCollections. 
If the style layer has a property `"interactive": true`, this FeatureCollection
will include a `.features` array with standard Features. This `.features` array 
is suitable for retrieving and querying individual features.

For rendering, the returned object includes two non-standard properties:
- `extent`: The extent of the geometry of the features in the layer
- `compressed`: An array of pre-rendered features, as described below.

For style layers with type `circle`, `line`, or `fill`, each feature in the
`compressed` array will have the following properties:
- `properties`: The feature properties that affect styling.
- `path`: An object including a WebGL [Vertex Array Object][VAO], as generated
  by a [tile-gl][] serializer

[VAO]: https://developer.mozilla.org/en-US/docs/Web/API/OES_vertex_array_object
[tile-gl]: https://github.com/GlobeletJS/tile-gl

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
- `threads`: Number of [Web Workers][] that will be used to load and parse
  tiles from the API. Default: 2
- `source`: The desired [source][] value from the 'sources' property of the
  style document. Note that any 'url' property will be ignored. The relevant
  [TileJSON][] properties MUST be supplied directly. REQUIRED
- `layers`: An array containing the [layers][] from the style document that
  use data from the specified source. REQUIRED
- `queue`: an instance of [chunked-queue][] to use for managing long-running
  tasks. If not supplied, tile-mixer will initialize its own queue
- `verbose`: if true, tile-mixer will print debug info to the console

[Web Workers]: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
[source]: https://maplibre.org/maplibre-gl-js-docs/style-spec/sources/
[TileJSON]: https://github.com/mapbox/tilejson-spec
[layers]: https://maplibre.org/maplibre-gl-js-docs/style-spec/layers/
[chunked-queue]: https://github.com/GlobeletJS/chunked-queue

## API
Initialization returns an object with the following methods:
- `.request(z, x, y, callback)`: Requests a tile at the given coordinate
  indices, and executes the supplied callback when complete. Returns an integer 
  task ID for this request
- `.cancel(taskID)`: Cancels any active HTTP requests or processing tasks
  associated with the supplied integer ID
- `.activeTasks()`: Returns the (integer) number of active tasks
- `.workerTasks()`: Returns the number of tasks active on worker threads
- `.queuedTasks()`: Returns the number of tasks queued on the main thread
- `.terminate()`: Cancels all tasks and terminates the Web Workers
