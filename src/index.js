'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var mkdirp = require('mkdirp');
var sanitize = require('sanitize-filename');
var firstChunkStream = require('first-chunk-stream');
var YError = require('yerror');

var HEADER_FLAG = 'BUCK';
var HEADER_SIZE = HEADER_FLAG.length + 16; // 16 is for Double (16 * 8 === 64)

/**
 * FileCache constructor
 * @param {Object} options Options of the cache (dir, domain and clock)
 * @return {FileCache} A FileCache instance
 * @api public
 */
function FileCache(options) {
  if(!(this instanceof FileCache)) {
    return new FileCache(options);
  }

  options = options || {};
  this._dir = (options.dir || os.tmpdir());
  this._clock = options.clock || Date.now.bind(Date);

  this._dir = path.join(this._dir, '__nodeFileCache', options.domain || '_');

  mkdirp(this._dir);
}

/**
 * Transform a key into a path were to save/read the contents
 * @param  {String} key The key to transform
 * @return {String}     The computed path
 * @api private
 */
FileCache.prototype._keyToPath = function _fileCacheKeyToPath(key) {
  return path.join(this._dir, '__' + sanitize(key) + '.bucket');
};

/**
 * Create a bucket header
 * @param  {Object} header Header description
 * @return {Buffer}        The header contents as a buffer
 * @api private
 */
FileCache.prototype._createHeader = function _fileCacheCreateHeader(header) {
  // Initialize the buffer with the BUCK flag
  var data = new Buffer('BUCKxxxxxxxxxxxxxxxx'.split('').map(function(char) {
    return char.charCodeAt(0);
  }));

  header = header || {};
  header.eol = header.eol || 0;

  data.writeDoubleLE(header.eol, HEADER_FLAG.length, true);

  return data;
};

/**
 * Read the header description from a buffer
 * @param  {Buffer} data The buffer
 * @return {Object}      The header description
 */
FileCache.prototype._readHeader = function _fileCacheReadHeader(data) {
  var bucketHeader = {
    eol: 0,
  };

  // Check bucket header integrity (starts with a BUCK flag and has a length
  // of 24 bytes)
  if(HEADER_SIZE > data.length) {
    throw new YError('E_BAD_HEADER_SIZE', data.length);
  }
  if(HEADER_FLAG.split('').some(function(char, i) {
    return data[i] !== char.charCodeAt(0);
  })) {
    throw new YError('E_BAD_HEADER_FMT', data);
  }

  // Get eol
  bucketHeader.eol = data.readDoubleLE(HEADER_FLAG.length, true);

  return bucketHeader;
};

/**
 * Get cached data for the given key
 * @param  {String}   key The key
 * @param  {Function} cb  The callback ( signature function(err:Error, data:Buffer) {})
 * @return {void}
 */
FileCache.prototype.get = function fileCacheGet(key, cb) {
  var _this = this;

  cb = cb || function() {};

  fs.readFile(this._keyToPath(key), function(err, data) {
    var bucketHeader = null;

    // Doesn't exist or couldn't access the file
    if(err) {
      return cb(YError.wrap(err, 'E_NOENT', key), null);
    }

    try {
      bucketHeader = _this._readHeader(data);
    } catch(err2) {
      return setImmediate(cb.bind(null, err2, null));
    }

    // Check eol, if the date is past, just by-pass it
    if(bucketHeader.eol < _this._clock()) {
      return cb(new YError('E_END_OF_LIFE', bucketHeader.eol), null);
    }

    // Remove bucket header
    data = data.slice(HEADER_SIZE);

    return cb(null, data);
  });
};

/**
 * Get cached data as a stream for the given key
 * @param  {String}   key The key
 * @param  {Function} cb  The callback ( signature function(err:Error, stream:ReadableStream) {})
 * @return {void}
 */
