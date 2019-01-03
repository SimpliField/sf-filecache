import nodeFs from 'fs';
import ms from 'ms';
import path from 'path';
import sanitize from 'sanitize-filename';
import firstChunkStream from 'first-chunk-stream';
import YError from 'yerror';
import { autoService } from 'knifecycle';

const DEFAULT_FS_CACHE_TTL = ms('3h');
const HEADER_FLAG = 'BUCK';
const HEADER_SIZE = HEADER_FLAG.length + 16; // 16 is for Double (16 * 8 === 64)
const noop = () => {};

/* Architecture Note #1: File cache

This repository uses `Knifecycle` to declare the service so that
 you can safely use it with any DI system.
*/

export default autoService(initFileCache);

/**
 * Instantiate the file cache service
 * @param  {Object}     services
 * The services to inject
 * @param  {Function}   [services.log]
 * A logging function
 * @param  {Function}   [services.lock]
 * A lock service to avoid race conditions on the same key
 * @param  {Number}     services.FS_CACHE_TTL
 * The store time to live in milliseconds
 * @param  {String}        [services.FS_CACHE_DIR]
 * The store for values as a simple object, it is useful
 *  to get a synchronous access to the store in tests
 *  for example.
 * @return {Promise<FileCache>}
 * A promise of the file cache service
 * @example
 * import initFileCache from 'sf-filecache';
 * import initLock from 'common-services/dist/lock';
 * import initDelay from 'common-services/dist/delay';
 *
 * const delay = await initDelay({});
 * const lock = await initLock({ delay });
 * const fileCache = await initFileCache({
 *   FS_CACHE_DIR: '_cache/dir',
 *   lock,
 * });
 */
