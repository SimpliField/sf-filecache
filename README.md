# sf-filecache
> Simple and smart FS based cache system.

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