FileCache.prototype.getStream = function fileCacheGetStream(key, cb) {
  var _this = this;
  var stream = null;
  var bucketHeader = null;

  cb = cb || function() {};

  stream = fs.createReadStream(this._keyToPath(key));
  stream.on('error', function(err) {
    setImmediate(cb.bind(this, YError.wrap(err, 'E_NOENT', key), null));
  });

  stream = stream.pipe(firstChunkStream({
    chunkLength: HEADER_SIZE,
  }, function(err, chunk, enc, firstChunkCb) {
    if(err) {
      return cb(YError.wrap(err, 'E_UNEXPECTED'), null);
    }
    try {
      bucketHeader = _this._readHeader(chunk);
    } catch(err2) {
      return cb(err2, null);
    }

    // Check eol, if the date is past, just by-pass it
    if(bucketHeader.eol < _this._clock()) {
      return cb(new YError('E_END_OF_LIFE', bucketHeader.eol), null);
    }

    // Push back the chunk rest
    setImmediate(firstChunkCb.bind(null, null, new Buffer('')));

    // Bring the stream to consumer
    cb(null, stream);
  }));

  stream.on('error', function(err) {
    setImmediate(cb.bind(this, YError.wrap(err, 'E_NOENT', key), null));
  });

};

/**
 * Set cached data at the given key
 * @param  {String}   key The key
 * @param  {Buffer}   data The data to store
 * @param  {Number}   eol The resource invalidity timestamp
 * @param  {Function} cb  The callback ( signature function(err:Error) {})
 * @return {void}
 */
FileCache.prototype.set = function fileCacheSet(key, data, eol, cb) {
  var header = this._createHeader({
    eol: eol,
  });
  var dest = this._keyToPath(key);

  cb = cb || function() {};

  // Check eol, if the date is past, fail
  if(eol < this._clock()) {
    return setImmediate(cb.bind(this, new YError('E_END_OF_LIFE', eol), null));
  }

  fs.writeFile(
    dest + '.tmp',
    Buffer.concat([header, data]), {
      flags: 'wx', // Avoid writing concurrently to the same path
    },
    function(err) {
      if(err) {
        return cb(YError.wrap(err, 'E_ACCESS', key), null);
      }
      fs.unlink(dest, function fileRemoved() {
        fs.rename(dest + '.tmp', dest, cb);
      });
    }
  );
};

/**
 * Set cached data via a stream at the given key
 * @param  {String}   key The key
 * @param  {ReadableStream}   stream The data to store as a readable stream
 * @param  {Number}   eol The resource invalidity timestamp
 * @param  {Function} cb  The callback ( signature function(err:Error) {})
 * @return {void}
 */
FileCache.prototype.setStream = function fileCacheSetStream(key, stream, eol, cb) {
  var header = this._createHeader({
    eol: eol,
  });
  var dest = this._keyToPath(key);
  var writableStream = fs.createWriteStream(dest + '.tmp', {
    flags: 'wx', // Avoid writing concurrently to the same path
  });

  eol = eol || 0xFFFFFFFFFFFFFFFF;
  cb = cb || function() {};

  // Check eol, if the date is past, fail
  if(eol < this._clock()) {
    return setImmediate(cb.bind(this, new YError('E_END_OF_LIFE', eol), null));
  }

  writableStream.once('error', function(err) {
    cb(YError.wrap(err, 'E_ACCESS', key), null);
  });
  writableStream.once('finish', function() {
    fs.rename(dest + '.tmp', dest, cb);
  });
  writableStream.write(header);
  stream.pipe(writableStream);
};


/**
 * Set end of life to the given key
 * @param  {String}   key The key
 * @param  {Number}   eol The resource invalidity timestamp
 * @param  {Function} cb  The callback ( signature function(err:Error) {})
 * @return {void}
 */
FileCache.prototype.setEOL = function fileCacheSetEOL(key, eol, cb) {
  var _this = this;

  eol = eol || 0;
  cb = cb || function() {};

  // Past EOL means remove the file
  if(eol < this._clock()) {
    return fs.unlink(this._keyToPath(key), function(err) {
      if(err) {
        return cb(err);
      }
      return cb(null);
    });
  }

  // Updating the EOL
  fs.open(this._keyToPath(key), 'r+', function(err, fd) {
    var header = null;

    if(err) {
      return cb(err);
    }
    header = _this._createHeader({
      eol: eol,
    });

    fs.write(fd, header, 0, HEADER_SIZE, 0, function(err2, numBytesWritten) {
      if(err2) {
        fs.close(fd);
        return cb(err2);
      }
      if(numBytesWritten !== HEADER_SIZE) {
        cb(new YError('E_BAD_WRITE', numBytesWritten));
        return fs.close(fd);
      }
      fs.close(fd, cb);
    });

    return cb(null);
  });
};

module.exports = FileCache;
