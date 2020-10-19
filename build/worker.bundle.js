import { getStyleFuncs } from 'tile-stencil';
import { parseCircle, parseLine, parseFill } from 'tile-gl';

function buildFeatureFilter(filterObj) {
  // filterObj is a filter definition following the "deprecated" syntax:
  // https://docs.mapbox.com/mapbox-gl-js/style-spec/#other-filter
  if (!filterObj) return () => true;
  const [type, ...vals] = filterObj;

  // If this is a combined filter, the vals are themselves filter definitions
  switch (type) {
    case "all": {
      let filters = vals.map(buildFeatureFilter);  // Iteratively recursive!
      return (d) => filters.every( filt => filt(d) );
    }
    case "any": {
      let filters = vals.map(buildFeatureFilter);
      return (d) => filters.some( filt => filt(d) );
    }
    case "none": {
      let filters = vals.map(buildFeatureFilter);
      return (d) => filters.every( filt => !filt(d) );
    }
    default:
      return getSimpleFilter(filterObj);
  }
}

function getSimpleFilter(filterObj) {
  const [type, key, ...vals] = filterObj;
  const getVal = initFeatureValGetter(key);

  switch (type) {
    // Existential Filters
    case "has": 
      return d => !!getVal(d); // !! forces a Boolean return
    case "!has": 
      return d => !getVal(d);

    // Comparison Filters
    case "==": 
      return d => getVal(d) === vals[0];
    case "!=":
      return d => getVal(d) !== vals[0];
    case ">":
      return d => getVal(d) > vals[0];
    case ">=":
      return d => getVal(d) >= vals[0];
    case "<":
      return d => getVal(d) < vals[0];
    case "<=":
      return d => getVal(d) <= vals[0];

    // Set Membership Filters
    case "in" :
      return d => vals.includes( getVal(d) );
    case "!in" :
      return d => !vals.includes( getVal(d) );
    default:
      console.log("prepFilter: unknown filter type = " + filterObj[0]);
  }
  // No recognizable filter criteria. Return a filter that is always true
  return () => true;
}

function initFeatureValGetter(key) {
  switch (key) {
    case "$type":
      // NOTE: data includes MultiLineString, MultiPolygon, etc-NOT IN SPEC
      return f => {
        let t = f.geometry.type;
        if (t === "MultiPoint") return "Point";
        if (t === "MultiLineString") return "LineString";
        if (t === "MultiPolygon") return "Polygon";
        return t;
      };
    case "$id":
      return f => f.id;
    default:
      return f => f.properties[key];
  }
}

function initSourceFilter(styles) {
  const filters = styles.map(initLayerFilter);

  return function(source, z) {
    return filters.reduce((d, f) => Object.assign(d, f(source, z)), {});
  };
}

function initLayerFilter(style) {
  const { id, type, filter,
    minzoom = 0, maxzoom = 99,
    "source-layer": sourceLayer,
  } = style;

  const filterObject = composeFilters(getGeomFilter(type), filter);
  const parsedFilter = buildFeatureFilter(filterObject);

  return function(source, zoom) {
    // source is a dictionary of FeatureCollections, keyed on source-layer
    if (!source || zoom < minzoom || maxzoom < zoom) return;

    let layer = source[sourceLayer];
    if (!layer) return;

    let features = layer.features.filter(parsedFilter);
    if (features.length > 0) return { [id]: features };
  };
}

function composeFilters(filter1, filter2) {
  if (!filter1) return filter2;
  if (!filter2) return filter1;
  return ["all", filter1, filter2];
}

function getGeomFilter(type) {
  switch (type) {
    case "circle":
      return ["==", "$type", "Point"];
    case "line":
      return ["!=", "$type", "Point"]; // Could be LineString or Polygon
    case "fill":
      return ["==", "$type", "Polygon"];
    case "symbol":
      return ["==", "$type", "Point"]; // TODO: implement line geom labels
    default:
      return; // No condition on geometry
  }
}

function getTokenParser(tokenText) {
  if (!tokenText) return () => undefined;
  const tokenPattern = /{([^{}]+)}/g;

  // We break tokenText into pieces that are either plain text or tokens,
  // then construct an array of functions to parse each piece
  var tokenFuncs = [];
  var charIndex  = 0;
  while (charIndex < tokenText.length) {
    // Find the next token
    let result = tokenPattern.exec(tokenText);

    if (!result) {
      // No tokens left. Parse the plain text after the last token
      let str = tokenText.substring(charIndex);
      tokenFuncs.push(props => str);
      break;
    } else if (result.index > charIndex) {
      // There is some plain text before the token
      let str = tokenText.substring(charIndex, result.index);
      tokenFuncs.push(props => str);
    }

    // Add a function to process the current token
    let token = result[1];
    tokenFuncs.push(props => props[token]);
    charIndex = tokenPattern.lastIndex;
  }
  
  // We now have an array of functions returning either a text string or
  // a feature property
  // Return a function that assembles everything
  return function(properties) {
    return tokenFuncs.reduce(concat, "");
    function concat(str, tokenFunc) {
      let text = tokenFunc(properties) || "";
      return str += text;
    }
  };
}

function initText(parsedStyles) {
  const textGetters = parsedStyles
    .filter(s => s.type === "symbol")
    .reduce((d, s) => (d[s.id] = initTextGetter(s), d), {});

  return function(layers, zoom) {
    return Object.entries(layers).reduce((textLayers, [id, features]) => {
      const getter = textGetters[id];
      if (getter) textLayers[id] = features.map(f => getter(f, zoom));
      return textLayers;
    }, {});
  };
}

function initTextGetter(style) {
  const layout = style.layout;

  return function(feature, zoom) {
    const { geometry, properties } = feature;

    const textField = layout["text-field"](zoom, feature);
    const text = getTokenParser(textField)(properties);
    if (!text) return feature;

    const transformCode = layout["text-transform"](zoom, feature);
    const transform = getTextTransform(transformCode);

    const charCodes = transform(text).split("").map(c => c.charCodeAt(0));
    
    const font = layout["text-font"](zoom, feature);

    return { geometry, properties, font, charCodes };
  };
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

var read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m;
  var eLen = (nBytes * 8) - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var nBits = -7;
  var i = isLE ? (nBytes - 1) : 0;
  var d = isLE ? -1 : 1;
  var s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
};

var write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c;
  var eLen = (nBytes * 8) - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0);
  var i = isLE ? 0 : (nBytes - 1);
  var d = isLE ? 1 : -1;
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = ((value * c) - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128;
};

var ieee754 = {
	read: read,
	write: write
};

var pbf = Pbf;



function Pbf(buf) {
    this.buf = ArrayBuffer.isView && ArrayBuffer.isView(buf) ? buf : new Uint8Array(buf || 0);
    this.pos = 0;
    this.type = 0;
    this.length = this.buf.length;
}

Pbf.Varint  = 0; // varint: int32, int64, uint32, uint64, sint32, sint64, bool, enum
Pbf.Fixed64 = 1; // 64-bit: double, fixed64, sfixed64
Pbf.Bytes   = 2; // length-delimited: string, bytes, embedded messages, packed repeated fields
Pbf.Fixed32 = 5; // 32-bit: float, fixed32, sfixed32

var SHIFT_LEFT_32 = (1 << 16) * (1 << 16),
    SHIFT_RIGHT_32 = 1 / SHIFT_LEFT_32;

// Threshold chosen based on both benchmarking and knowledge about browser string
// data structures (which currently switch structure types at 12 bytes or more)
var TEXT_DECODER_MIN_LENGTH = 12;
var utf8TextDecoder = typeof TextDecoder === 'undefined' ? null : new TextDecoder('utf8');

Pbf.prototype = {

    destroy: function() {
        this.buf = null;
    },

    // === READING =================================================================

    readFields: function(readField, result, end) {
        end = end || this.length;

        while (this.pos < end) {
            var val = this.readVarint(),
                tag = val >> 3,
                startPos = this.pos;

            this.type = val & 0x7;
            readField(tag, result, this);

            if (this.pos === startPos) this.skip(val);
        }
        return result;
    },

    readMessage: function(readField, result) {
        return this.readFields(readField, result, this.readVarint() + this.pos);
    },

    readFixed32: function() {
        var val = readUInt32(this.buf, this.pos);
        this.pos += 4;
        return val;
    },

    readSFixed32: function() {
        var val = readInt32(this.buf, this.pos);
        this.pos += 4;
        return val;
    },

    // 64-bit int handling is based on github.com/dpw/node-buffer-more-ints (MIT-licensed)

    readFixed64: function() {
        var val = readUInt32(this.buf, this.pos) + readUInt32(this.buf, this.pos + 4) * SHIFT_LEFT_32;
        this.pos += 8;
        return val;
    },

    readSFixed64: function() {
        var val = readUInt32(this.buf, this.pos) + readInt32(this.buf, this.pos + 4) * SHIFT_LEFT_32;
        this.pos += 8;
        return val;
    },

    readFloat: function() {
        var val = ieee754.read(this.buf, this.pos, true, 23, 4);
        this.pos += 4;
        return val;
    },

    readDouble: function() {
        var val = ieee754.read(this.buf, this.pos, true, 52, 8);
        this.pos += 8;
        return val;
    },

    readVarint: function(isSigned) {
        var buf = this.buf,
            val, b;

        b = buf[this.pos++]; val  =  b & 0x7f;        if (b < 0x80) return val;
        b = buf[this.pos++]; val |= (b & 0x7f) << 7;  if (b < 0x80) return val;
        b = buf[this.pos++]; val |= (b & 0x7f) << 14; if (b < 0x80) return val;
        b = buf[this.pos++]; val |= (b & 0x7f) << 21; if (b < 0x80) return val;
        b = buf[this.pos];   val |= (b & 0x0f) << 28;

        return readVarintRemainder(val, isSigned, this);
    },

    readVarint64: function() { // for compatibility with v2.0.1
        return this.readVarint(true);
    },

    readSVarint: function() {
        var num = this.readVarint();
        return num % 2 === 1 ? (num + 1) / -2 : num / 2; // zigzag encoding
    },

    readBoolean: function() {
        return Boolean(this.readVarint());
    },

    readString: function() {
        var end = this.readVarint() + this.pos;
        var pos = this.pos;
        this.pos = end;

        if (end - pos >= TEXT_DECODER_MIN_LENGTH && utf8TextDecoder) {
            // longer strings are fast with the built-in browser TextDecoder API
            return readUtf8TextDecoder(this.buf, pos, end);
        }
        // short strings are fast with our custom implementation
        return readUtf8(this.buf, pos, end);
    },

    readBytes: function() {
        var end = this.readVarint() + this.pos,
            buffer = this.buf.subarray(this.pos, end);
        this.pos = end;
        return buffer;
    },

    // verbose for performance reasons; doesn't affect gzipped size

    readPackedVarint: function(arr, isSigned) {
        if (this.type !== Pbf.Bytes) return arr.push(this.readVarint(isSigned));
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readVarint(isSigned));
        return arr;
    },
    readPackedSVarint: function(arr) {
        if (this.type !== Pbf.Bytes) return arr.push(this.readSVarint());
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readSVarint());
        return arr;
    },
    readPackedBoolean: function(arr) {
        if (this.type !== Pbf.Bytes) return arr.push(this.readBoolean());
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readBoolean());
        return arr;
    },
    readPackedFloat: function(arr) {
        if (this.type !== Pbf.Bytes) return arr.push(this.readFloat());
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readFloat());
        return arr;
    },
    readPackedDouble: function(arr) {
        if (this.type !== Pbf.Bytes) return arr.push(this.readDouble());
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readDouble());
        return arr;
    },
    readPackedFixed32: function(arr) {
        if (this.type !== Pbf.Bytes) return arr.push(this.readFixed32());
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readFixed32());
        return arr;
    },
    readPackedSFixed32: function(arr) {
        if (this.type !== Pbf.Bytes) return arr.push(this.readSFixed32());
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readSFixed32());
        return arr;
    },
    readPackedFixed64: function(arr) {
        if (this.type !== Pbf.Bytes) return arr.push(this.readFixed64());
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readFixed64());
        return arr;
    },
    readPackedSFixed64: function(arr) {
        if (this.type !== Pbf.Bytes) return arr.push(this.readSFixed64());
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readSFixed64());
        return arr;
    },

    skip: function(val) {
        var type = val & 0x7;
        if (type === Pbf.Varint) while (this.buf[this.pos++] > 0x7f) {}
        else if (type === Pbf.Bytes) this.pos = this.readVarint() + this.pos;
        else if (type === Pbf.Fixed32) this.pos += 4;
        else if (type === Pbf.Fixed64) this.pos += 8;
        else throw new Error('Unimplemented type: ' + type);
    },

    // === WRITING =================================================================

    writeTag: function(tag, type) {
        this.writeVarint((tag << 3) | type);
    },

    realloc: function(min) {
        var length = this.length || 16;

        while (length < this.pos + min) length *= 2;

        if (length !== this.length) {
            var buf = new Uint8Array(length);
            buf.set(this.buf);
            this.buf = buf;
            this.length = length;
        }
    },

    finish: function() {
        this.length = this.pos;
        this.pos = 0;
        return this.buf.subarray(0, this.length);
    },

    writeFixed32: function(val) {
        this.realloc(4);
        writeInt32(this.buf, val, this.pos);
        this.pos += 4;
    },

    writeSFixed32: function(val) {
        this.realloc(4);
        writeInt32(this.buf, val, this.pos);
        this.pos += 4;
    },

    writeFixed64: function(val) {
        this.realloc(8);
        writeInt32(this.buf, val & -1, this.pos);
        writeInt32(this.buf, Math.floor(val * SHIFT_RIGHT_32), this.pos + 4);
        this.pos += 8;
    },

    writeSFixed64: function(val) {
        this.realloc(8);
        writeInt32(this.buf, val & -1, this.pos);
        writeInt32(this.buf, Math.floor(val * SHIFT_RIGHT_32), this.pos + 4);
        this.pos += 8;
    },

    writeVarint: function(val) {
        val = +val || 0;

        if (val > 0xfffffff || val < 0) {
            writeBigVarint(val, this);
            return;
        }

        this.realloc(4);

        this.buf[this.pos++] =           val & 0x7f  | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
        this.buf[this.pos++] = ((val >>>= 7) & 0x7f) | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
        this.buf[this.pos++] = ((val >>>= 7) & 0x7f) | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
        this.buf[this.pos++] =   (val >>> 7) & 0x7f;
    },

    writeSVarint: function(val) {
        this.writeVarint(val < 0 ? -val * 2 - 1 : val * 2);
    },

    writeBoolean: function(val) {
        this.writeVarint(Boolean(val));
    },

    writeString: function(str) {
        str = String(str);
        this.realloc(str.length * 4);

        this.pos++; // reserve 1 byte for short string length

        var startPos = this.pos;
        // write the string directly to the buffer and see how much was written
        this.pos = writeUtf8(this.buf, str, this.pos);
        var len = this.pos - startPos;

        if (len >= 0x80) makeRoomForExtraLength(startPos, len, this);

        // finally, write the message length in the reserved place and restore the position
        this.pos = startPos - 1;
        this.writeVarint(len);
        this.pos += len;
    },

    writeFloat: function(val) {
        this.realloc(4);
        ieee754.write(this.buf, val, this.pos, true, 23, 4);
        this.pos += 4;
    },

    writeDouble: function(val) {
        this.realloc(8);
        ieee754.write(this.buf, val, this.pos, true, 52, 8);
        this.pos += 8;
    },

    writeBytes: function(buffer) {
        var len = buffer.length;
        this.writeVarint(len);
        this.realloc(len);
        for (var i = 0; i < len; i++) this.buf[this.pos++] = buffer[i];
    },

    writeRawMessage: function(fn, obj) {
        this.pos++; // reserve 1 byte for short message length

        // write the message directly to the buffer and see how much was written
        var startPos = this.pos;
        fn(obj, this);
        var len = this.pos - startPos;

        if (len >= 0x80) makeRoomForExtraLength(startPos, len, this);

        // finally, write the message length in the reserved place and restore the position
        this.pos = startPos - 1;
        this.writeVarint(len);
        this.pos += len;
    },

    writeMessage: function(tag, fn, obj) {
        this.writeTag(tag, Pbf.Bytes);
        this.writeRawMessage(fn, obj);
    },

    writePackedVarint:   function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedVarint, arr);   },
    writePackedSVarint:  function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedSVarint, arr);  },
    writePackedBoolean:  function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedBoolean, arr);  },
    writePackedFloat:    function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedFloat, arr);    },
    writePackedDouble:   function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedDouble, arr);   },
    writePackedFixed32:  function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedFixed32, arr);  },
    writePackedSFixed32: function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedSFixed32, arr); },
    writePackedFixed64:  function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedFixed64, arr);  },
    writePackedSFixed64: function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedSFixed64, arr); },

    writeBytesField: function(tag, buffer) {
        this.writeTag(tag, Pbf.Bytes);
        this.writeBytes(buffer);
    },
    writeFixed32Field: function(tag, val) {
        this.writeTag(tag, Pbf.Fixed32);
        this.writeFixed32(val);
    },
    writeSFixed32Field: function(tag, val) {
        this.writeTag(tag, Pbf.Fixed32);
        this.writeSFixed32(val);
    },
    writeFixed64Field: function(tag, val) {
        this.writeTag(tag, Pbf.Fixed64);
        this.writeFixed64(val);
    },
    writeSFixed64Field: function(tag, val) {
        this.writeTag(tag, Pbf.Fixed64);
        this.writeSFixed64(val);
    },
    writeVarintField: function(tag, val) {
        this.writeTag(tag, Pbf.Varint);
        this.writeVarint(val);
    },
    writeSVarintField: function(tag, val) {
        this.writeTag(tag, Pbf.Varint);
        this.writeSVarint(val);
    },
    writeStringField: function(tag, str) {
        this.writeTag(tag, Pbf.Bytes);
        this.writeString(str);
    },
    writeFloatField: function(tag, val) {
        this.writeTag(tag, Pbf.Fixed32);
        this.writeFloat(val);
    },
    writeDoubleField: function(tag, val) {
        this.writeTag(tag, Pbf.Fixed64);
        this.writeDouble(val);
    },
    writeBooleanField: function(tag, val) {
        this.writeVarintField(tag, Boolean(val));
    }
};

