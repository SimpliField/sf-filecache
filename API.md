# API
## Functions

<dl>
<dt><a href="#initFileCache">initFileCache(services)</a> ⇒ <code><a href="#FileCache">Promise.&lt;FileCache&gt;</a></code></dt>
<dd><p>Instantiate the file cache service</p>
</dd>
</dl>

## Typedefs

<dl>
<dt><a href="#FileCache">FileCache</a> : <code>Object</code></dt>
<dd></dd>
</dl>

<a name="initFileCache"></a>

## initFileCache(services) ⇒ [<code>Promise.&lt;FileCache&gt;</code>](#FileCache)
Instantiate the file cache service

**Kind**: global function  
**Returns**: [<code>Promise.&lt;FileCache&gt;</code>](#FileCache) - A promise of the file cache service  

| Param | Type | Description |
| --- | --- | --- |
| services | <code>Object</code> | The services to inject |
| [services.log] | <code>function</code> | A logging function |
| services.FS_CACHE_TTL | <code>Number</code> | The store time to live in milliseconds |
| [services.FS_CACHE_DIR] | <code>String</code> | The store for values as a simple object, it is useful  to get a synchronous access to the store in tests  for example. |

**Example**  
```js
import initFileCache from 'sf-filecache';

const fileCache = await initFileCache({
  FS_CACHE_DIR: '_cache/dir',
});
```
<a name="FileCache"></a>

## FileCache : <code>Object</code>
**Kind**: global typedef  

* [FileCache](#FileCache) : <code>Object</code>
    * [.get(key)](#FileCache.get) ⇒ <code>Promise.&lt;Buffer&gt;</code>
    * [.getStream(key)](#FileCache.getStream) ⇒ <code>Promise.&lt;ReadableStream&gt;</code>
    * [.set(key, data, eol)](#FileCache.set) ⇒ <code>Promise.&lt;void&gt;</code>
    * [.setStream(key, stream, eol)](#FileCache.setStream) ⇒ <code>Promise.&lt;void&gt;</code>
    * [.setEOL(key, eol)](#FileCache.setEOL) ⇒ <code>Promise.&lt;void&gt;</code>

<a name="FileCache.get"></a>

### FileCache.get(key) ⇒ <code>Promise.&lt;Buffer&gt;</code>
Get cached data for the given key

**Kind**: static method of [<code>FileCache</code>](#FileCache)  

| Param | Type | Description |
| --- | --- | --- |
| key | <code>String</code> | The key |

<a name="FileCache.getStream"></a>

### FileCache.getStream(key) ⇒ <code>Promise.&lt;ReadableStream&gt;</code>
Get cached data as a stream for the given key

**Kind**: static method of [<code>FileCache</code>](#FileCache)  

| Param | Type | Description |
| --- | --- | --- |
| key | <code>String</code> | The key |

<a name="FileCache.set"></a>

### FileCache.set(key, data, eol) ⇒ <code>Promise.&lt;void&gt;</code>
Set cached data at the given key

**Kind**: static method of [<code>FileCache</code>](#FileCache)  

| Param | Type | Description |
| --- | --- | --- |
| key | <code>String</code> | The key |
| data | <code>Buffer</code> | The data to store |
| eol | <code>Number</code> | The resource invalidity timestamp |

<a name="FileCache.setStream"></a>

### FileCache.setStream(key, stream, eol) ⇒ <code>Promise.&lt;void&gt;</code>
Set cached data via a stream at the given key

**Kind**: static method of [<code>FileCache</code>](#FileCache)  

| Param | Type | Description |
| --- | --- | --- |
| key | <code>String</code> | The key |
| stream | <code>ReadableStream</code> | The data to store as a readable stream |
| eol | <code>Number</code> | The resource invalidity timestamp |

<a name="FileCache.setEOL"></a>

### FileCache.setEOL(key, eol) ⇒ <code>Promise.&lt;void&gt;</code>
Set end of life to the given key (may be use to either delete
 or increase a key lifetime).

**Kind**: static method of [<code>FileCache</code>](#FileCache)  

| Param | Type | Description |
| --- | --- | --- |
| key | <code>String</code> | The key |
| eol | <code>Number</code> | The resource invalidity timestamp |

