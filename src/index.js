'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const mkdirp = require('mkdirp');
const sanitize = require('sanitize-filename');
const firstChunkStream = require('first-chunk-stream');
const YError = require('yerror');

const HEADER_FLAG = 'BUCK';
const HEADER_SIZE = HEADER_FLAG.length + 16; // 16 is for Double (16 * 8 === 64)

/**
 * FileCache constructor
 * @param {Object} options Options of the cache (dir, domain and clock)
 * @return {FileCache} A FileCache instance
 * @api public
 */
function FileCache(options) {
  if (!(this instanceof FileCache)) {
    return new FileCache(options);
  }

  options = options || {};
  this._dir = options.dir || os.tmpdir();
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
  const data = Buffer.from(
    'BUCKxxxxxxxxxxxxxxxx'.split('').map(char => char.charCodeAt(0))
  );

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
  const bucketHeader = {
    eol: 0,
  };

  // Check bucket header integrity (starts with a BUCK flag and has a length
  // of 24 bytes)
  if (HEADER_SIZE > data.length) {
    throw new YError('E_BAD_HEADER_SIZE', data.length);
  }
  if (
    HEADER_FLAG.split('').some((char, i) => data[i] !== char.charCodeAt(0))
  ) {
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
  const _this = this;

  cb = cb || (() => {});

  fs.readFile(this._keyToPath(key), (err, data) => {
    let bucketHeader = null;

    // Doesn't exist or couldn't access the file
    if (err) {
      cb(YError.wrap(err, 'E_NOENT', key), null);
      return;
    }

    try {
      bucketHeader = _this._readHeader(data);
    } catch (err2) {
      setImmediate(cb.bind(null, err2, null));
      return;
    }

    // Check eol, if the date is past, just by-pass it
    if (bucketHeader.eol < _this._clock()) {
      cb(new YError('E_END_OF_LIFE', bucketHeader.eol), null);
      return;
    }

    // Remove bucket header
    data = data.slice(HEADER_SIZE);

    cb(null, data);
  });
};

/**
 * Get cached data as a stream for the given key
 * @param  {String}   key The key
 * @param  {Function} cb  The callback ( signature function(err:Error, stream:ReadableStream) {})
 * @return {void}
 */
FileCache.prototype.getStream = function fileCacheGetStream(key, cb) {
  const _this = this;
  let stream = null;
  let bucketHeader = null;

  cb = cb || (() => {});

  stream = fs.createReadStream(this._keyToPath(key));
  stream.on('error', err => {
    setImmediate(cb.bind(this, YError.wrap(err, 'E_NOENT', key), null));
  });

  stream = stream.pipe(
    firstChunkStream(
      {
        chunkLength: HEADER_SIZE,
      },
      (err, chunk, enc, firstChunkCb) => {
        if (err) {
          cb(YError.wrap(err, 'E_UNEXPECTED'), null);
          return;
        }
        try {
          bucketHeader = _this._readHeader(chunk);
        } catch (err2) {
          cb(err2, null);
          return;
        }

        // Check eol, if the date is past, just by-pass it
        if (bucketHeader.eol < _this._clock()) {
          cb(new YError('E_END_OF_LIFE', bucketHeader.eol), null);
          return;
        }

        // Push back the chunk rest
        setImmediate(firstChunkCb.bind(null, null, Buffer.from('')));

        // Bring the stream to consumer
        cb(null, stream);
      }
    )
  );

  stream.on('error', err => {
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
  const header = this._createHeader({
    eol: eol,
  });
  const dest = this._keyToPath(key);

  cb = cb || (() => {});

  // Check eol, if the date is past, fail
  if (eol < this._clock()) {
    setImmediate(cb.bind(this, new YError('E_END_OF_LIFE', eol), null));
    return;
  }

  try {
    fs.writeFile(
      dest + '.tmp',
      Buffer.concat([header, data]),
      {
        flags: 'wx', // Avoid writing concurrently to the same path
      },
      err => {
        if (err) {
          cb(YError.wrap(err, 'E_ACCESS', key), null);
          return;
        }
        fs.unlink(dest, function fileRemoved() {
          fs.rename(dest + '.tmp', dest, cb);
        });
      }
    );
  } catch (err) {
    // eslint-disable-next-line
    cb(YError.wrap(err, 'E_ACCESS', key), null);
  }
};

/**
 * Set cached data via a stream at the given key
 * @param  {String}   key The key
 * @param  {ReadableStream}   stream The data to store as a readable stream
 * @param  {Number}   eol The resource invalidity timestamp
 * @param  {Function} cb  The callback ( signature function(err:Error) {})
 * @return {void}
 */
FileCache.prototype.setStream = function fileCacheSetStream(
  key,
  stream,
  eol,
  cb
) {
  const header = this._createHeader({
    eol: eol,
  });
  const dest = this._keyToPath(key);
  let writableStream;

  try {
    writableStream = fs.createWriteStream(dest + '.tmp', {
      flags: 'wx', // Avoid writing concurrently to the same path
    });

    eol = eol || 0xffffffffffffffff;
    cb = cb || (() => {});

    // Check eol, if the date is past, fail
    if (eol < this._clock()) {
      setImmediate(cb.bind(this, new YError('E_END_OF_LIFE', eol), null));
      return;
    }

    writableStream.on('error', err => {
      cb(YError.wrap(err, 'E_ACCESS', key), null);
    });
    writableStream.once('finish', () => {
      fs.rename(dest + '.tmp', dest, cb);
    });
    writableStream.write(header);
    stream.pipe(writableStream);
  } catch (err) {
    // eslint-disable-next-line
    cb(YError.wrap(err, 'E_ACCESS', key), null);
  }
};

/**
 * Set end of life to the given key
 * @param  {String}   key The key
 * @param  {Number}   eol The resource invalidity timestamp
 * @param  {Function} cb  The callback ( signature function(err:Error) {})
 * @return {void}
 */
FileCache.prototype.setEOL = function fileCacheSetEOL(key, eol, cb) {
  const _this = this;

  eol = eol || 0;
  cb = cb || (() => {});

  // Past EOL means remove the file
  if (eol < this._clock()) {
    fs.unlink(this._keyToPath(key), err => {
      if (err) {
        cb(err);
        return;
      }
      cb(null);
    });
    return;
  }

  // Updating the EOL
  fs.open(this._keyToPath(key), 'r+', (err, fd) => {
    let header = null;

    if (err) {
      cb(err);
      return;
    }
    header = _this._createHeader({
      eol: eol,
    });

    fs.write(fd, header, 0, HEADER_SIZE, 0, (err2, numBytesWritten) => {
      if (err2) {
        fs.close(fd);
        cb(err2);
        return;
      }
      if (numBytesWritten !== HEADER_SIZE) {
        fs.close(fd);
        cb(new YError('E_BAD_WRITE', numBytesWritten));
        return;
      }
      fs.close(fd, cb);
    });

    cb(null);
  });
};

module.exports = FileCache;