function readVarintRemainder(l, s, p) {
    var buf = p.buf,
        h, b;

    b = buf[p.pos++]; h  = (b & 0x70) >> 4;  if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 3;  if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 10; if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 17; if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 24; if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x01) << 31; if (b < 0x80) return toNum(l, h, s);

    throw new Error('Expected varint not more than 10 bytes');
}

function readPackedEnd(pbf) {
    return pbf.type === Pbf.Bytes ?
        pbf.readVarint() + pbf.pos : pbf.pos + 1;
}

function toNum(low, high, isSigned) {
    if (isSigned) {
        return high * 0x100000000 + (low >>> 0);
    }

    return ((high >>> 0) * 0x100000000) + (low >>> 0);
}

function writeBigVarint(val, pbf) {
    var low, high;

    if (val >= 0) {
        low  = (val % 0x100000000) | 0;
        high = (val / 0x100000000) | 0;
    } else {
        low  = ~(-val % 0x100000000);
        high = ~(-val / 0x100000000);

        if (low ^ 0xffffffff) {
            low = (low + 1) | 0;
        } else {
            low = 0;
            high = (high + 1) | 0;
        }
    }

    if (val >= 0x10000000000000000 || val < -0x10000000000000000) {
        throw new Error('Given varint doesn\'t fit into 10 bytes');
    }

    pbf.realloc(10);

    writeBigVarintLow(low, high, pbf);
    writeBigVarintHigh(high, pbf);
}

function writeBigVarintLow(low, high, pbf) {
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos]   = low & 0x7f;
}