async function initFileCache({
  FS_CACHE_DIR,
  FS_CACHE_TTL = DEFAULT_FS_CACHE_TTL,
  time = Date.now.bind(Date),
  lock,
  log = noop,
  fs = nodeFs,
}) {
  /**
   * @typedef {Object} FileCache
   */
  const fileCache = {
    get,
    getStream,
    set,
    setStream,
    setEOL,
  };

  log('debug', 'Simple File Cache Service initialized.');

  /**
   * Get cached data for the given key
   * @memberof FileCache
   * @param  {String}   key The key
   * @return {Promise<Buffer>}
   */
  async function get(key) {
    return new Promise((resolve, reject) => {
      fs.readFile(_keyToPath({ FS_CACHE_DIR }, key), (err, data) => {
        let bucketHeader = null;

        // Doesn't exist or couldn't access the file
        if (err) {
          reject(YError.cast(err, 'E_NOENT', key));
          return;
        }

        try {
          bucketHeader = _decodeHeader(data);
        } catch (err) {
          reject(err);
          return;
        }

        // Check eol, if the date is past, just by-pass it
        if (bucketHeader.eol < time()) {
          reject(new YError('E_END_OF_LIFE', bucketHeader.eol));
          return;
        }

        // Remove bucket header
        data = data.slice(HEADER_SIZE);

        resolve(data);
      });
    });
  }

  /**
   * Get cached data as a stream for the given key
   * @memberof FileCache
   * @param  {String}   key The key
   * @return {Promise<ReadableStream>}
   */
  async function getStream(key) {
    return new Promise((resolve, reject) => {
      let stream = null;
      let bucketHeader = null;

      stream = fs.createReadStream(_keyToPath({ FS_CACHE_DIR }, key));
      stream.on('error', err => {
        reject(YError.cast(err, 'E_NOENT', key));
      });

      stream = stream.pipe(
        firstChunkStream(
          {
            chunkLength: HEADER_SIZE,
          },
          (err, chunk, enc, firstChunkCb) => {
            if (err) {
              reject(YError.cast(err, 'E_UNEXPECTED'));
              return;
            }
            try {
              bucketHeader = _decodeHeader(chunk);
            } catch (err) {
              reject(err);
              return;
            }

            // Check eol, if the date is past, just by-pass it
            if (bucketHeader.eol < time()) {
              reject(new YError('E_END_OF_LIFE', bucketHeader.eol));
              return;
            }

            // Push back the chunk rest
            setImmediate(firstChunkCb.bind(null, null, Buffer.from('')));

            // Bring the stream to consumer
            resolve(stream);
          },
        ),
      );

      stream.on('error', err => {
        reject(YError.cast(err, 'E_NOENT', key));
      });
    });
  }

  /**
   * Set cached data at the given key
   * @memberof FileCache
   * @param  {String}   key The key
   * @param  {Buffer}   data The data to store
   * @param  {Number}   eol The resource invalidity timestamp
   * @return {Promise<void>}
   */
  async function set(key, data, eol = time() + FS_CACHE_TTL) {
    const header = _encodeHeader({
      eol: eol,
    });
    const dest = _keyToPath({ FS_CACHE_DIR }, key);

    // Check eol, if the date is past, fail
    if (eol < time()) {
      throw new YError('E_END_OF_LIFE', eol);
    }

    await lock.take(key);

    try {
      await new Promise((resolve, reject) => {
        try {
          fs.writeFile(
            dest + '.tmp',
            Buffer.concat([header, data]),
            {
              flags: 'wx', // Avoid writing concurrently to the same path
            },
            err => {
              if (err) {
                reject(YError.cast(err, 'E_ACCESS', key));
                return;
              }
              fs.unlink(dest, () => {
                fs.rename(dest + '.tmp', dest, err => {
                  if (err) {
                    reject(err);
                    return;
                  }
                  resolve();
                });
              });
            },
          );
        } catch (err) {
          reject(YError.cast(err, 'E_ACCESS', key));
        }
      });
      await lock.release(key);
    } catch (err) {
      await lock.release(key);
      throw err;
    }
  }

  /**
   * Set cached data via a stream at the given key
   * @memberof FileCache
   * @param  {String}   key The key
   * @param  {ReadableStream}   stream The data to store as a readable stream
   * @param  {Number}   eol The resource invalidity timestamp
   * @return {Promise<void>}
   */
  async function setStream(key, stream, eol = time() + FS_CACHE_TTL) {
    const header = _encodeHeader({
      eol: eol,
    });
    const dest = _keyToPath({ FS_CACHE_DIR }, key);
    let writableStream;

    eol = eol || 0xffffffffffffffff;

    // Check eol, if the date is past, fail
    if (eol < time()) {
      throw new YError('E_END_OF_LIFE', eol);
    }

    await lock.take(key);

    try {
      writableStream = fs.createWriteStream(dest + '.tmp', {
        flags: 'wx', // Avoid writing concurrently to the same path
      });

      await new Promise((resolve, reject) => {
        writableStream.on('error', err => {
          reject(YError.cast(err, 'E_ACCESS', key));
        });
        writableStream.once('finish', () => {
          fs.rename(dest + '.tmp', dest, err => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          });
        });
        writableStream.write(header);
        stream.pipe(writableStream);
      });
      await lock.release(key);
    } catch (err) {
      await lock.release(key);
      throw YError.cast(err, 'E_ACCESS', key);
    }
  }

  /**
   * Set end of life to the given key (may be use to either delete
   *  or increase a key lifetime).
   * @memberof FileCache
   * @param  {String}   key The key
   * @param  {Number}   eol The resource invalidity timestamp
   * @return {Promise<void>}
   */
  async function setEOL(key, eol = time() + FS_CACHE_TTL) {
    // Past EOL means remove the file
    if (eol < time()) {
      await lock.take(key);

      try {
        await new Promise((resolve, reject) => {
          fs.unlink(_keyToPath({ FS_CACHE_DIR }, key), err => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          });
        });
        return;
      } catch (err) {
        await lock.release(key);
        throw err;
      }
    }

    // Updating the EOL
    try {
      await new Promise((resolve, reject) => {
        fs.open(_keyToPath({ FS_CACHE_DIR }, key), 'r+', (err, fd) => {
          let header = null;

          if (err) {
            reject(err);
            return;
          }
          header = _encodeHeader({
            eol: eol,
          });

          fs.write(fd, header, 0, HEADER_SIZE, 0, (err2, numBytesWritten) => {
            if (err2) {
              fs.close(fd);
              reject(err2);
              return;
            }
            if (numBytesWritten !== HEADER_SIZE) {
              fs.close(fd, err3 => {
                reject(new YError('E_BAD_WRITE', numBytesWritten));
                if (err3) {
                  log('error', 'Could not close the file descriptor.');
                  log('stack', YError.cast(err3, key));
                }
              });
            }
            fs.close(fd, err => {
              if (err) {
                reject(err);
                return;
              }
              resolve();
            });
          });
        });
      });
      await lock.release(key);
      return;
    } catch (err) {
      await lock.release(key);
      throw err;
    }
  }

  return fileCache;
}

/* Architecture Note #1.1: Path

To ensure the key will be compatible with the File System, we need
 to clean it up.
*/
export function _keyToPath({ FS_CACHE_DIR }, key) {
  return path.join(FS_CACHE_DIR, '__' + sanitize(key) + '.bucket');
}

/* Architecture Note #1.2: Header

The header allows to store the cache end of life along
 with the cached buffer so that we do not need to store
 extra contents elsewhere.
*/
export function _encodeHeader(header) {
  const data = Buffer.from(
    'BUCKxxxxxxxxxxxxxxxx'.split('').map(char => char.charCodeAt(0)),
  );

  header = header || {};
  header.eol = header.eol || 0;

  data.writeDoubleLE(header.eol, HEADER_FLAG.length, true);

  return data;
}

export function _decodeHeader(data) {
  const bucketHeader = {
    eol: 0,
  };

  // Check bucket header integrity (starts with a BUCK flag and has a length
  // of 24 bytes)
  if (HEADER_SIZE > data.length) {
    throw new YError('E_BAD_HEADER_SIZE', data.length);
  }
  if (HEADER_FLAG.split('').some((char, i) => data[i] !== char.charCodeAt(0))) {
    throw new YError('E_BAD_HEADER_FMT', data);
  }

  // Get eol
  bucketHeader.eol = data.readDoubleLE(HEADER_FLAG.length, true);

  return bucketHeader;
}
