# sf-filecache
> Simple and smart FS based cache system.

[![NPM version](https://badge.fury.io/js/sf-filecache.svg)](https://npmjs.org/package/sf-filecache) [![Build status](https://secure.travis-ci.org/SimpliField/sf-filecache.svg)](https://travis-ci.org/SimpliField/sf-filecache) [![Dependency Status](https://david-dm.org/SimpliField/sf-filecache.svg)](https://david-dm.org/SimpliField/sf-filecache) [![devDependency Status](https://david-dm.org/SimpliField/sf-filecache/dev-status.svg)](https://david-dm.org/SimpliField/sf-filecache#info=devDependencies) [![Coverage Status](https://coveralls.io/repos/SimpliField/sf-filecache/badge.svg?branch=master)](https://coveralls.io/r/SimpliField/sf-filecache?branch=master) [![Code Climate](https://codeclimate.com/github/SimpliField/sf-filecache.svg)](https://codeclimate.com/github/SimpliField/sf-filecache)

`sf-filecache` exists for two purposes:
- having a streameable fs based cache system
- opening only one file descriptor for cache queries

## Usage

Buffer based:

```js
var FileCache = require('sf-filecache');

var filecache = new FileCache();

var endOfLife = Date.now() + 36000;

// Set a value in the filecache for the 'plop' key
fileCache.set('plop', new Buffer('plop!'), endOfLife, function(err) {
  if(err) {
    throw err;
  }
  // Retrieve it
  fileCache.get('plop', function(err, data) {
    if(err) {
      return done(err);
    }
    console.log(data.toString()); // plop!
    done();
  });

});
```

Stream based:

```js
var FileCache = require('sf-filecache');

var filecache = new FileCache();

var endOfLife = Date.now() + 36000;

// Set a stream content in the filecache for the 'plop' key
fileCache.setStream('plop', fs.createReadStream('file'), endOfLife, function(err) {
  if(err) {
    throw err;
  }
  // Retrieve it
  fileCache.getStream('plop', function(err, stream) {
    if(err) {
      return done(err);
    }
    stream.pipe(process.stdout); // plop!
    done();
  });

});
```

## API

<a name="FileCache"></a>
## FileCache(options)
FileCache constructor

**Kind**: global function  
**Api**: public  

| Param | Type | Description |
| --- | --- | --- |
| options | <code>Object</code> | Options of the cache (dir, domain and clock) |


* [FileCache(options)](#FileCache)
  * [._keyToPath(key)](#FileCache+_keyToPath) ⇒ <code>String</code>
  * [._createHeader(header)](#FileCache+_createHeader) ⇒ <code>Buffer</code>
  * [._readHeader(data)](#FileCache+_readHeader) ⇒ <code>Object</code>
  * [.get(key, cb)](#FileCache+get) ⇒ <code>void</code>
  * [.getStream(key, cb)](#FileCache+getStream) ⇒ <code>void</code>
  * [.set(key, data, eol, cb)](#FileCache+set) ⇒ <code>void</code>
  * [.setStream(key, stream, eol, cb)](#FileCache+setStream) ⇒ <code>void</code>
  * [.setEOL(key, eol, cb)](#FileCache+setEOL) ⇒ <code>void</code>

<a name="FileCache+_keyToPath"></a>
### fileCache._keyToPath(key) ⇒ <code>String</code>
Transform a key into a path were to save/read the contents

**Kind**: instance method of <code>[FileCache](#FileCache)</code>  
**Returns**: <code>String</code> - The computed path  
**Api**: private  

| Param | Type | Description |
| --- | --- | --- |
| key | <code>String</code> | The key to transform |

<a name="FileCache+_createHeader"></a>
### fileCache._createHeader(header) ⇒ <code>Buffer</code>
Create a bucket header

**Kind**: instance method of <code>[FileCache](#FileCache)</code>  
**Returns**: <code>Buffer</code> - The header contents as a buffer  
**Api**: private  

| Param | Type | Description |
| --- | --- | --- |
| header | <code>Object</code> | Header description |

<a name="FileCache+_readHeader"></a>
### fileCache._readHeader(data) ⇒ <code>Object</code>
Read the header description from a buffer

**Kind**: instance method of <code>[FileCache](#FileCache)</code>  
**Returns**: <code>Object</code> - The header description  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>Buffer</code> | The buffer |

<a name="FileCache+get"></a>
### fileCache.get(key, cb) ⇒ <code>void</code>
Get cached data for the given key

**Kind**: instance method of <code>[FileCache](#FileCache)</code>  

| Param | Type | Description |
| --- | --- | --- |
| key | <code>String</code> | The key |
| cb | <code>function</code> | The callback ( signature function(err:Error, data:Buffer) {}) |

<a name="FileCache+getStream"></a>
### fileCache.getStream(key, cb) ⇒ <code>void</code>
Get cached data as a stream for the given key

**Kind**: instance method of <code>[FileCache](#FileCache)</code>  

| Param | Type | Description |
| --- | --- | --- |
| key | <code>String</code> | The key |
| cb | <code>function</code> | The callback ( signature function(err:Error, stream:ReadableStream) {}) |

<a name="FileCache+set"></a>
### fileCache.set(key, data, eol, cb) ⇒ <code>void</code>
Set cached data at the given key

**Kind**: instance method of <code>[FileCache](#FileCache)</code>  

| Param | Type | Description |
| --- | --- | --- |
| key | <code>String</code> | The key |
| data | <code>Buffer</code> | The data to store |
| eol | <code>Number</code> | The resource invalidity timestamp |
| cb | <code>function</code> | The callback ( signature function(err:Error) {}) |

<a name="FileCache+setStream"></a>
### fileCache.setStream(key, stream, eol, cb) ⇒ <code>void</code>
Set cached data via a stream at the given key

**Kind**: instance method of <code>[FileCache](#FileCache)</code>  

| Param | Type | Description |
| --- | --- | --- |
| key | <code>String</code> | The key |
| stream | <code>ReadableStream</code> | The data to store as a readable stream |
| eol | <code>Number</code> | The resource invalidity timestamp |
| cb | <code>function</code> | The callback ( signature function(err:Error) {}) |

<a name="FileCache+setEOL"></a>
### fileCache.setEOL(key, eol, cb) ⇒ <code>void</code>
Set end of life to the given key

**Kind**: instance method of <code>[FileCache](#FileCache)</code>  

| Param | Type | Description |
| --- | --- | --- |
| key | <code>String</code> | The key |
| eol | <code>Number</code> | The resource invalidity timestamp |
| cb | <code>function</code> | The callback ( signature function(err:Error) {}) |