function writeBigVarintHigh(high, pbf) {
    var lsb = (high & 0x07) << 4;

    pbf.buf[pbf.pos++] |= lsb         | ((high >>>= 3) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f;
}

function makeRoomForExtraLength(startPos, len, pbf) {
    var extraLen =
        len <= 0x3fff ? 1 :
        len <= 0x1fffff ? 2 :
        len <= 0xfffffff ? 3 : Math.floor(Math.log(len) / (Math.LN2 * 7));

    // if 1 byte isn't enough for encoding message length, shift the data to the right
    pbf.realloc(extraLen);
    for (var i = pbf.pos - 1; i >= startPos; i--) pbf.buf[i + extraLen] = pbf.buf[i];
}

function writePackedVarint(arr, pbf)   { for (var i = 0; i < arr.length; i++) pbf.writeVarint(arr[i]);   }
function writePackedSVarint(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeSVarint(arr[i]);  }
function writePackedFloat(arr, pbf)    { for (var i = 0; i < arr.length; i++) pbf.writeFloat(arr[i]);    }
function writePackedDouble(arr, pbf)   { for (var i = 0; i < arr.length; i++) pbf.writeDouble(arr[i]);   }
function writePackedBoolean(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeBoolean(arr[i]);  }
function writePackedFixed32(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeFixed32(arr[i]);  }
function writePackedSFixed32(arr, pbf) { for (var i = 0; i < arr.length; i++) pbf.writeSFixed32(arr[i]); }
function writePackedFixed64(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeFixed64(arr[i]);  }
function writePackedSFixed64(arr, pbf) { for (var i = 0; i < arr.length; i++) pbf.writeSFixed64(arr[i]); }

// Buffer code below from https://github.com/feross/buffer, MIT-licensed

function readUInt32(buf, pos) {
    return ((buf[pos]) |
        (buf[pos + 1] << 8) |
        (buf[pos + 2] << 16)) +
        (buf[pos + 3] * 0x1000000);
}

function writeInt32(buf, val, pos) {
    buf[pos] = val;
    buf[pos + 1] = (val >>> 8);
    buf[pos + 2] = (val >>> 16);
    buf[pos + 3] = (val >>> 24);
}

function readInt32(buf, pos) {
    return ((buf[pos]) |
        (buf[pos + 1] << 8) |
        (buf[pos + 2] << 16)) +
        (buf[pos + 3] << 24);
}

function readUtf8(buf, pos, end) {
    var str = '';
    var i = pos;

    while (i < end) {
        var b0 = buf[i];
        var c = null; // codepoint
        var bytesPerSequence =
            b0 > 0xEF ? 4 :
            b0 > 0xDF ? 3 :
            b0 > 0xBF ? 2 : 1;

        if (i + bytesPerSequence > end) break;

        var b1, b2, b3;

        if (bytesPerSequence === 1) {
            if (b0 < 0x80) {
                c = b0;
            }
        } else if (bytesPerSequence === 2) {
            b1 = buf[i + 1];
            if ((b1 & 0xC0) === 0x80) {
                c = (b0 & 0x1F) << 0x6 | (b1 & 0x3F);
                if (c <= 0x7F) {
                    c = null;
                }
            }
        } else if (bytesPerSequence === 3) {
            b1 = buf[i + 1];
            b2 = buf[i + 2];
            if ((b1 & 0xC0) === 0x80 && (b2 & 0xC0) === 0x80) {
                c = (b0 & 0xF) << 0xC | (b1 & 0x3F) << 0x6 | (b2 & 0x3F);
                if (c <= 0x7FF || (c >= 0xD800 && c <= 0xDFFF)) {
                    c = null;
                }
            }
        } else if (bytesPerSequence === 4) {
            b1 = buf[i + 1];
            b2 = buf[i + 2];
            b3 = buf[i + 3];
            if ((b1 & 0xC0) === 0x80 && (b2 & 0xC0) === 0x80 && (b3 & 0xC0) === 0x80) {
                c = (b0 & 0xF) << 0x12 | (b1 & 0x3F) << 0xC | (b2 & 0x3F) << 0x6 | (b3 & 0x3F);
                if (c <= 0xFFFF || c >= 0x110000) {
                    c = null;
                }
            }
        }

        if (c === null) {
            c = 0xFFFD;
            bytesPerSequence = 1;

        } else if (c > 0xFFFF) {
            c -= 0x10000;
            str += String.fromCharCode(c >>> 10 & 0x3FF | 0xD800);
            c = 0xDC00 | c & 0x3FF;
        }

        str += String.fromCharCode(c);
        i += bytesPerSequence;
    }

    return str;
}

function readUtf8TextDecoder(buf, pos, end) {
    return utf8TextDecoder.decode(buf.subarray(pos, end));
}

function writeUtf8(buf, str, pos) {
    for (var i = 0, c, lead; i < str.length; i++) {
        c = str.charCodeAt(i); // code point

        if (c > 0xD7FF && c < 0xE000) {
            if (lead) {
                if (c < 0xDC00) {
                    buf[pos++] = 0xEF;
                    buf[pos++] = 0xBF;
                    buf[pos++] = 0xBD;
                    lead = c;
                    continue;
                } else {
                    c = lead - 0xD800 << 10 | c - 0xDC00 | 0x10000;
                    lead = null;
                }
            } else {
                if (c > 0xDBFF || (i + 1 === str.length)) {
                    buf[pos++] = 0xEF;
                    buf[pos++] = 0xBF;
                    buf[pos++] = 0xBD;
                } else {
                    lead = c;
                }
                continue;
            }
        } else if (lead) {
            buf[pos++] = 0xEF;
            buf[pos++] = 0xBF;
            buf[pos++] = 0xBD;
            lead = null;
        }

        if (c < 0x80) {
            buf[pos++] = c;
        } else {
            if (c < 0x800) {
                buf[pos++] = c >> 0x6 | 0xC0;
            } else {
                if (c < 0x10000) {
                    buf[pos++] = c >> 0xC | 0xE0;
                } else {
                    buf[pos++] = c >> 0x12 | 0xF0;
                    buf[pos++] = c >> 0xC & 0x3F | 0x80;
                }
                buf[pos++] = c >> 0x6 & 0x3F | 0x80;
            }
            buf[pos++] = c & 0x3F | 0x80;
        }
    }
    return pos;
}

class AlphaImage {
  // See mapbox-gl-js/src/util/image.js
  constructor(size, data) {
    createImage(this, size, 1, data);
  }

  resize(size) {
    resizeImage(this, size, 1);
  }

  clone() {
    return new AlphaImage(
      { width: this.width, height: this.height },
      new Uint8Array(this.data)
    );
  }

  static copy(srcImg, dstImg, srcPt, dstPt, size) {
    copyImage(srcImg, dstImg, srcPt, dstPt, size, 1);
  }
}

function createImage(image, { width, height }, channels, data) {
  if (!data) {
    data = new Uint8Array(width * height * channels);
  } else if (data.length !== width * height * channels) {
    throw new RangeError('mismatched image size');
  }
  return Object.assign(image, { width, height, data });
}

function resizeImage(image, { width, height }, channels) {
  if (width === image.width && height === image.height) return;

  const size = { 
    width: Math.min(image.width, width),
    height: Math.min(image.height, height),
  };

  const newImage = createImage({}, { width, height }, channels);

  copyImage(image, newImage, { x: 0, y: 0 }, { x: 0, y: 0 }, size, channels);

  Object.assign(image, { width, height, data: newImage.data });
}

function copyImage(srcImg, dstImg, srcPt, dstPt, size, channels) {
  if (size.width === 0 || size.height === 0) return dstImg;

  if (outOfRange(srcPt, size, srcImg)) {
    throw new RangeError('out of range source coordinates for image copy');
  }
  if (outOfRange(dstPt, size, dstImg)) {
    throw new RangeError('out of range destination coordinates for image copy');
  }

  const srcData = srcImg.data;
  const dstData = dstImg.data;

  console.assert(
    srcData !== dstData,
    "copyImage: src and dst data are identical!"
  );

  for (let y = 0; y < size.height; y++) {
    const srcOffset = ((srcPt.y + y) * srcImg.width + srcPt.x) * channels;
    const dstOffset = ((dstPt.y + y) * dstImg.width + dstPt.x) * channels;
    for (let i = 0; i < size.width * channels; i++) {
      dstData[dstOffset + i] = srcData[srcOffset + i];
    }
  }

  return dstImg;
}

function outOfRange(point, size, image) {
  let { width, height } = size;
  return (
    width > image.width ||
    height > image.height ||
    point.x > image.width - width ||
    point.y > image.height - height
  );
}

const GLYPH_PBF_BORDER = 3;
const ONE_EM = 24;

function parseGlyphPbf(data) {
  // See mapbox-gl-js/src/style/parse_glyph_pbf.js
  // Input is an ArrayBuffer, which will be read as a Uint8Array
  return new pbf(data).readFields(readFontstacks, []);
}

function readFontstacks(tag, glyphs, pbf) {
  if (tag === 1) pbf.readMessage(readFontstack, glyphs);
}

function readFontstack(tag, glyphs, pbf) {
  if (tag !== 3) return;

  const glyph = pbf.readMessage(readGlyph, {});
  const { id, bitmap, width, height, left, top, advance } = glyph;

  const borders = 2 * GLYPH_PBF_BORDER;
  const size = { width: width + borders, height: height + borders };

  glyphs.push({
    id,
    bitmap: new AlphaImage(size, bitmap),
    metrics: { width, height, left, top, advance }
  });
}

function readGlyph(tag, glyph, pbf) {
  if (tag === 1) glyph.id = pbf.readVarint();
  else if (tag === 2) glyph.bitmap = pbf.readBytes();
  else if (tag === 3) glyph.width = pbf.readVarint();
  else if (tag === 4) glyph.height = pbf.readVarint();
  else if (tag === 5) glyph.left = pbf.readSVarint();
  else if (tag === 6) glyph.top = pbf.readSVarint();
  else if (tag === 7) glyph.advance = pbf.readVarint();
}

function initGlyphCache(endpoint) {
  const fonts = {};

  function getBlock(font, range) {
    const first = range * 256;
    const last = first + 255;
    const href = endpoint
      .replace('{fontstack}', font.split(" ").join("%20"))
      .replace('{range}', first + "-" + last);

    return fetch(href)
      .then(getArrayBuffer)
      .then(parseGlyphPbf)
      .then(glyphs => glyphs.reduce((d, g) => (d[g.id] = g, d), {}));
  }

  return function(font, code) {
    // 1. Find the 256-char block containing this code
    if (code > 65535) throw Error('glyph codes > 65535 not supported');
    const range = Math.floor(code / 256);

    // 2. Get the Promise for the retrieval and parsing of the block
    const blocks = fonts[font] || (fonts[font] = {});
    const block = blocks[range] || (blocks[range] = getBlock(font, range));

    // 3. Return a Promise that resolves to the requested glyph
    // NOTE: may be undefined! if the API returns a sparse or empty block
    return block.then(glyphs => glyphs[code]);
  };
}

function getArrayBuffer(response) {
  if (!response.ok) throw Error(response.status + " " + response.statusText);
  return response.arrayBuffer();
}

function potpack(boxes) {

    // calculate total box area and maximum box width
    let area = 0;
    let maxWidth = 0;

    for (const box of boxes) {
        area += box.w * box.h;
        maxWidth = Math.max(maxWidth, box.w);
    }

    // sort the boxes for insertion by height, descending
    boxes.sort((a, b) => b.h - a.h);

    // aim for a squarish resulting container,
    // slightly adjusted for sub-100% space utilization
    const startWidth = Math.max(Math.ceil(Math.sqrt(area / 0.95)), maxWidth);

    // start with a single empty space, unbounded at the bottom
    const spaces = [{x: 0, y: 0, w: startWidth, h: Infinity}];

    let width = 0;
    let height = 0;

    for (const box of boxes) {
        // look through spaces backwards so that we check smaller spaces first
        for (let i = spaces.length - 1; i >= 0; i--) {
            const space = spaces[i];

            // look for empty spaces that can accommodate the current box
            if (box.w > space.w || box.h > space.h) continue;

            // found the space; add the box to its top-left corner
            // |-------|-------|
            // |  box  |       |
            // |_______|       |
            // |         space |
            // |_______________|
            box.x = space.x;
            box.y = space.y;

            height = Math.max(height, box.y + box.h);
            width = Math.max(width, box.x + box.w);

            if (box.w === space.w && box.h === space.h) {
                // space matches the box exactly; remove it
                const last = spaces.pop();
                if (i < spaces.length) spaces[i] = last;

            } else if (box.h === space.h) {
                // space matches the box height; update it accordingly
                // |-------|---------------|
                // |  box  | updated space |
                // |_______|_______________|
                space.x += box.w;
                space.w -= box.w;

            } else if (box.w === space.w) {
                // space matches the box width; update it accordingly
                // |---------------|
                // |      box      |
                // |_______________|
                // | updated space |
                // |_______________|
                space.y += box.h;
                space.h -= box.h;

            } else {
                // otherwise the box splits the space into two spaces
                // |-------|-----------|
                // |  box  | new space |
                // |_______|___________|
                // | updated space     |
                // |___________________|
                spaces.push({
                    x: space.x + box.w,
                    y: space.y,
                    w: space.w - box.w,
                    h: box.h
                });
                space.y += box.h;
                space.h -= box.h;
            }
            break;
        }
    }

    return {
        w: width, // container width
        h: height, // container height
        fill: (area / (width * height)) || 0 // space utilization
    };
}

const ATLAS_PADDING = 1;

function buildAtlas(fonts) {
  // See mapbox-gl-js/src/render/glyph_atlas.js

  // Construct position objects (metrics and rects) for each glyph
  const positions = Object.entries(fonts)
    .reduce((pos, [font, glyphs]) => {
      pos[font] = getPositions(glyphs);
      return pos;
    }, {});

  // Figure out how to pack all the bitmaps into one image
  // NOTE: modifies the rects in the positions object, in place!
  const rects = Object.values(positions)
    .flatMap(fontPos => Object.values(fontPos))
    .map(p => p.rect);
  const { w, h } = potpack(rects);

  // Using the updated rects, copy all the bitmaps into one image
  const image = new AlphaImage({ width: w || 1, height: h || 1 });
  Object.entries(fonts).forEach(([font, glyphs]) => {
    let fontPos = positions[font];
    glyphs.forEach(glyph => copyGlyphBitmap(glyph, fontPos, image));
  });

  return { image, positions };
}

function getPositions(glyphs) {
  return glyphs.reduce((dict, glyph) => {
    let pos = getPosition(glyph);
    if (pos) dict[glyph.id] = pos;
    return dict;
  }, {});
}

function getPosition(glyph) {
  let { bitmap: { width, height }, metrics } = glyph;
  if (width === 0 || height === 0) return;

  // Construct a preliminary rect, positioned at the origin for now
  let w = width + 2 * ATLAS_PADDING;
  let h = height + 2 * ATLAS_PADDING;
  let rect = { x: 0, y: 0, w, h };

  return { metrics, rect };
}

function copyGlyphBitmap(glyph, positions, image) {
  let { id, bitmap, metrics } = glyph;
  let position = positions[id];
  if (!position) return;

  let srcPt = { x: 0, y: 0 };
  let { x, y } = position.rect;
  let dstPt = { x: x + ATLAS_PADDING, y: y + ATLAS_PADDING };
  AlphaImage.copy(bitmap, image, srcPt, dstPt, bitmap);
}

function initGetter(urlTemplate, key) {
  // Check if url is valid
  const urlOK = (
    (typeof urlTemplate === "string" || urlTemplate instanceof String) &&
    urlTemplate.slice(0, 4) === "http"
  );
  if (!urlOK) return console.log("sdf-manager: no valid glyphs URL!");

  // Put in the API key, if supplied
  const endpoint = (key)
    ? urlTemplate.replace('{key}', key)
    : urlTemplate;

  const getGlyph = initGlyphCache(endpoint);

  return function(fontCodes) {
    // fontCodes = { font1: [code1, code2...], font2: ... }
    const fontGlyphs = {};

    const promises = Object.entries(fontCodes).map(([font, codes]) => {
      let requests = Array.from(codes, code => getGlyph(font, code));

      return Promise.all(requests).then(glyphs => {
        fontGlyphs[font] = glyphs.filter(g => g !== undefined);
      });
    });

    return Promise.all(promises).then(() => {
      return buildAtlas(fontGlyphs);
    });
  };
}

function initGlyphs(glyphEndpoint) {
  const getAtlas = initGetter(glyphEndpoint);

  return function(layers, zoom) {
    const fonts = Object.values(layers).reduce(collectCharCodes, {});

    return getAtlas(fonts);
  };
}

function collectCharCodes(fonts, features) {
  const textFeatures = features.filter(f => f.charCodes && f.charCodes.length);
  textFeatures.forEach(f => {
    let font = fonts[f.font] || (fonts[f.font] = new Set());
    f.charCodes.forEach(font.add, font);
  });
  return fonts;
}

function getGlyphInfo(feature, atlas) {
  const { font, charCodes } = feature;
  const positions = atlas.positions[font];

  if (!positions || !charCodes || !charCodes.length) return;

  const info = feature.charCodes.map(code => {
    let pos = positions[code];
    if (!pos) return;
    let { metrics, rect } = pos;
    return { code, metrics, rect };
  });

  return info.filter(i => i !== undefined);
}

const whitespace = {
  // From mapbox-gl-js/src/symbol/shaping.js
  [0x09]: true, // tab
  [0x0a]: true, // newline
  [0x0b]: true, // vertical tab
  [0x0c]: true, // form feed
  [0x0d]: true, // carriage return
  [0x20]: true, // space
};

const breakable = {
  // From mapbox-gl-js/src/symbol/shaping.js
  [0x0a]:   true, // newline
  [0x20]:   true, // space
  [0x26]:   true, // ampersand
  [0x28]:   true, // left parenthesis
  [0x29]:   true, // right parenthesis
  [0x2b]:   true, // plus sign
  [0x2d]:   true, // hyphen-minus
  [0x2f]:   true, // solidus
  [0xad]:   true, // soft hyphen
  [0xb7]:   true, // middle dot
  [0x200b]: true, // zero-width space
  [0x2010]: true, // hyphen
  [0x2013]: true, // en dash
  [0x2027]: true  // interpunct
};

function getTextBoxShift(anchor) {
  // Shift the top-left corner of the text bounding box
  // by the returned value * bounding box dimensions
  switch (anchor) {
    case "top-left":
      return [ 0.0,  0.0];
    case "top-right":
      return [-1.0,  0.0];
    case "top":
      return [-0.5,  0.0];
    case "bottom-left":
      return [ 0.0, -1.0];
    case "bottom-right":
      return [-1.0, -1.0];
    case "bottom":
      return [-0.5, -1.0];
    case "left":
      return [ 0.0, -0.5];
    case "right":
      return [-1.0, -0.5];
    case "center":
    default:
      return [-0.5, -0.5];
  }
}

function getLineShift(justify, boxShiftX) {
  // Shift the start of the text line (left side) by the
  // returned value * (boundingBoxWidth - lineWidth)
  switch (justify) {
    case "auto":
      return -boxShiftX;
    case "left":
      return 0;
    case "right":
      return 1;
    case "center":
    default:
      return 0.5;
  }
}

function getBreakPoints(glyphs, spacing, targetWidth) {
  const potentialLineBreaks = [];
  const last = glyphs.length - 1;
  let cursor = 0;

  glyphs.forEach((g, i) => {
    let { code, metrics: { advance } } = g;
    if (!whitespace[code]) cursor += advance + spacing;

    if (i == last) return;
    if (!breakable[code] 
      //&& !charAllowsIdeographicBreaking(code)
    ) return;

    let breakInfo = evaluateBreak(
      i + 1,
      cursor,
      targetWidth,
      potentialLineBreaks,
      calculatePenalty(code, glyphs[i + 1].code),
      false
    );
    potentialLineBreaks.push(breakInfo);
  });

  const lastBreak = evaluateBreak(
    glyphs.length,
    cursor,
    targetWidth,
    potentialLineBreaks,
    0,
    true
  );

  return leastBadBreaks(lastBreak);
}

function leastBadBreaks(lastBreak) {
  if (!lastBreak) return [];
  return leastBadBreaks(lastBreak.priorBreak).concat(lastBreak.index);
}

function evaluateBreak(index, x, targetWidth, breaks, penalty, isLastBreak) {
  // Start by assuming the supplied (index, x) is the first break
  const init = {
    index, x,
    priorBreak: null,
    badness: calculateBadness(x)
  };

  // Now consider all previous possible break points, and
  // return the pair corresponding to the best combination of breaks
  return breaks.reduce((best, prev) => {
    const badness = calculateBadness(x - prev.x) + prev.badness;
    if (badness < best.badness) {
      best.priorBreak = prev;
      best.badness = badness;
    }
    return best;
  }, init);

  function calculateBadness(width) {
    const raggedness = (width - targetWidth) ** 2;

    if (!isLastBreak) return raggedness + Math.abs(penalty) * penalty;

    // Last line: prefer shorter than average
    return (width < targetWidth)
      ? raggedness / 2
      : raggedness * 2;
  }
}

function calculatePenalty(code, nextCode) {
  let penalty = 0;
  // Force break on newline
  if (code === 0x0a) penalty -= 10000;
  // Penalize open parenthesis at end of line
  if (code === 0x28 || code === 0xff08) penalty += 50;
  // Penalize close parenthesis at beginning of line
  if (nextCode === 0x29 || nextCode === 0xff09) penalty += 50;

  return penalty;
}

function splitLines(glyphs, spacing, maxWidth) {
  // glyphs is an Array of Objects with properties { code, metrics, rect }
  // spacing and maxWidth should already be scaled to the same units as
  //   glyph.metrics.advance
  const totalWidth = measureLine(glyphs, spacing);

  const lineCount = Math.ceil(totalWidth / maxWidth);
  if (lineCount < 1) return [];
  
  const targetWidth = totalWidth / lineCount;
  const breakPoints = getBreakPoints(glyphs, spacing, targetWidth);

  return breakLines(glyphs, breakPoints);
}

function measureLine(glyphs, spacing) {
  if (glyphs.length < 1) return 0;

  // No initial value for reduce--so no spacing added for 1st char
  return glyphs.map(g => g.metrics.advance)
    .reduce((a, c) => a + c + spacing);
}

function breakLines(glyphs, breakPoints) {
  let start = 0;

  return breakPoints.map(lineBreak => {
    let line = glyphs.slice(start, lineBreak);

    // Trim whitespace from both ends
    while (line.length && whitespace[line[0].code]) line.shift();
    while (trailingWhiteSpace(line)) line.pop();

    start = lineBreak;
    return line;
  });
}

function trailingWhiteSpace(line) {
  let len = line.length;
  if (!len) return false;
  return whitespace[line[len - 1].code];
}

const RECT_BUFFER = GLYPH_PBF_BORDER + ATLAS_PADDING;

function initShaping(style) {
  const layout = style.layout;

  return function(feature, zoom, atlas) {
    // For each feature, compute a list of info for each character:
    // - x0, y0  defining overall label position
    // - dx, dy  delta positions relative to label position
    // - x, y, w, h  defining the position of the glyph within the atlas

    // 1. Get the glyphs for the characters
    const glyphs = getGlyphInfo(feature, atlas);
    if (!glyphs) return;

    // 2. Split into lines
    const spacing = layout["text-letter-spacing"](zoom, feature) * ONE_EM;
    const maxWidth = layout["text-max-width"](zoom, feature) * ONE_EM;
    const lines = splitLines(glyphs, spacing, maxWidth);
    // TODO: What if no labelText, or it is all whitespace?

    // 3. Get dimensions of lines and overall text box
    const lineWidths = lines.map(line => measureLine(line, spacing));
    const lineHeight = layout["text-line-height"](zoom, feature) * ONE_EM;

    const boxSize = [Math.max(...lineWidths), lines.length * lineHeight];
    const textOffset = layout["text-offset"](zoom, feature)
      .map(c => c * ONE_EM);
    const boxShift = getTextBoxShift( layout["text-anchor"](zoom, feature) );
    const boxOrigin = boxShift.map((c, i) => c * boxSize[i] + textOffset[i]);

    // 4. Compute origins for each line
    const justify = layout["text-justify"](zoom, feature);
    const lineShiftX = getLineShift(justify, boxShift[0]);
    const lineOrigins = lineWidths.map((lineWidth, i) => {
      let x = (boxSize[0] - lineWidth) * lineShiftX + boxOrigin[0];
      let y = i * lineHeight + boxOrigin[1];
      return [x, y];
    });

    // 5. Compute top left corners of the glyphs in each line
    const deltas = lines
      .flatMap((l, i) => layoutLine(l, lineOrigins[i], spacing));

    // 6. Fill in label origins for each glyph. TODO: assumes Point geometry
    const origin = feature.geometry.coordinates.slice();
    const origins = lines.flat()
      .flatMap(g => origin);

    // 7. Collect all the glyph rects
    const rects = lines.flat()
      .flatMap(g => Object.values(g.rect));

    // 8. Compute bounding box for collision checks
    const scalar = layout["text-size"](zoom, feature) / ONE_EM;
    const textPadding = layout["text-padding"](zoom, feature);
    const bbox = [
      boxOrigin[0] * scalar - textPadding,
      boxOrigin[1] * scalar - textPadding,
      (boxOrigin[0] + boxSize[0]) * scalar + textPadding,
      (boxOrigin[1] + boxSize[1]) * scalar + textPadding
    ];

    const buffers = { origins, deltas, rects, bbox };

    return { properties: feature.properties, buffers };
  }
}

function layoutLine(glyphs, origin, spacing) {
  var xCursor = origin[0];
  const y0 = origin[1];

  return glyphs.flatMap(g => {
    let { left, top, advance } = g.metrics;

    let dx = xCursor + left - RECT_BUFFER;
    let dy = y0 - top - RECT_BUFFER;

    xCursor += advance + spacing;

    return [dx, dy];
  });
}

function quickselect(arr, k, left, right, compare) {
    quickselectStep(arr, k, left || 0, right || (arr.length - 1), compare || defaultCompare);
}

function quickselectStep(arr, k, left, right, compare) {

    while (right > left) {
        if (right - left > 600) {
            var n = right - left + 1;
            var m = k - left + 1;
            var z = Math.log(n);
            var s = 0.5 * Math.exp(2 * z / 3);
            var sd = 0.5 * Math.sqrt(z * s * (n - s) / n) * (m - n / 2 < 0 ? -1 : 1);
            var newLeft = Math.max(left, Math.floor(k - m * s / n + sd));
            var newRight = Math.min(right, Math.floor(k + (n - m) * s / n + sd));
            quickselectStep(arr, k, newLeft, newRight, compare);
        }

        var t = arr[k];
        var i = left;
        var j = right;

        swap(arr, left, k);
        if (compare(arr[right], t) > 0) swap(arr, left, right);

        while (i < j) {
            swap(arr, i, j);
            i++;
            j--;
            while (compare(arr[i], t) < 0) i++;
            while (compare(arr[j], t) > 0) j--;
        }

        if (compare(arr[left], t) === 0) swap(arr, left, j);
        else {
            j++;
            swap(arr, j, right);
        }

        if (j <= k) left = j + 1;
        if (k <= j) right = j - 1;
    }
}

function swap(arr, i, j) {
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
}

function defaultCompare(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}

class RBush {
    constructor(maxEntries = 9) {
        // max entries in a node is 9 by default; min node fill is 40% for best performance
        this._maxEntries = Math.max(4, maxEntries);
        this._minEntries = Math.max(2, Math.ceil(this._maxEntries * 0.4));
        this.clear();
    }

    all() {
        return this._all(this.data, []);
    }

    search(bbox) {
        let node = this.data;
        const result = [];

        if (!intersects(bbox, node)) return result;

        const toBBox = this.toBBox;
        const nodesToSearch = [];

        while (node) {
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                const childBBox = node.leaf ? toBBox(child) : child;

                if (intersects(bbox, childBBox)) {
                    if (node.leaf) result.push(child);
                    else if (contains(bbox, childBBox)) this._all(child, result);
                    else nodesToSearch.push(child);
                }
            }
            node = nodesToSearch.pop();
        }

        return result;
    }

    collides(bbox) {
        let node = this.data;

        if (!intersects(bbox, node)) return false;

        const nodesToSearch = [];
        while (node) {
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                const childBBox = node.leaf ? this.toBBox(child) : child;

                if (intersects(bbox, childBBox)) {
                    if (node.leaf || contains(bbox, childBBox)) return true;
                    nodesToSearch.push(child);
                }
            }
            node = nodesToSearch.pop();
        }

        return false;
    }

    load(data) {
        if (!(data && data.length)) return this;

        if (data.length < this._minEntries) {
            for (let i = 0; i < data.length; i++) {
                this.insert(data[i]);
            }
            return this;
        }

        // recursively build the tree with the given data from scratch using OMT algorithm
        let node = this._build(data.slice(), 0, data.length - 1, 0);

        if (!this.data.children.length) {
            // save as is if tree is empty
            this.data = node;

        } else if (this.data.height === node.height) {
            // split root if trees have the same height
            this._splitRoot(this.data, node);

        } else {
            if (this.data.height < node.height) {
                // swap trees if inserted one is bigger
                const tmpNode = this.data;
                this.data = node;
                node = tmpNode;
            }

            // insert the small tree into the large tree at appropriate level
            this._insert(node, this.data.height - node.height - 1, true);
        }

        return this;
    }

    insert(item) {
        if (item) this._insert(item, this.data.height - 1);
        return this;
    }

    clear() {
        this.data = createNode([]);
        return this;
    }

    remove(item, equalsFn) {
        if (!item) return this;

        let node = this.data;
        const bbox = this.toBBox(item);
        const path = [];
        const indexes = [];
        let i, parent, goingUp;

        // depth-first iterative tree traversal
        while (node || path.length) {

            if (!node) { // go up
                node = path.pop();
                parent = path[path.length - 1];
                i = indexes.pop();
                goingUp = true;
            }

            if (node.leaf) { // check current node
                const index = findItem(item, node.children, equalsFn);

                if (index !== -1) {
                    // item found, remove the item and condense tree upwards
                    node.children.splice(index, 1);
                    path.push(node);
                    this._condense(path);
                    return this;
                }
            }

            if (!goingUp && !node.leaf && contains(node, bbox)) { // go down
                path.push(node);
                indexes.push(i);
                i = 0;
                parent = node;
                node = node.children[0];

            } else if (parent) { // go right
                i++;
                node = parent.children[i];
                goingUp = false;

            } else node = null; // nothing found
        }

        return this;
    }

    toBBox(item) { return item; }

    compareMinX(a, b) { return a.minX - b.minX; }
    compareMinY(a, b) { return a.minY - b.minY; }

    toJSON() { return this.data; }

    fromJSON(data) {
        this.data = data;
        return this;
    }

    _all(node, result) {
        const nodesToSearch = [];
        while (node) {
            if (node.leaf) result.push(...node.children);
            else nodesToSearch.push(...node.children);

            node = nodesToSearch.pop();
        }
        return result;
    }

    _build(items, left, right, height) {

        const N = right - left + 1;
        let M = this._maxEntries;
        let node;

        if (N <= M) {
            // reached leaf level; return leaf
            node = createNode(items.slice(left, right + 1));
            calcBBox(node, this.toBBox);
            return node;
        }

        if (!height) {
            // target height of the bulk-loaded tree
            height = Math.ceil(Math.log(N) / Math.log(M));

            // target number of root entries to maximize storage utilization
            M = Math.ceil(N / Math.pow(M, height - 1));
        }

        node = createNode([]);
        node.leaf = false;
        node.height = height;

        // split the items into M mostly square tiles

        const N2 = Math.ceil(N / M);
        const N1 = N2 * Math.ceil(Math.sqrt(M));

        multiSelect(items, left, right, N1, this.compareMinX);

        for (let i = left; i <= right; i += N1) {

            const right2 = Math.min(i + N1 - 1, right);

            multiSelect(items, i, right2, N2, this.compareMinY);

            for (let j = i; j <= right2; j += N2) {

                const right3 = Math.min(j + N2 - 1, right2);

                // pack each entry recursively
                node.children.push(this._build(items, j, right3, height - 1));
            }
        }

        calcBBox(node, this.toBBox);

        return node;
    }

    _chooseSubtree(bbox, node, level, path) {
        while (true) {
            path.push(node);

            if (node.leaf || path.length - 1 === level) break;

            let minArea = Infinity;
            let minEnlargement = Infinity;
            let targetNode;

            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                const area = bboxArea(child);
                const enlargement = enlargedArea(bbox, child) - area;

                // choose entry with the least area enlargement
                if (enlargement < minEnlargement) {
                    minEnlargement = enlargement;
                    minArea = area < minArea ? area : minArea;
                    targetNode = child;

                } else if (enlargement === minEnlargement) {
                    // otherwise choose one with the smallest area
                    if (area < minArea) {
                        minArea = area;
                        targetNode = child;
                    }
                }
            }

            node = targetNode || node.children[0];
        }

        return node;
    }

    _insert(item, level, isNode) {
        const bbox = isNode ? item : this.toBBox(item);
        const insertPath = [];

        // find the best node for accommodating the item, saving all nodes along the path too
        const node = this._chooseSubtree(bbox, this.data, level, insertPath);

        // put the item into the node
        node.children.push(item);
        extend(node, bbox);

        // split on node overflow; propagate upwards if necessary
        while (level >= 0) {
            if (insertPath[level].children.length > this._maxEntries) {
                this._split(insertPath, level);
                level--;
            } else break;
        }

        // adjust bboxes along the insertion path
        this._adjustParentBBoxes(bbox, insertPath, level);
    }

    // split overflowed node into two
    _split(insertPath, level) {
        const node = insertPath[level];
        const M = node.children.length;
        const m = this._minEntries;

        this._chooseSplitAxis(node, m, M);

        const splitIndex = this._chooseSplitIndex(node, m, M);

        const newNode = createNode(node.children.splice(splitIndex, node.children.length - splitIndex));
        newNode.height = node.height;
        newNode.leaf = node.leaf;

        calcBBox(node, this.toBBox);
        calcBBox(newNode, this.toBBox);

        if (level) insertPath[level - 1].children.push(newNode);
        else this._splitRoot(node, newNode);
    }

    _splitRoot(node, newNode) {
        // split root node
        this.data = createNode([node, newNode]);
        this.data.height = node.height + 1;
        this.data.leaf = false;
        calcBBox(this.data, this.toBBox);
    }

    _chooseSplitIndex(node, m, M) {
        let index;
        let minOverlap = Infinity;
        let minArea = Infinity;

        for (let i = m; i <= M - m; i++) {
            const bbox1 = distBBox(node, 0, i, this.toBBox);
            const bbox2 = distBBox(node, i, M, this.toBBox);

            const overlap = intersectionArea(bbox1, bbox2);
            const area = bboxArea(bbox1) + bboxArea(bbox2);

            // choose distribution with minimum overlap
            if (overlap < minOverlap) {
                minOverlap = overlap;
                index = i;

                minArea = area < minArea ? area : minArea;

            } else if (overlap === minOverlap) {
                // otherwise choose distribution with minimum area
                if (area < minArea) {
                    minArea = area;
                    index = i;
                }
            }
        }

        return index || M - m;
    }

    // sorts node children by the best axis for split
    _chooseSplitAxis(node, m, M) {
        const compareMinX = node.leaf ? this.compareMinX : compareNodeMinX;
        const compareMinY = node.leaf ? this.compareMinY : compareNodeMinY;
        const xMargin = this._allDistMargin(node, m, M, compareMinX);
        const yMargin = this._allDistMargin(node, m, M, compareMinY);

        // if total distributions margin value is minimal for x, sort by minX,
        // otherwise it's already sorted by minY
        if (xMargin < yMargin) node.children.sort(compareMinX);
    }

    // total margin of all possible split distributions where each node is at least m full
    _allDistMargin(node, m, M, compare) {
        node.children.sort(compare);

        const toBBox = this.toBBox;
        const leftBBox = distBBox(node, 0, m, toBBox);
        const rightBBox = distBBox(node, M - m, M, toBBox);
        let margin = bboxMargin(leftBBox) + bboxMargin(rightBBox);

        for (let i = m; i < M - m; i++) {
            const child = node.children[i];
            extend(leftBBox, node.leaf ? toBBox(child) : child);
            margin += bboxMargin(leftBBox);
        }

        for (let i = M - m - 1; i >= m; i--) {
            const child = node.children[i];
            extend(rightBBox, node.leaf ? toBBox(child) : child);
            margin += bboxMargin(rightBBox);
        }

        return margin;
    }

    _adjustParentBBoxes(bbox, path, level) {
        // adjust bboxes along the given tree path
        for (let i = level; i >= 0; i--) {
            extend(path[i], bbox);
        }
    }

    _condense(path) {
        // go through the path, removing empty nodes and updating bboxes
        for (let i = path.length - 1, siblings; i >= 0; i--) {
            if (path[i].children.length === 0) {
                if (i > 0) {
                    siblings = path[i - 1].children;
                    siblings.splice(siblings.indexOf(path[i]), 1);

                } else this.clear();

            } else calcBBox(path[i], this.toBBox);
        }
    }
}

function findItem(item, items, equalsFn) {
    if (!equalsFn) return items.indexOf(item);

    for (let i = 0; i < items.length; i++) {
        if (equalsFn(item, items[i])) return i;
    }
    return -1;
}

// calculate node's bbox from bboxes of its children
function calcBBox(node, toBBox) {
    distBBox(node, 0, node.children.length, toBBox, node);
}

// min bounding rectangle of node children from k to p-1
function distBBox(node, k, p, toBBox, destNode) {
    if (!destNode) destNode = createNode(null);
    destNode.minX = Infinity;
    destNode.minY = Infinity;
    destNode.maxX = -Infinity;
    destNode.maxY = -Infinity;

    for (let i = k; i < p; i++) {
        const child = node.children[i];
        extend(destNode, node.leaf ? toBBox(child) : child);
    }

    return destNode;
}

function extend(a, b) {
    a.minX = Math.min(a.minX, b.minX);
    a.minY = Math.min(a.minY, b.minY);
    a.maxX = Math.max(a.maxX, b.maxX);
    a.maxY = Math.max(a.maxY, b.maxY);
    return a;
}

function compareNodeMinX(a, b) { return a.minX - b.minX; }
function compareNodeMinY(a, b) { return a.minY - b.minY; }

function bboxArea(a)   { return (a.maxX - a.minX) * (a.maxY - a.minY); }
function bboxMargin(a) { return (a.maxX - a.minX) + (a.maxY - a.minY); }

function enlargedArea(a, b) {
    return (Math.max(b.maxX, a.maxX) - Math.min(b.minX, a.minX)) *
           (Math.max(b.maxY, a.maxY) - Math.min(b.minY, a.minY));
}

function intersectionArea(a, b) {
    const minX = Math.max(a.minX, b.minX);
    const minY = Math.max(a.minY, b.minY);
    const maxX = Math.min(a.maxX, b.maxX);
    const maxY = Math.min(a.maxY, b.maxY);

    return Math.max(0, maxX - minX) *
           Math.max(0, maxY - minY);
}

function contains(a, b) {
    return a.minX <= b.minX &&
           a.minY <= b.minY &&
           b.maxX <= a.maxX &&
           b.maxY <= a.maxY;
}

function intersects(a, b) {
    return b.minX <= a.maxX &&
           b.minY <= a.maxY &&
           b.maxX >= a.minX &&
           b.maxY >= a.minY;
}

function createNode(children) {
    return {
        children,
        height: 1,
        leaf: true,
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
    };
}

// sort an array so that items come in groups of n unsorted items, with groups sorted between each other;
// combines selection algorithm with binary divide & conquer approach

function multiSelect(arr, left, right, n, compare) {
    const stack = [left, right];

    while (stack.length) {
        right = stack.pop();
        left = stack.pop();

        if (right - left <= n) continue;

        const mid = left + Math.ceil((right - left) / n / 2) * n;
        quickselect(arr, mid, left, right, compare);

        stack.push(left, mid, mid, right);
    }
}

function initSymbols({ parsedStyles, glyphEndpoint }) {
  const getText = initText(parsedStyles);
  const getGlyphs = initGlyphs(glyphEndpoint);
  const shapeText = initShapers(parsedStyles);

  return function(layers, zoom) {
    const textLayers = getText(layers, zoom);

    return getGlyphs(textLayers)
      .then(atlas => shapeText(textLayers, zoom, atlas));
  };
}

function initShapers(styles) {
  const shapers = styles
    .filter(s => s.type === "symbol")
    .reduce((d, s) => (d[s.id] = initShaping(s), d), {});

  return function(textLayers, zoom, atlas) {
    const shaped = Object.entries(textLayers).reduce((d, [id, features]) => {
      d[id] = features.map(f => shapers[id](f, zoom, atlas))
        .filter(f => f !== undefined);
      return d;
    }, {});

    const tree = new RBush();
    Object.entries(shaped).reverse().forEach(([id, features]) => {
      shaped[id] = features.filter(f => collide(f, tree));
    });

    return { atlas: atlas.image, layers: shaped };
  };
}

function collide(feature, tree) {
  // NOTE: tree will be modified!!

  let { origins, bbox } = feature.buffers;
  let [ x0, y0 ] = origins;
  let box = {
    minX: x0 + bbox[0],
    minY: y0 + bbox[1],
    maxX: x0 + bbox[2],
    maxY: y0 + bbox[3],
  };

  if (tree.collides(box)) return false;

  tree.insert(box);
  return true; // TODO: drop feature if outside tile?
}

function initFeatureGrouper(style) {
  // Find the names of the feature properties that affect rendering
  const renderPropertyNames = Object.values(style.paint)
    .filter(styleFunc => styleFunc.type === "property")
    .map(styleFunc => styleFunc.property);

  return function(features) {
    // Group features that will be styled the same
    const groups = {};
    features.forEach(feature => {
      // Keep only the properties relevant to rendering
      let properties = renderPropertyNames
        .reduce((d, k) => (d[k] = feature.properties[k], d), {});

      // Look up the appropriate group, or create it if it doesn't exist
      let key = Object.entries(properties).join();
      if (!groups[key]) groups[key] = initFeature(feature, properties);

      // Append this features buffers to the grouped feature
      appendBuffers(groups[key].buffers, feature.buffers);
    });

    return Object.values(groups).map(makeTypedArrays);
  };
}

function initFeature(template, renderProperties) {
  const properties = Object.assign({}, renderProperties);
  const buffers = Object.keys(template.buffers)
    .reduce((d, k) => (d[k] = [], d), {});

  return { properties, buffers };
}

function appendBuffers(buffers, newBuffers) {
  const appendix = Object.assign({}, newBuffers);
  if (buffers.indices) {
    let indexShift = buffers.vertices.length / 2;
    appendix.indices = newBuffers.indices.map(i => i + indexShift);
  }
  Object.keys(buffers).forEach(k => {
    // NOTE: The 'obvious' buffers[k].push(...appendix[k]) fails with
    //  the error "Maximum call stack size exceeded"
    let base = buffers[k];
    appendix[k].forEach(a => base.push(a));
  });
}

function makeTypedArrays(feature) {
  const { properties, buffers } = feature;
  // Note: modifying in place!
  Object.keys(buffers).forEach(key => {
    buffers[key] = (key === "indices")
      ? new Uint16Array(buffers[key])
      : new Float32Array(buffers[key]);
  });
  return feature;
}

function initSourceProcessor({ styles, glyphEndpoint }) {
  const parsedStyles = styles.map(getStyleFuncs);

  const sourceFilter = initSourceFilter(parsedStyles);
  const process = initProcessor(parsedStyles);
  const processSymbols = initSymbols({ parsedStyles, glyphEndpoint });
  const compressors = parsedStyles
    .reduce((d, s) => (d[s.id] = initFeatureGrouper(s), d), {});

  return function(source, zoom) {
    const rawLayers = sourceFilter(source, zoom);

    const mainTask = process(rawLayers);
    const symbolTask = processSymbols(rawLayers, zoom);

    return Promise.all([mainTask, symbolTask]).then(([layers, symbols]) => {
      // Merge symbol layers into layers dictionary
      Object.assign(layers, symbols.layers);
      // Compress features
      Object.entries(layers).forEach(([id, features]) => {
        layers[id] = compressors[id](features);
      });
      // TODO: what if there is no atlas?
      // Note: atlas.data.buffer is a Transferable
      return { atlas: symbols.atlas, layers };
    });
  };
}

function initProcessor(styles) {
  const transforms = styles.reduce((dict, style) => {
    let { id, type } = style;

    dict[id] =
      (type === "circle") ? parseCircle
      : (type === "line") ? parseLine
      : (type === "fill") ? parseFill
      : null;

    return dict;
  }, {});

  return function(layers) {
    const data = Object.entries(layers).reduce((d, [id, features]) => {
      let transform = transforms[id];
      if (transform) d[id] = features.map(transform);
      return d;
    }, {});

    return Promise.resolve(data);
  }
}

var read$1 = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m;
  var eLen = (nBytes * 8) - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var nBits = -7;
  var i = isLE ? (nBytes - 1) : 0;
  var d = isLE ? -1 : 1;
  var s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
};

var write$1 = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c;
  var eLen = (nBytes * 8) - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0);
  var i = isLE ? 0 : (nBytes - 1);
  var d = isLE ? 1 : -1;
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = ((value * c) - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128;
};

var ieee754$1 = {
	read: read$1,
	write: write$1
};

var pbf$1 = Pbf$1;



function Pbf$1(buf) {
    this.buf = ArrayBuffer.isView && ArrayBuffer.isView(buf) ? buf : new Uint8Array(buf || 0);
    this.pos = 0;
    this.type = 0;
    this.length = this.buf.length;
}

Pbf$1.Varint  = 0; // varint: int32, int64, uint32, uint64, sint32, sint64, bool, enum
Pbf$1.Fixed64 = 1; // 64-bit: double, fixed64, sfixed64
Pbf$1.Bytes   = 2; // length-delimited: string, bytes, embedded messages, packed repeated fields
Pbf$1.Fixed32 = 5; // 32-bit: float, fixed32, sfixed32

var SHIFT_LEFT_32$1 = (1 << 16) * (1 << 16),
    SHIFT_RIGHT_32$1 = 1 / SHIFT_LEFT_32$1;

// Threshold chosen based on both benchmarking and knowledge about browser string
// data structures (which currently switch structure types at 12 bytes or more)
var TEXT_DECODER_MIN_LENGTH$1 = 12;
var utf8TextDecoder$1 = typeof TextDecoder === 'undefined' ? null : new TextDecoder('utf8');

Pbf$1.prototype = {

    destroy: function() {
        this.buf = null;
    },

    // === READING =================================================================

    readFields: function(readField, result, end) {
        end = end || this.length;

        while (this.pos < end) {
            var val = this.readVarint(),
                tag = val >> 3,
                startPos = this.pos;

            this.type = val & 0x7;
            readField(tag, result, this);

            if (this.pos === startPos) this.skip(val);
        }
        return result;
    },

    readMessage: function(readField, result) {
        return this.readFields(readField, result, this.readVarint() + this.pos);
    },

    readFixed32: function() {
        var val = readUInt32$1(this.buf, this.pos);
        this.pos += 4;
        return val;
    },

    readSFixed32: function() {
        var val = readInt32$1(this.buf, this.pos);
        this.pos += 4;
        return val;
    },

    // 64-bit int handling is based on github.com/dpw/node-buffer-more-ints (MIT-licensed)

    readFixed64: function() {
        var val = readUInt32$1(this.buf, this.pos) + readUInt32$1(this.buf, this.pos + 4) * SHIFT_LEFT_32$1;
        this.pos += 8;
        return val;
    },

    readSFixed64: function() {
        var val = readUInt32$1(this.buf, this.pos) + readInt32$1(this.buf, this.pos + 4) * SHIFT_LEFT_32$1;
        this.pos += 8;
        return val;
    },

    readFloat: function() {
        var val = ieee754$1.read(this.buf, this.pos, true, 23, 4);
        this.pos += 4;
        return val;
    },

    readDouble: function() {
        var val = ieee754$1.read(this.buf, this.pos, true, 52, 8);
        this.pos += 8;
        return val;
    },

    readVarint: function(isSigned) {
        var buf = this.buf,
            val, b;

        b = buf[this.pos++]; val  =  b & 0x7f;        if (b < 0x80) return val;
        b = buf[this.pos++]; val |= (b & 0x7f) << 7;  if (b < 0x80) return val;
        b = buf[this.pos++]; val |= (b & 0x7f) << 14; if (b < 0x80) return val;
        b = buf[this.pos++]; val |= (b & 0x7f) << 21; if (b < 0x80) return val;
        b = buf[this.pos];   val |= (b & 0x0f) << 28;

        return readVarintRemainder$1(val, isSigned, this);
    },

    readVarint64: function() { // for compatibility with v2.0.1
        return this.readVarint(true);
    },

    readSVarint: function() {
        var num = this.readVarint();
        return num % 2 === 1 ? (num + 1) / -2 : num / 2; // zigzag encoding
    },

    readBoolean: function() {
        return Boolean(this.readVarint());
    },

    readString: function() {
        var end = this.readVarint() + this.pos;
        var pos = this.pos;
        this.pos = end;

        if (end - pos >= TEXT_DECODER_MIN_LENGTH$1 && utf8TextDecoder$1) {
            // longer strings are fast with the built-in browser TextDecoder API
            return readUtf8TextDecoder$1(this.buf, pos, end);
        }
        // short strings are fast with our custom implementation
        return readUtf8$1(this.buf, pos, end);
    },

    readBytes: function() {
        var end = this.readVarint() + this.pos,
            buffer = this.buf.subarray(this.pos, end);
        this.pos = end;
        return buffer;
    },

    // verbose for performance reasons; doesn't affect gzipped size

    readPackedVarint: function(arr, isSigned) {
        if (this.type !== Pbf$1.Bytes) return arr.push(this.readVarint(isSigned));
        var end = readPackedEnd$1(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readVarint(isSigned));
        return arr;
    },
    readPackedSVarint: function(arr) {
        if (this.type !== Pbf$1.Bytes) return arr.push(this.readSVarint());
        var end = readPackedEnd$1(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readSVarint());
        return arr;
    },
    readPackedBoolean: function(arr) {
        if (this.type !== Pbf$1.Bytes) return arr.push(this.readBoolean());
        var end = readPackedEnd$1(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readBoolean());
        return arr;
    },
    readPackedFloat: function(arr) {
        if (this.type !== Pbf$1.Bytes) return arr.push(this.readFloat());
        var end = readPackedEnd$1(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readFloat());
        return arr;
    },
    readPackedDouble: function(arr) {
        if (this.type !== Pbf$1.Bytes) return arr.push(this.readDouble());
        var end = readPackedEnd$1(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readDouble());
        return arr;
    },
    readPackedFixed32: function(arr) {
        if (this.type !== Pbf$1.Bytes) return arr.push(this.readFixed32());
        var end = readPackedEnd$1(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readFixed32());
        return arr;
    },
    readPackedSFixed32: function(arr) {
        if (this.type !== Pbf$1.Bytes) return arr.push(this.readSFixed32());
        var end = readPackedEnd$1(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readSFixed32());
        return arr;
    },
    readPackedFixed64: function(arr) {
        if (this.type !== Pbf$1.Bytes) return arr.push(this.readFixed64());
        var end = readPackedEnd$1(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readFixed64());
        return arr;
    },
    readPackedSFixed64: function(arr) {
        if (this.type !== Pbf$1.Bytes) return arr.push(this.readSFixed64());
        var end = readPackedEnd$1(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readSFixed64());
        return arr;
    },

    skip: function(val) {
        var type = val & 0x7;
        if (type === Pbf$1.Varint) while (this.buf[this.pos++] > 0x7f) {}
        else if (type === Pbf$1.Bytes) this.pos = this.readVarint() + this.pos;
        else if (type === Pbf$1.Fixed32) this.pos += 4;
        else if (type === Pbf$1.Fixed64) this.pos += 8;
        else throw new Error('Unimplemented type: ' + type);
    },

    // === WRITING =================================================================

    writeTag: function(tag, type) {
        this.writeVarint((tag << 3) | type);
    },

    realloc: function(min) {
        var length = this.length || 16;

        while (length < this.pos + min) length *= 2;

        if (length !== this.length) {
            var buf = new Uint8Array(length);
            buf.set(this.buf);
            this.buf = buf;
            this.length = length;
        }
    },

    finish: function() {
        this.length = this.pos;
        this.pos = 0;
        return this.buf.subarray(0, this.length);
    },

    writeFixed32: function(val) {
        this.realloc(4);
        writeInt32$1(this.buf, val, this.pos);
        this.pos += 4;
    },

    writeSFixed32: function(val) {
        this.realloc(4);
        writeInt32$1(this.buf, val, this.pos);
        this.pos += 4;
    },

    writeFixed64: function(val) {
        this.realloc(8);
        writeInt32$1(this.buf, val & -1, this.pos);
        writeInt32$1(this.buf, Math.floor(val * SHIFT_RIGHT_32$1), this.pos + 4);
        this.pos += 8;
    },

    writeSFixed64: function(val) {
        this.realloc(8);
        writeInt32$1(this.buf, val & -1, this.pos);
        writeInt32$1(this.buf, Math.floor(val * SHIFT_RIGHT_32$1), this.pos + 4);
        this.pos += 8;
    },

    writeVarint: function(val) {
        val = +val || 0;

        if (val > 0xfffffff || val < 0) {
            writeBigVarint$1(val, this);
            return;
        }

        this.realloc(4);

        this.buf[this.pos++] =           val & 0x7f  | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
        this.buf[this.pos++] = ((val >>>= 7) & 0x7f) | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
        this.buf[this.pos++] = ((val >>>= 7) & 0x7f) | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
        this.buf[this.pos++] =   (val >>> 7) & 0x7f;
    },

    writeSVarint: function(val) {
        this.writeVarint(val < 0 ? -val * 2 - 1 : val * 2);
    },

    writeBoolean: function(val) {
        this.writeVarint(Boolean(val));
    },

    writeString: function(str) {
        str = String(str);
        this.realloc(str.length * 4);

        this.pos++; // reserve 1 byte for short string length

        var startPos = this.pos;
        // write the string directly to the buffer and see how much was written
        this.pos = writeUtf8$1(this.buf, str, this.pos);
        var len = this.pos - startPos;

        if (len >= 0x80) makeRoomForExtraLength$1(startPos, len, this);

        // finally, write the message length in the reserved place and restore the position
        this.pos = startPos - 1;
        this.writeVarint(len);
        this.pos += len;
    },

    writeFloat: function(val) {
        this.realloc(4);
        ieee754$1.write(this.buf, val, this.pos, true, 23, 4);
        this.pos += 4;
    },

    writeDouble: function(val) {
        this.realloc(8);
        ieee754$1.write(this.buf, val, this.pos, true, 52, 8);
        this.pos += 8;
    },

    writeBytes: function(buffer) {
        var len = buffer.length;
        this.writeVarint(len);
        this.realloc(len);
        for (var i = 0; i < len; i++) this.buf[this.pos++] = buffer[i];
    },

    writeRawMessage: function(fn, obj) {
        this.pos++; // reserve 1 byte for short message length

        // write the message directly to the buffer and see how much was written
        var startPos = this.pos;
        fn(obj, this);
        var len = this.pos - startPos;

        if (len >= 0x80) makeRoomForExtraLength$1(startPos, len, this);

        // finally, write the message length in the reserved place and restore the position
        this.pos = startPos - 1;
        this.writeVarint(len);
        this.pos += len;
    },

    writeMessage: function(tag, fn, obj) {
        this.writeTag(tag, Pbf$1.Bytes);
        this.writeRawMessage(fn, obj);
    },

    writePackedVarint:   function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedVarint$1, arr);   },
    writePackedSVarint:  function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedSVarint$1, arr);  },
    writePackedBoolean:  function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedBoolean$1, arr);  },
    writePackedFloat:    function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedFloat$1, arr);    },
    writePackedDouble:   function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedDouble$1, arr);   },
    writePackedFixed32:  function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedFixed32$1, arr);  },
    writePackedSFixed32: function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedSFixed32$1, arr); },
    writePackedFixed64:  function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedFixed64$1, arr);  },
    writePackedSFixed64: function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedSFixed64$1, arr); },

    writeBytesField: function(tag, buffer) {
        this.writeTag(tag, Pbf$1.Bytes);
        this.writeBytes(buffer);
    },
    writeFixed32Field: function(tag, val) {
        this.writeTag(tag, Pbf$1.Fixed32);
        this.writeFixed32(val);
    },
    writeSFixed32Field: function(tag, val) {
        this.writeTag(tag, Pbf$1.Fixed32);
        this.writeSFixed32(val);
    },
    writeFixed64Field: function(tag, val) {
        this.writeTag(tag, Pbf$1.Fixed64);
        this.writeFixed64(val);
    },
    writeSFixed64Field: function(tag, val) {
        this.writeTag(tag, Pbf$1.Fixed64);
        this.writeSFixed64(val);
    },
    writeVarintField: function(tag, val) {
        this.writeTag(tag, Pbf$1.Varint);
        this.writeVarint(val);
    },
    writeSVarintField: function(tag, val) {
        this.writeTag(tag, Pbf$1.Varint);
        this.writeSVarint(val);
    },
    writeStringField: function(tag, str) {
        this.writeTag(tag, Pbf$1.Bytes);
        this.writeString(str);
    },
    writeFloatField: function(tag, val) {
        this.writeTag(tag, Pbf$1.Fixed32);
        this.writeFloat(val);
    },
    writeDoubleField: function(tag, val) {
        this.writeTag(tag, Pbf$1.Fixed64);
        this.writeDouble(val);
    },
    writeBooleanField: function(tag, val) {
        this.writeVarintField(tag, Boolean(val));
    }
};

function readVarintRemainder$1(l, s, p) {
    var buf = p.buf,
        h, b;

    b = buf[p.pos++]; h  = (b & 0x70) >> 4;  if (b < 0x80) return toNum$1(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 3;  if (b < 0x80) return toNum$1(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 10; if (b < 0x80) return toNum$1(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 17; if (b < 0x80) return toNum$1(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 24; if (b < 0x80) return toNum$1(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x01) << 31; if (b < 0x80) return toNum$1(l, h, s);

    throw new Error('Expected varint not more than 10 bytes');
}

function readPackedEnd$1(pbf) {
    return pbf.type === Pbf$1.Bytes ?
        pbf.readVarint() + pbf.pos : pbf.pos + 1;
}

function toNum$1(low, high, isSigned) {
    if (isSigned) {
        return high * 0x100000000 + (low >>> 0);
    }

    return ((high >>> 0) * 0x100000000) + (low >>> 0);
}

function writeBigVarint$1(val, pbf) {
    var low, high;

    if (val >= 0) {
        low  = (val % 0x100000000) | 0;
        high = (val / 0x100000000) | 0;
    } else {
        low  = ~(-val % 0x100000000);
        high = ~(-val / 0x100000000);

        if (low ^ 0xffffffff) {
            low = (low + 1) | 0;
        } else {
            low = 0;
            high = (high + 1) | 0;
        }
    }

    if (val >= 0x10000000000000000 || val < -0x10000000000000000) {
        throw new Error('Given varint doesn\'t fit into 10 bytes');
    }

    pbf.realloc(10);

    writeBigVarintLow$1(low, high, pbf);
    writeBigVarintHigh$1(high, pbf);
}

function writeBigVarintLow$1(low, high, pbf) {
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos]   = low & 0x7f;
}

function writeBigVarintHigh$1(high, pbf) {
    var lsb = (high & 0x07) << 4;

    pbf.buf[pbf.pos++] |= lsb         | ((high >>>= 3) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f;
}

function makeRoomForExtraLength$1(startPos, len, pbf) {
    var extraLen =
        len <= 0x3fff ? 1 :
        len <= 0x1fffff ? 2 :
        len <= 0xfffffff ? 3 : Math.floor(Math.log(len) / (Math.LN2 * 7));

    // if 1 byte isn't enough for encoding message length, shift the data to the right
    pbf.realloc(extraLen);
    for (var i = pbf.pos - 1; i >= startPos; i--) pbf.buf[i + extraLen] = pbf.buf[i];
}

function writePackedVarint$1(arr, pbf)   { for (var i = 0; i < arr.length; i++) pbf.writeVarint(arr[i]);   }
function writePackedSVarint$1(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeSVarint(arr[i]);  }
function writePackedFloat$1(arr, pbf)    { for (var i = 0; i < arr.length; i++) pbf.writeFloat(arr[i]);    }
function writePackedDouble$1(arr, pbf)   { for (var i = 0; i < arr.length; i++) pbf.writeDouble(arr[i]);   }
function writePackedBoolean$1(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeBoolean(arr[i]);  }
function writePackedFixed32$1(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeFixed32(arr[i]);  }
function writePackedSFixed32$1(arr, pbf) { for (var i = 0; i < arr.length; i++) pbf.writeSFixed32(arr[i]); }
function writePackedFixed64$1(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeFixed64(arr[i]);  }
function writePackedSFixed64$1(arr, pbf) { for (var i = 0; i < arr.length; i++) pbf.writeSFixed64(arr[i]); }

// Buffer code below from https://github.com/feross/buffer, MIT-licensed

function readUInt32$1(buf, pos) {
    return ((buf[pos]) |
        (buf[pos + 1] << 8) |
        (buf[pos + 2] << 16)) +
        (buf[pos + 3] * 0x1000000);
}

function writeInt32$1(buf, val, pos) {
    buf[pos] = val;
    buf[pos + 1] = (val >>> 8);
    buf[pos + 2] = (val >>> 16);
    buf[pos + 3] = (val >>> 24);
}

function readInt32$1(buf, pos) {
    return ((buf[pos]) |
        (buf[pos + 1] << 8) |
        (buf[pos + 2] << 16)) +
        (buf[pos + 3] << 24);
}

function readUtf8$1(buf, pos, end) {
    var str = '';
    var i = pos;

    while (i < end) {
        var b0 = buf[i];
        var c = null; // codepoint
        var bytesPerSequence =
            b0 > 0xEF ? 4 :
            b0 > 0xDF ? 3 :
            b0 > 0xBF ? 2 : 1;

        if (i + bytesPerSequence > end) break;

        var b1, b2, b3;

        if (bytesPerSequence === 1) {
            if (b0 < 0x80) {
                c = b0;
            }
        } else if (bytesPerSequence === 2) {
            b1 = buf[i + 1];
            if ((b1 & 0xC0) === 0x80) {
                c = (b0 & 0x1F) << 0x6 | (b1 & 0x3F);
                if (c <= 0x7F) {
                    c = null;
                }
            }
        } else if (bytesPerSequence === 3) {
            b1 = buf[i + 1];
            b2 = buf[i + 2];
            if ((b1 & 0xC0) === 0x80 && (b2 & 0xC0) === 0x80) {
                c = (b0 & 0xF) << 0xC | (b1 & 0x3F) << 0x6 | (b2 & 0x3F);
                if (c <= 0x7FF || (c >= 0xD800 && c <= 0xDFFF)) {
                    c = null;
                }
            }
        } else if (bytesPerSequence === 4) {
            b1 = buf[i + 1];
            b2 = buf[i + 2];
            b3 = buf[i + 3];
            if ((b1 & 0xC0) === 0x80 && (b2 & 0xC0) === 0x80 && (b3 & 0xC0) === 0x80) {
                c = (b0 & 0xF) << 0x12 | (b1 & 0x3F) << 0xC | (b2 & 0x3F) << 0x6 | (b3 & 0x3F);
                if (c <= 0xFFFF || c >= 0x110000) {
                    c = null;
                }
            }
        }

        if (c === null) {
            c = 0xFFFD;
            bytesPerSequence = 1;

        } else if (c > 0xFFFF) {
            c -= 0x10000;
            str += String.fromCharCode(c >>> 10 & 0x3FF | 0xD800);
            c = 0xDC00 | c & 0x3FF;
        }

        str += String.fromCharCode(c);
        i += bytesPerSequence;
    }

    return str;
}

function readUtf8TextDecoder$1(buf, pos, end) {
    return utf8TextDecoder$1.decode(buf.subarray(pos, end));
}

function writeUtf8$1(buf, str, pos) {
    for (var i = 0, c, lead; i < str.length; i++) {
        c = str.charCodeAt(i); // code point

        if (c > 0xD7FF && c < 0xE000) {
            if (lead) {
                if (c < 0xDC00) {
                    buf[pos++] = 0xEF;
                    buf[pos++] = 0xBF;
                    buf[pos++] = 0xBD;
                    lead = c;
                    continue;
                } else {
                    c = lead - 0xD800 << 10 | c - 0xDC00 | 0x10000;
                    lead = null;
                }
            } else {
                if (c > 0xDBFF || (i + 1 === str.length)) {
                    buf[pos++] = 0xEF;
                    buf[pos++] = 0xBF;
                    buf[pos++] = 0xBD;
                } else {
                    lead = c;
                }
                continue;
            }
        } else if (lead) {
            buf[pos++] = 0xEF;
            buf[pos++] = 0xBF;
            buf[pos++] = 0xBD;
            lead = null;
        }

        if (c < 0x80) {
            buf[pos++] = c;
        } else {
            if (c < 0x800) {
                buf[pos++] = c >> 0x6 | 0xC0;
            } else {
                if (c < 0x10000) {
                    buf[pos++] = c >> 0xC | 0xE0;
                } else {
                    buf[pos++] = c >> 0x12 | 0xF0;
                    buf[pos++] = c >> 0xC & 0x3F | 0x80;
                }
                buf[pos++] = c >> 0x6 & 0x3F | 0x80;
            }
            buf[pos++] = c & 0x3F | 0x80;
        }
    }
    return pos;
}

function classifyRings(rings) {
  // Classifies an array of rings into polygons with outer rings and holes
  if (rings.length <= 1) return [rings];

  var polygons = [];
  var polygon, ccw;

  rings.forEach(ring => {
    let area = signedArea(ring);
    if (area === 0) return;

    if (ccw === undefined) ccw = area < 0;

    if (ccw === area < 0) {
      if (polygon) polygons.push(polygon);
      polygon = [ring];

    } else {
      polygon.push(ring);
    }
  });
  if (polygon) polygons.push(polygon);

  return polygons;
}

function signedArea(ring) {
  const xmul = (p1, p2) => (p2.x - p1.x) * (p1.y + p2.y);

  const initialValue = xmul(ring[0], ring[ring.length - 1]);

  return ring.slice(1)  // NOTE: skips ring[0], shifts index
    .reduce( (sum, p1, i) => sum + xmul(p1, ring[i]), initialValue );
}

function VectorTileFeature(pbf, end, extent, keys, values) {
  // Public
  this.properties = {};
  this.extent = extent;
  this.type = 0;

  // Private
  this._pbf = pbf;
  this._geometry = -1;
  this._keys = keys;
  this._values = values;

  pbf.readFields(readFeature, this, end);
}

function readFeature(tag, feature, pbf) {
  if (tag == 1) feature.id = pbf.readVarint();
  else if (tag == 2) readTag(pbf, feature);
  else if (tag == 3) feature.type = pbf.readVarint();
  else if (tag == 4) feature._geometry = pbf.pos;
}

function readTag(pbf, feature) {
  var end = pbf.readVarint() + pbf.pos;

  while (pbf.pos < end) {
    var key = feature._keys[pbf.readVarint()],
      value = feature._values[pbf.readVarint()];
    feature.properties[key] = value;
  }
}

VectorTileFeature.types = ['Unknown', 'Point', 'LineString', 'Polygon'];

VectorTileFeature.prototype.loadGeometry = function() {
  var pbf = this._pbf;
  pbf.pos = this._geometry;

  var end = pbf.readVarint() + pbf.pos,
    cmd = 1,
    length = 0,
    x = 0,
    y = 0,
    lines = [],
    line;

  while (pbf.pos < end) {
    if (length <= 0) {
      var cmdLen = pbf.readVarint();
      cmd = cmdLen & 0x7;
      length = cmdLen >> 3;
    }

    length--;

    if (cmd === 1 || cmd === 2) {
      x += pbf.readSVarint();
      y += pbf.readSVarint();

      if (cmd === 1) { // moveTo
        if (line) lines.push(line);
        line = [];
      }

      line.push({ x, y });

    } else if (cmd === 7) {
      // Workaround for https://github.com/mapbox/mapnik-vector-tile/issues/90
      if (line) line.push({ // closePolygon
        x: line[0].x,
        y: line[0].y
      });

    } else {
      throw new Error('unknown command ' + cmd);
    }
  }

  if (line) lines.push(line);

  return lines;
};

VectorTileFeature.prototype.bbox = function() {
  var pbf = this._pbf;
  pbf.pos = this._geometry;

  var end = pbf.readVarint() + pbf.pos,
  cmd = 1,
  length = 0,
  x = 0,
  y = 0,
  x1 = Infinity,
  x2 = -Infinity,
  y1 = Infinity,
  y2 = -Infinity;

  while (pbf.pos < end) {
    if (length <= 0) {
      var cmdLen = pbf.readVarint();
      cmd = cmdLen & 0x7;
      length = cmdLen >> 3;
    }

    length--;

    if (cmd === 1 || cmd === 2) {
      x += pbf.readSVarint();
      y += pbf.readSVarint();
      if (x < x1) x1 = x;
      if (x > x2) x2 = x;
      if (y < y1) y1 = y;
      if (y > y2) y2 = y;

    } else if (cmd !== 7) {
      throw new Error('unknown command ' + cmd);
    }
  }

  return [x1, y1, x2, y2];
};

VectorTileFeature.prototype.toGeoJSON = function(size, sx = 0, sy = 0) {
  // Input size is the side length of the (square) area over which the
  //  coordinate space of this tile [0, this.extent] will be rendered.
  // Input sx, sy is the origin (top left corner) of the output coordinates
  //  within the (size x size) rendered area of the full tile.

  size = size || this.extent;
  var scale = size / this.extent,
    coords = this.loadGeometry(),
    type = VectorTileFeature.types[this.type];

  function project(line) {
    return line.map(p => [p.x * scale - sx, p.y * scale - sy]);
  }

  switch (type) {
    case "Point":
      coords = project( coords.map(p => p[0]) );
      break;

    case "LineString":
      coords = coords.map(project);
      break;

    case "Polygon":
      coords = classifyRings(coords);
      coords = coords.map(polygon => polygon.map(project));
      break;
  }

  if (coords.length === 1) {
    coords = coords[0];
  } else {
    type = 'Multi' + type;
  }

  var result = {
    type: "Feature",
    geometry: {
      type: type,
      coordinates: coords
    },
    properties: this.properties
  };

  if ('id' in this) result.id = this.id;

  return result;
};

function VectorTileLayer(pbf, end) {
  // Public
  this.version = 1;
  this.name = null;
  this.extent = 4096;
  this.length = 0;

  // Private
  this._pbf = pbf;
  this._keys = [];
  this._values = [];
  this._features = [];

  pbf.readFields(readLayer, this, end);

  this.length = this._features.length;
}

function readLayer(tag, layer, pbf) {
  if (tag === 15) layer.version = pbf.readVarint();
  else if (tag === 1) layer.name = pbf.readString();
  else if (tag === 5) layer.extent = pbf.readVarint();
  else if (tag === 2) layer._features.push(pbf.pos);
  else if (tag === 3) layer._keys.push(pbf.readString());
  else if (tag === 4) layer._values.push(readValueMessage(pbf));
}

function readValueMessage(pbf) {
  var value = null,
  end = pbf.readVarint() + pbf.pos;

  while (pbf.pos < end) {
    var tag = pbf.readVarint() >> 3;

    value = tag === 1 ? pbf.readString() :
      tag === 2 ? pbf.readFloat() :
      tag === 3 ? pbf.readDouble() :
      tag === 4 ? pbf.readVarint64() :
      tag === 5 ? pbf.readVarint() :
      tag === 6 ? pbf.readSVarint() :
      tag === 7 ? pbf.readBoolean() : null;
  }

  return value;
}

// return feature 'i' from this layer as a 'VectorTileFeature'
VectorTileLayer.prototype.feature = function(i) {
  if (i < 0 || i >= this._features.length) throw new Error('feature index out of bounds');

  this._pbf.pos = this._features[i];

  var end = this._pbf.readVarint() + this._pbf.pos;
  return new VectorTileFeature(this._pbf, end, this.extent, this._keys, this._values);
};

VectorTileLayer.prototype.toGeoJSON = function(size, sx, sy) {
  const features = Array.from(Array(this._features.length), (v, i) => {
    return this.feature(i).toGeoJSON(size, sx, sy);
  });

  return { type: "FeatureCollection", features };
};

function VectorTile(pbf, end) {
  this.layers = pbf.readFields(readTile, {}, end);
}

function readTile(tag, layers, pbf) {
  if (tag === 3) {
    var layer = new VectorTileLayer(pbf, pbf.readVarint() + pbf.pos);
    if (layer.length) layers[layer.name] = layer;
  }
}

function initMVT(source) {
  const getURL = initUrlFunc(source.tiles);

  // TODO: use VectorTile.extent. Requires changes in vector-tile-esm, tile-painter
  const size = 512;

  return function(tileCoords, callback) {
    const { z, x, y } = tileCoords;
    const dataHref = getURL(z, x, y);

    return xhrGet(dataHref, "arraybuffer", parseMVT);

    function parseMVT(err, data) {
      if (err) return callback(err, data);
      const tile = new VectorTile(new pbf$1(data));
      const json = Object.values(tile.layers)
        .reduce((d, l) => (d[l.name] = l.toGeoJSON(size), d), {});
      callback(null, json);
    }
  };
}

function xhrGet(href, type, callback) {
  var req = new XMLHttpRequest();
  req.responseType = type;

  req.onerror = errHandler;
  req.onabort = errHandler;
  req.onload = loadHandler;

  req.open('get', href);
  req.send();

  function errHandler(e) {
    let err = "XMLHttpRequest ended with an " + e.type;
    return callback(err);
  }
  function loadHandler(e) {
    if (req.responseType !== type) {
      let err = "XMLHttpRequest: Wrong responseType. Expected " +
        type + ", got " + req.responseType;
      return callback(err, req.response);
    }
    if (req.status !== 200) {
      let err = "XMLHttpRequest: HTTP " + req.status + " error from " + href;
      return callback(err, req.response);
    }
    return callback(null, req.response);
  }

  return req; // Request can be aborted via req.abort()
}

function initUrlFunc(endpoints) {
  // Use a different endpoint for each request
  var index = 0;

  return function(z, x, y) {
    index = (index + 1) % endpoints.length;
    var endpoint = endpoints[index];
    return endpoint.replace(/{z}/, z).replace(/{x}/, x).replace(/{y}/, y);
  };
}

// calculate simplification data using optimized Douglas-Peucker algorithm

function simplify(coords, first, last, sqTolerance) {
    var maxSqDist = sqTolerance;
    var mid = (last - first) >> 1;
    var minPosToMid = last - first;
    var index;

    var ax = coords[first];
    var ay = coords[first + 1];
    var bx = coords[last];
    var by = coords[last + 1];

    for (var i = first + 3; i < last; i += 3) {
        var d = getSqSegDist(coords[i], coords[i + 1], ax, ay, bx, by);

        if (d > maxSqDist) {
            index = i;
            maxSqDist = d;

        } else if (d === maxSqDist) {
            // a workaround to ensure we choose a pivot close to the middle of the list,
            // reducing recursion depth, for certain degenerate inputs
            // https://github.com/mapbox/geojson-vt/issues/104
            var posToMid = Math.abs(i - mid);
            if (posToMid < minPosToMid) {
                index = i;
                minPosToMid = posToMid;
            }
        }
    }

    if (maxSqDist > sqTolerance) {
        if (index - first > 3) simplify(coords, first, index, sqTolerance);
        coords[index + 2] = maxSqDist;
        if (last - index > 3) simplify(coords, index, last, sqTolerance);
    }
}

// square distance from a point to a segment
function getSqSegDist(px, py, x, y, bx, by) {

    var dx = bx - x;
    var dy = by - y;

    if (dx !== 0 || dy !== 0) {

        var t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);

        if (t > 1) {
            x = bx;
            y = by;

        } else if (t > 0) {
            x += dx * t;
            y += dy * t;
        }
    }

    dx = px - x;
    dy = py - y;

    return dx * dx + dy * dy;
}

function createFeature(id, type, geom, tags) {
    var feature = {
        id: typeof id === 'undefined' ? null : id,
        type: type,
        geometry: geom,
        tags: tags,
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
    };
    calcBBox$1(feature);
    return feature;
}

function calcBBox$1(feature) {
    var geom = feature.geometry;
    var type = feature.type;

    if (type === 'Point' || type === 'MultiPoint' || type === 'LineString') {
        calcLineBBox(feature, geom);

    } else if (type === 'Polygon' || type === 'MultiLineString') {
        for (var i = 0; i < geom.length; i++) {
            calcLineBBox(feature, geom[i]);
        }

    } else if (type === 'MultiPolygon') {
        for (i = 0; i < geom.length; i++) {
            for (var j = 0; j < geom[i].length; j++) {
                calcLineBBox(feature, geom[i][j]);
            }
        }
    }
}

function calcLineBBox(feature, geom) {
    for (var i = 0; i < geom.length; i += 3) {
        feature.minX = Math.min(feature.minX, geom[i]);
        feature.minY = Math.min(feature.minY, geom[i + 1]);
        feature.maxX = Math.max(feature.maxX, geom[i]);
        feature.maxY = Math.max(feature.maxY, geom[i + 1]);
    }
}

// converts GeoJSON feature into an intermediate projected JSON vector format with simplification data

function convert(data, options) {
    var features = [];
    if (data.type === 'FeatureCollection') {
        for (var i = 0; i < data.features.length; i++) {
            convertFeature(features, data.features[i], options, i);
        }

    } else if (data.type === 'Feature') {
        convertFeature(features, data, options);

    } else {
        // single geometry or a geometry collection
        convertFeature(features, {geometry: data}, options);
    }

    return features;
}

function convertFeature(features, geojson, options, index) {
    if (!geojson.geometry) return;

    var coords = geojson.geometry.coordinates;
    var type = geojson.geometry.type;
    var tolerance = Math.pow(options.tolerance / ((1 << options.maxZoom) * options.extent), 2);
    var geometry = [];
    var id = geojson.id;
    if (options.promoteId) {
        id = geojson.properties[options.promoteId];
    } else if (options.generateId) {
        id = index || 0;
    }
    if (type === 'Point') {
        convertPoint(coords, geometry);

    } else if (type === 'MultiPoint') {
        for (var i = 0; i < coords.length; i++) {
            convertPoint(coords[i], geometry);
        }

    } else if (type === 'LineString') {
        convertLine(coords, geometry, tolerance, false);

    } else if (type === 'MultiLineString') {
        if (options.lineMetrics) {
            // explode into linestrings to be able to track metrics
            for (i = 0; i < coords.length; i++) {
                geometry = [];
                convertLine(coords[i], geometry, tolerance, false);
                features.push(createFeature(id, 'LineString', geometry, geojson.properties));
            }
            return;
        } else {
            convertLines(coords, geometry, tolerance, false);
        }

    } else if (type === 'Polygon') {
        convertLines(coords, geometry, tolerance, true);

    } else if (type === 'MultiPolygon') {
        for (i = 0; i < coords.length; i++) {
            var polygon = [];
            convertLines(coords[i], polygon, tolerance, true);
            geometry.push(polygon);
        }
    } else if (type === 'GeometryCollection') {
        for (i = 0; i < geojson.geometry.geometries.length; i++) {
            convertFeature(features, {
                id: id,
                geometry: geojson.geometry.geometries[i],
                properties: geojson.properties
            }, options, index);
        }
        return;
    } else {
        throw new Error('Input data is not a valid GeoJSON object.');
    }

    features.push(createFeature(id, type, geometry, geojson.properties));
}

function convertPoint(coords, out) {
    out.push(projectX(coords[0]));
    out.push(projectY(coords[1]));
    out.push(0);
}

function convertLine(ring, out, tolerance, isPolygon) {
    var x0, y0;
    var size = 0;

    for (var j = 0; j < ring.length; j++) {
        var x = projectX(ring[j][0]);
        var y = projectY(ring[j][1]);

        out.push(x);
        out.push(y);
        out.push(0);

        if (j > 0) {
            if (isPolygon) {
                size += (x0 * y - x * y0) / 2; // area
            } else {
                size += Math.sqrt(Math.pow(x - x0, 2) + Math.pow(y - y0, 2)); // length
            }
        }
        x0 = x;
        y0 = y;
    }

    var last = out.length - 3;
    out[2] = 1;
    simplify(out, 0, last, tolerance);
    out[last + 2] = 1;

    out.size = Math.abs(size);
    out.start = 0;
    out.end = out.size;
}

function convertLines(rings, out, tolerance, isPolygon) {
    for (var i = 0; i < rings.length; i++) {
        var geom = [];
        convertLine(rings[i], geom, tolerance, isPolygon);
        out.push(geom);
    }
}

function projectX(x) {
    return x / 360 + 0.5;
}

function projectY(y) {
    var sin = Math.sin(y * Math.PI / 180);
    var y2 = 0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI;
    return y2 < 0 ? 0 : y2 > 1 ? 1 : y2;
}

/* clip features between two axis-parallel lines:
 *     |        |
 *  ___|___     |     /
 * /   |   \____|____/
 *     |        |
 */

function clip(features, scale, k1, k2, axis, minAll, maxAll, options) {

    k1 /= scale;
    k2 /= scale;

    if (minAll >= k1 && maxAll < k2) return features; // trivial accept
    else if (maxAll < k1 || minAll >= k2) return null; // trivial reject

    var clipped = [];

    for (var i = 0; i < features.length; i++) {

        var feature = features[i];
        var geometry = feature.geometry;
        var type = feature.type;

        var min = axis === 0 ? feature.minX : feature.minY;
        var max = axis === 0 ? feature.maxX : feature.maxY;

        if (min >= k1 && max < k2) { // trivial accept
            clipped.push(feature);
            continue;
        } else if (max < k1 || min >= k2) { // trivial reject
            continue;
        }

        var newGeometry = [];

        if (type === 'Point' || type === 'MultiPoint') {
            clipPoints(geometry, newGeometry, k1, k2, axis);

        } else if (type === 'LineString') {
            clipLine(geometry, newGeometry, k1, k2, axis, false, options.lineMetrics);

        } else if (type === 'MultiLineString') {
            clipLines(geometry, newGeometry, k1, k2, axis, false);

        } else if (type === 'Polygon') {
            clipLines(geometry, newGeometry, k1, k2, axis, true);

        } else if (type === 'MultiPolygon') {
            for (var j = 0; j < geometry.length; j++) {
                var polygon = [];
                clipLines(geometry[j], polygon, k1, k2, axis, true);
                if (polygon.length) {
                    newGeometry.push(polygon);
                }
            }
        }

        if (newGeometry.length) {
            if (options.lineMetrics && type === 'LineString') {
                for (j = 0; j < newGeometry.length; j++) {
                    clipped.push(createFeature(feature.id, type, newGeometry[j], feature.tags));
                }
                continue;
            }

            if (type === 'LineString' || type === 'MultiLineString') {
                if (newGeometry.length === 1) {
                    type = 'LineString';
                    newGeometry = newGeometry[0];
                } else {
                    type = 'MultiLineString';
                }
            }
            if (type === 'Point' || type === 'MultiPoint') {
                type = newGeometry.length === 3 ? 'Point' : 'MultiPoint';
            }

            clipped.push(createFeature(feature.id, type, newGeometry, feature.tags));
        }
    }

    return clipped.length ? clipped : null;
}

function clipPoints(geom, newGeom, k1, k2, axis) {
    for (var i = 0; i < geom.length; i += 3) {
        var a = geom[i + axis];

        if (a >= k1 && a <= k2) {
            newGeom.push(geom[i]);
            newGeom.push(geom[i + 1]);
            newGeom.push(geom[i + 2]);
        }
    }
}

function clipLine(geom, newGeom, k1, k2, axis, isPolygon, trackMetrics) {

    var slice = newSlice(geom);
    var intersect = axis === 0 ? intersectX : intersectY;
    var len = geom.start;
    var segLen, t;

    for (var i = 0; i < geom.length - 3; i += 3) {
        var ax = geom[i];
        var ay = geom[i + 1];
        var az = geom[i + 2];
        var bx = geom[i + 3];
        var by = geom[i + 4];
        var a = axis === 0 ? ax : ay;
        var b = axis === 0 ? bx : by;
        var exited = false;

        if (trackMetrics) segLen = Math.sqrt(Math.pow(ax - bx, 2) + Math.pow(ay - by, 2));

        if (a < k1) {
            // ---|-->  | (line enters the clip region from the left)
            if (b > k1) {
                t = intersect(slice, ax, ay, bx, by, k1);
                if (trackMetrics) slice.start = len + segLen * t;
            }
        } else if (a > k2) {
            // |  <--|--- (line enters the clip region from the right)
            if (b < k2) {
                t = intersect(slice, ax, ay, bx, by, k2);
                if (trackMetrics) slice.start = len + segLen * t;
            }
        } else {
            addPoint(slice, ax, ay, az);
        }
        if (b < k1 && a >= k1) {
            // <--|---  | or <--|-----|--- (line exits the clip region on the left)
            t = intersect(slice, ax, ay, bx, by, k1);
            exited = true;
        }
        if (b > k2 && a <= k2) {
            // |  ---|--> or ---|-----|--> (line exits the clip region on the right)
            t = intersect(slice, ax, ay, bx, by, k2);
            exited = true;
        }

        if (!isPolygon && exited) {
            if (trackMetrics) slice.end = len + segLen * t;
            newGeom.push(slice);
            slice = newSlice(geom);
        }

        if (trackMetrics) len += segLen;
    }

    // add the last point
    var last = geom.length - 3;
    ax = geom[last];
    ay = geom[last + 1];
    az = geom[last + 2];
    a = axis === 0 ? ax : ay;
    if (a >= k1 && a <= k2) addPoint(slice, ax, ay, az);

    // close the polygon if its endpoints are not the same after clipping
    last = slice.length - 3;
    if (isPolygon && last >= 3 && (slice[last] !== slice[0] || slice[last + 1] !== slice[1])) {
        addPoint(slice, slice[0], slice[1], slice[2]);
    }

    // add the final slice
    if (slice.length) {
        newGeom.push(slice);
    }
}

function newSlice(line) {
    var slice = [];
    slice.size = line.size;
    slice.start = line.start;
    slice.end = line.end;
    return slice;
}

function clipLines(geom, newGeom, k1, k2, axis, isPolygon) {
    for (var i = 0; i < geom.length; i++) {
        clipLine(geom[i], newGeom, k1, k2, axis, isPolygon, false);
    }
}

function addPoint(out, x, y, z) {
    out.push(x);
    out.push(y);
    out.push(z);
}

function intersectX(out, ax, ay, bx, by, x) {
    var t = (x - ax) / (bx - ax);
    out.push(x);
    out.push(ay + (by - ay) * t);
    out.push(1);
    return t;
}

function intersectY(out, ax, ay, bx, by, y) {
    var t = (y - ay) / (by - ay);
    out.push(ax + (bx - ax) * t);
    out.push(y);
    out.push(1);
    return t;
}

function wrap(features, options) {
    var buffer = options.buffer / options.extent;
    var merged = features;
    var left  = clip(features, 1, -1 - buffer, buffer,     0, -1, 2, options); // left world copy
    var right = clip(features, 1,  1 - buffer, 2 + buffer, 0, -1, 2, options); // right world copy

    if (left || right) {
        merged = clip(features, 1, -buffer, 1 + buffer, 0, -1, 2, options) || []; // center world copy

        if (left) merged = shiftFeatureCoords(left, 1).concat(merged); // merge left into center
        if (right) merged = merged.concat(shiftFeatureCoords(right, -1)); // merge right into center
    }

    return merged;
}

function shiftFeatureCoords(features, offset) {
    var newFeatures = [];

    for (var i = 0; i < features.length; i++) {
        var feature = features[i],
            type = feature.type;

        var newGeometry;

        if (type === 'Point' || type === 'MultiPoint' || type === 'LineString') {
            newGeometry = shiftCoords(feature.geometry, offset);

        } else if (type === 'MultiLineString' || type === 'Polygon') {
            newGeometry = [];
            for (var j = 0; j < feature.geometry.length; j++) {
                newGeometry.push(shiftCoords(feature.geometry[j], offset));
            }
        } else if (type === 'MultiPolygon') {
            newGeometry = [];
            for (j = 0; j < feature.geometry.length; j++) {
                var newPolygon = [];
                for (var k = 0; k < feature.geometry[j].length; k++) {
                    newPolygon.push(shiftCoords(feature.geometry[j][k], offset));
                }
                newGeometry.push(newPolygon);
            }
        }

        newFeatures.push(createFeature(feature.id, type, newGeometry, feature.tags));
    }

    return newFeatures;
}

function shiftCoords(points, offset) {
    var newPoints = [];
    newPoints.size = points.size;

    if (points.start !== undefined) {
        newPoints.start = points.start;
        newPoints.end = points.end;
    }

    for (var i = 0; i < points.length; i += 3) {
        newPoints.push(points[i] + offset, points[i + 1], points[i + 2]);
    }
    return newPoints;
}

// Transforms the coordinates of each feature in the given tile from
// mercator-projected space into (extent x extent) tile space.
function transformTile(tile, extent) {
    if (tile.transformed) return tile;

    var z2 = 1 << tile.z,
        tx = tile.x,
        ty = tile.y,
        i, j, k;

    for (i = 0; i < tile.features.length; i++) {
        var feature = tile.features[i],
            geom = feature.geometry,
            type = feature.type;

        feature.geometry = [];

        if (type === 1) {
            for (j = 0; j < geom.length; j += 2) {
                feature.geometry.push(transformPoint(geom[j], geom[j + 1], extent, z2, tx, ty));
            }
        } else {
            for (j = 0; j < geom.length; j++) {
                var ring = [];
                for (k = 0; k < geom[j].length; k += 2) {
                    ring.push(transformPoint(geom[j][k], geom[j][k + 1], extent, z2, tx, ty));
                }
                feature.geometry.push(ring);
            }
        }
    }

    tile.transformed = true;

    return tile;
}

function transformPoint(x, y, extent, z2, tx, ty) {
    return [
        Math.round(extent * (x * z2 - tx)),
        Math.round(extent * (y * z2 - ty))];
}

function createTile(features, z, tx, ty, options) {
    var tolerance = z === options.maxZoom ? 0 : options.tolerance / ((1 << z) * options.extent);
    var tile = {
        features: [],
        numPoints: 0,
        numSimplified: 0,
        numFeatures: 0,
        source: null,
        x: tx,
        y: ty,
        z: z,
        transformed: false,
        minX: 2,
        minY: 1,
        maxX: -1,
        maxY: 0
    };
    for (var i = 0; i < features.length; i++) {
        tile.numFeatures++;
        addFeature(tile, features[i], tolerance, options);

        var minX = features[i].minX;
        var minY = features[i].minY;
        var maxX = features[i].maxX;
        var maxY = features[i].maxY;

        if (minX < tile.minX) tile.minX = minX;
        if (minY < tile.minY) tile.minY = minY;
        if (maxX > tile.maxX) tile.maxX = maxX;
        if (maxY > tile.maxY) tile.maxY = maxY;
    }
    return tile;
}

function addFeature(tile, feature, tolerance, options) {

    var geom = feature.geometry,
        type = feature.type,
        simplified = [];

    if (type === 'Point' || type === 'MultiPoint') {
        for (var i = 0; i < geom.length; i += 3) {
            simplified.push(geom[i]);
            simplified.push(geom[i + 1]);
            tile.numPoints++;
            tile.numSimplified++;
        }

    } else if (type === 'LineString') {
        addLine(simplified, geom, tile, tolerance, false, false);

    } else if (type === 'MultiLineString' || type === 'Polygon') {
        for (i = 0; i < geom.length; i++) {
            addLine(simplified, geom[i], tile, tolerance, type === 'Polygon', i === 0);
        }

    } else if (type === 'MultiPolygon') {

        for (var k = 0; k < geom.length; k++) {
            var polygon = geom[k];
            for (i = 0; i < polygon.length; i++) {
                addLine(simplified, polygon[i], tile, tolerance, true, i === 0);
            }
        }
    }

    if (simplified.length) {
        var tags = feature.tags || null;
        if (type === 'LineString' && options.lineMetrics) {
            tags = {};
            for (var key in feature.tags) tags[key] = feature.tags[key];
            tags['mapbox_clip_start'] = geom.start / geom.size;
            tags['mapbox_clip_end'] = geom.end / geom.size;
        }
        var tileFeature = {
            geometry: simplified,
            type: type === 'Polygon' || type === 'MultiPolygon' ? 3 :
                type === 'LineString' || type === 'MultiLineString' ? 2 : 1,
            tags: tags
        };
        if (feature.id !== null) {
            tileFeature.id = feature.id;
        }
        tile.features.push(tileFeature);
    }
}

function addLine(result, geom, tile, tolerance, isPolygon, isOuter) {
    var sqTolerance = tolerance * tolerance;

    if (tolerance > 0 && (geom.size < (isPolygon ? sqTolerance : tolerance))) {
        tile.numPoints += geom.length / 3;
        return;
    }

    var ring = [];

    for (var i = 0; i < geom.length; i += 3) {
        if (tolerance === 0 || geom[i + 2] > sqTolerance) {
            tile.numSimplified++;
            ring.push(geom[i]);
            ring.push(geom[i + 1]);
        }
        tile.numPoints++;
    }

    if (isPolygon) rewind(ring, isOuter);

    result.push(ring);
}

function rewind(ring, clockwise) {
    var area = 0;
    for (var i = 0, len = ring.length, j = len - 2; i < len; j = i, i += 2) {
        area += (ring[i] - ring[j]) * (ring[i + 1] + ring[j + 1]);
    }
    if (area > 0 === clockwise) {
        for (i = 0, len = ring.length; i < len / 2; i += 2) {
            var x = ring[i];
            var y = ring[i + 1];
            ring[i] = ring[len - 2 - i];
            ring[i + 1] = ring[len - 1 - i];
            ring[len - 2 - i] = x;
            ring[len - 1 - i] = y;
        }
    }
}

function geojsonvt(data, options) {
    return new GeoJSONVT(data, options);
}

function GeoJSONVT(data, options) {
    options = this.options = extend$1(Object.create(this.options), options);

    var debug = options.debug;

    if (debug) console.time('preprocess data');

    if (options.maxZoom < 0 || options.maxZoom > 24) throw new Error('maxZoom should be in the 0-24 range');
    if (options.promoteId && options.generateId) throw new Error('promoteId and generateId cannot be used together.');

    var features = convert(data, options);

    this.tiles = {};
    this.tileCoords = [];

    if (debug) {
        console.timeEnd('preprocess data');
        console.log('index: maxZoom: %d, maxPoints: %d', options.indexMaxZoom, options.indexMaxPoints);
        console.time('generate tiles');
        this.stats = {};
        this.total = 0;
    }

    features = wrap(features, options);

    // start slicing from the top tile down
    if (features.length) this.splitTile(features, 0, 0, 0);

    if (debug) {
        if (features.length) console.log('features: %d, points: %d', this.tiles[0].numFeatures, this.tiles[0].numPoints);
        console.timeEnd('generate tiles');
        console.log('tiles generated:', this.total, JSON.stringify(this.stats));
    }
}

GeoJSONVT.prototype.options = {
    maxZoom: 14,            // max zoom to preserve detail on
    indexMaxZoom: 5,        // max zoom in the tile index
    indexMaxPoints: 100000, // max number of points per tile in the tile index
    tolerance: 3,           // simplification tolerance (higher means simpler)
    extent: 4096,           // tile extent
    buffer: 64,             // tile buffer on each side
    lineMetrics: false,     // whether to calculate line metrics
    promoteId: null,        // name of a feature property to be promoted to feature.id
    generateId: false,      // whether to generate feature ids. Cannot be used with promoteId
    debug: 0                // logging level (0, 1 or 2)
};

GeoJSONVT.prototype.splitTile = function (features, z, x, y, cz, cx, cy) {

    var stack = [features, z, x, y],
        options = this.options,
        debug = options.debug;

    // avoid recursion by using a processing queue
    while (stack.length) {
        y = stack.pop();
        x = stack.pop();
        z = stack.pop();
        features = stack.pop();

        var z2 = 1 << z,
            id = toID(z, x, y),
            tile = this.tiles[id];

        if (!tile) {
            if (debug > 1) console.time('creation');

            tile = this.tiles[id] = createTile(features, z, x, y, options);
            this.tileCoords.push({z: z, x: x, y: y});

            if (debug) {
                if (debug > 1) {
                    console.log('tile z%d-%d-%d (features: %d, points: %d, simplified: %d)',
                        z, x, y, tile.numFeatures, tile.numPoints, tile.numSimplified);
                    console.timeEnd('creation');
                }
                var key = 'z' + z;
                this.stats[key] = (this.stats[key] || 0) + 1;
                this.total++;
            }
        }

        // save reference to original geometry in tile so that we can drill down later if we stop now
        tile.source = features;

        // if it's the first-pass tiling
        if (!cz) {
            // stop tiling if we reached max zoom, or if the tile is too simple
            if (z === options.indexMaxZoom || tile.numPoints <= options.indexMaxPoints) continue;

        // if a drilldown to a specific tile
        } else {
            // stop tiling if we reached base zoom or our target tile zoom
            if (z === options.maxZoom || z === cz) continue;

            // stop tiling if it's not an ancestor of the target tile
            var m = 1 << (cz - z);
            if (x !== Math.floor(cx / m) || y !== Math.floor(cy / m)) continue;
        }

        // if we slice further down, no need to keep source geometry
        tile.source = null;

        if (features.length === 0) continue;

        if (debug > 1) console.time('clipping');

        // values we'll use for clipping
        var k1 = 0.5 * options.buffer / options.extent,
            k2 = 0.5 - k1,
            k3 = 0.5 + k1,
            k4 = 1 + k1,
            tl, bl, tr, br, left, right;

        tl = bl = tr = br = null;

        left  = clip(features, z2, x - k1, x + k3, 0, tile.minX, tile.maxX, options);
        right = clip(features, z2, x + k2, x + k4, 0, tile.minX, tile.maxX, options);
        features = null;

        if (left) {
            tl = clip(left, z2, y - k1, y + k3, 1, tile.minY, tile.maxY, options);
            bl = clip(left, z2, y + k2, y + k4, 1, tile.minY, tile.maxY, options);
            left = null;
        }

        if (right) {
            tr = clip(right, z2, y - k1, y + k3, 1, tile.minY, tile.maxY, options);
            br = clip(right, z2, y + k2, y + k4, 1, tile.minY, tile.maxY, options);
            right = null;
        }

        if (debug > 1) console.timeEnd('clipping');

        stack.push(tl || [], z + 1, x * 2,     y * 2);
        stack.push(bl || [], z + 1, x * 2,     y * 2 + 1);
        stack.push(tr || [], z + 1, x * 2 + 1, y * 2);
        stack.push(br || [], z + 1, x * 2 + 1, y * 2 + 1);
    }
};

GeoJSONVT.prototype.getTile = function (z, x, y) {
    var options = this.options,
        extent = options.extent,
        debug = options.debug;

    if (z < 0 || z > 24) return null;

    var z2 = 1 << z;
    x = ((x % z2) + z2) % z2; // wrap tile x coordinate

    var id = toID(z, x, y);
    if (this.tiles[id]) return transformTile(this.tiles[id], extent);

    if (debug > 1) console.log('drilling down to z%d-%d-%d', z, x, y);

    var z0 = z,
        x0 = x,
        y0 = y,
        parent;

    while (!parent && z0 > 0) {
        z0--;
        x0 = Math.floor(x0 / 2);
        y0 = Math.floor(y0 / 2);
        parent = this.tiles[toID(z0, x0, y0)];
    }

    if (!parent || !parent.source) return null;

    // if we found a parent tile containing the original geometry, we can drill down from it
    if (debug > 1) console.log('found parent tile z%d-%d-%d', z0, x0, y0);

    if (debug > 1) console.time('drilling down');
    this.splitTile(parent.source, z0, x0, y0, z, x, y);
    if (debug > 1) console.timeEnd('drilling down');

    return this.tiles[id] ? transformTile(this.tiles[id], extent) : null;
};

function toID(z, x, y) {
    return (((1 << z) * y + x) * 32) + z;
}

function extend$1(dest, src) {
    for (var i in src) dest[i] = src[i];
    return dest;
}

function initGeojson(source, styles) {
  // TODO: should these be taken from payload? Or, are defaults OK?
  const indexParams = { extent: 512, minZoom: 0, maxZoom: 14, tolerance: 1 };
  const tileIndex = geojsonvt(source.data, indexParams);

  // TODO: does geojson-vt always return only one layer?
  const layerID = styles[0].id;

  return function(tileCoords, callback) {
    const { z, x, y } = tileCoords;

    const tile = tileIndex.getTile(z, x, y);

    const err = (!tile || !tile.features || !tile.features.length)
      ? "ERROR in GeojsonLoader for tile z, x, y = " + [z, x, y].join(", ")
      : null;

    const layer = { type: "FeatureCollection" };
    if (!err) layer.features = tile.features.map(geojsonvtToJSON);

    const json = { [layerID]: layer };
    setTimeout(() => callback(err, json));

    return { abort: () => undefined };
  };
}

function geojsonvtToJSON(value) {
  //http://www.scgis.net/api/ol/v4.1.1/examples/geojson-vt.html
  if (!value.geometry) return value;

  const geometry = value.geometry;

  const types = ['Unknown', 'Point', 'LineString', 'Polygon'];

  // TODO: What if geometry.length < 1?
  const type = (geometry.length === 1)
    ? types[value.type]
    : 'Multi' + types[value.type];

  const coordinates =
    (type == "MultiPolygon") ? [geometry]                                                                                                                                       : (type === 'Point'|| type === 'LineString') ? geometry[0]                                                                                                                  : geometry;

  return {
    geometry: { type, coordinates },
    properties: value.tags
  };
}

const tasks = {};
var loader, filter;

onmessage = function(msgEvent) {
  const { id, type, payload } = msgEvent.data;

  switch (type) {
    case "setup":
      // NOTE: changing global variable!
      let { styles, glyphEndpoint, source } = payload;
      loader = (source.type === "geojson")
        ? initGeojson(source, styles)
        : initMVT(source);
      filter = initSourceProcessor(payload);
      break;
    case "getTile":
      const { type, z, href, size } = payload;
      let callback = (err, result) => process(id, err, result, z);
      const request = loader(payload, callback);
      tasks[id] = { request, status: "requested" };
      break;
    case "cancel":
      let task = tasks[id];
      if (task && task.status === "requested") task.request.abort();
      delete tasks[id];
      break;
      // Bad message type!
  }
};

function process(id, err, result, zoom) {
  // Make sure we still have an active task for this ID
  let task = tasks[id];
  if (!task) return;  // Task must have been canceled

  if (err) {
    delete tasks[id];
    return postMessage({ id, type: "error", payload: err });
  }

  task.status = "parsing";
  return filter(result, zoom).then(tile => sendTile(id, tile));
}

function sendTile(id, tile) {
  // Make sure we still have an active task for this ID
  let task = tasks[id];
  if (!task) return; // Task must have been canceled

  // Get a list of all the Transferable objects
  const transferables = Object.values(tile.layers)
    .flatMap(features => features.flatMap(getFeatureBuffers));
  transferables.push(tile.atlas.data.buffer);

  postMessage({ id, type: "data", payload: tile }, transferables);
}

function getFeatureBuffers(feature) {
  return Object.values(feature.buffers).map(b => b.buffer);
}
