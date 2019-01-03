/* eslint max-nested-callbacks:[1,6], func-names:[0] */

import assert from 'assert';
import streamtest from 'streamtest';
import initTime from 'sf-time-mock';
import Stream from 'stream';
import YError from 'yerror';
import os from 'os';
import sinon from 'sinon';
import initFileCache, { _keyToPath, _encodeHeader, _decodeHeader } from './';

describe('File Cache', () => {
  const FS_CACHE_DIR = os.tmpdir() + '/__nodeFileCache';
  const FS_CACHE_TTL = 3600;
  const log = sinon.stub();
  const lock = {
    take: sinon.stub(),
    release: sinon.stub(),
  };

  beforeEach(() => {
    lock.take.reset();
    lock.release.reset();
  });

  describe('_keyToPath()', () => {
    it('should work as expected', () => {
      assert.equal(
        _keyToPath({ FS_CACHE_DIR }, '/plop/wadup/?kikoo=lol'),
        `${FS_CACHE_DIR}/__plopwadupkikoo=lol.bucket`,
      );
    });
  });

  describe('_encodeHeader()', () => {
    it('should work as expected', () => {
      assert.deepEqual(
        _encodeHeader({
          eol: 12,
        }),
        Buffer.from([
          66,
          85,
          67,
          75,
          0x0,
          0x0,
          0x0,
          0x0,
          0x0,
          0x0,
          40,
          64,
          120,
          120,
          120,
          120,
          120,
          120,
          120,
          120,
        ]),
      );
    });
  });

  describe('_decodeHeader()', () => {
    it('should work as expected', () => {
      assert.deepEqual(
        _decodeHeader(
          Buffer.from([
            66,
            85,
            67,
            75,
            0x0,
            0x0,
            0x0,
            0x0,
            0x0,
            0x0,
            40,
            64,
            120,
            120,
            120,
            120,
            120,
            120,
            120,
            120,
          ]),
        ),
        {
          eol: 12,
        },
      );
    });
  });

  describe('initFileCache', () => {
    const time = initTime();
    let fs;

    before(() => {
      time.setTime(1267833600000);
    });

    describe('get()', () => {
      let sampleBuffer;

      before(() => {
        fs = {
          readFile: function(path, cb) {
            if (path.includes('plop')) {
              cb(new YError('E_NOENT'));
              return;
            }
            cb(null, sampleBuffer);
          },
        };
      });

      describe('should work', () => {
        it('with existing up-to-date cached contents', async () => {
          const fileCache = await initFileCache({
            FS_CACHE_DIR,
            FS_CACHE_TTL,
            time,
            lock,
            fs,
            log,
          });

          sampleBuffer = Buffer.concat([
            _encodeHeader({ eol: 1267833600000 + 1 }), // header
            Buffer.from([0x01, 0x03, 0x03, 0x07]), // content
          ]);

          const data = await fileCache.get('plip');

          assert.deepEqual(data, Buffer.from([0x01, 0x03, 0x03, 0x07]));
        });
      });

      describe('should fail', () => {
        it('with unexisting cached contents', async () => {
          const fileCache = await initFileCache({
            FS_CACHE_DIR,
            FS_CACHE_TTL,
            time,
            lock,
            fs,
            log,
          });

          sampleBuffer = null;

          try {
            await fileCache.get('plop');
            throw new YError('E_UNEXPECTED_SUCCESS');
          } catch (err) {
            assert.equal(err.code, 'E_NOENT');
          }
        });

        it('with existing outdated cached contents', async () => {
          const fileCache = await initFileCache({
            FS_CACHE_DIR,
            FS_CACHE_TTL,
            time,
            lock,
            fs,
            log,
          });

          sampleBuffer = Buffer.concat([
            _encodeHeader({ eol: 1267833600000 - 1 }), // header
            Buffer.from([0x01, 0x03, 0x03, 0x07]), // content
          ]);

          try {
            await fileCache.get('plip');
            throw new YError('E_UNEXPECTED_SUCCESS');
          } catch (err) {
            assert.equal(err.code, 'E_END_OF_LIFE');
          }
        });
      });
    });

    describe('set()', () => {
      let sampleBuffer;

      before(() => {
        fs = {
          files: [],
          unlink: function(path, cb) {
            delete this.files[path];
            cb(null);
          },
          writeFile: function(path, data, options, cb) {
            if (path.includes('__unauthorized')) {
              cb(new YError('E_ACCESS'));
              return;
            }
            sampleBuffer = data;
            cb(null);
          },
          rename: function(src, dest, cb) {
            if ('unauthorized' === dest) {
              cb(new YError('E_ACCESS'));
              return;
            }
            if (this.files[dest]) {
              cb(new YError('E_EXIST'));
              return;
            }
            this.files[dest] = true;
            cb(null);
          },
        };
      });

      describe('should work', () => {
        it('when adding cached contents', async () => {
          const fileCache = await initFileCache({
            FS_CACHE_DIR,
            FS_CACHE_TTL,
            time,
            lock,
            fs,
            log,
          });

          await fileCache.set(
            'plop',
            Buffer.from([0x01, 0x03, 0x03, 0x07]),
            1267833600000,
          );

          assert.deepEqual(
            sampleBuffer,
            Buffer.concat([
              _encodeHeader({ eol: 1267833600000 }),
              Buffer.from([0x01, 0x03, 0x03, 0x07]),
            ]),
          );
          assert(lock.take.calledOnce, 'Checked the lock');
          assert(lock.release.calledOnce, 'Released the lock');
          assert(
            lock.release.calledAfter(lock.take),
            'Checked the lock in order',
          );

          await fileCache.set(
            'plop',
            Buffer.from([0x01, 0x03, 0x03, 0x07]),
            1267833600000,
          );
          assert.deepEqual(
            sampleBuffer,
            Buffer.concat([
              _encodeHeader({ eol: 1267833600000 }),
              Buffer.from([0x01, 0x03, 0x03, 0x07]),
            ]),
          );
        });
      });

      describe('should fail', () => {
        it('with outdated end of life', async () => {
          const fileCache = await initFileCache({
            FS_CACHE_DIR,
            FS_CACHE_TTL,
            time,
            lock,
            fs,
            log,
          });

          try {
            await fileCache.set(
              'plop',
              Buffer.from([0x01, 0x03, 0x03, 0x07]),
              1267833600000 - 1,
            );
            throw new YError('E_UNEXPECTED_SUCCESS');
          } catch (err) {
            assert.equal(err.code, 'E_END_OF_LIFE');
            assert(!lock.take.called, 'Did not check the lock');
            assert(!lock.release.called, 'Did not release the lock');
          }

          sampleBuffer = null;
        });

        it('when there is access problems', async () => {
          const fileCache = await initFileCache({
            FS_CACHE_DIR,
            FS_CACHE_TTL,
            time,
            lock,
            fs,
            log,
          });

          try {
            await fileCache.set(
              'unauthorized',
              Buffer.from([0x01, 0x03, 0x03, 0x07]),
              1267833600000 + 1,
            );

            throw new YError('E_UNEXPECTED_SUCCESS');
          } catch (err) {
            assert.equal(err.code, 'E_ACCESS');
            assert(lock.take.calledOnce, 'Checked the lock');
            assert(lock.release.calledOnce, 'Released the lock');
            assert(
              lock.release.calledAfter(lock.take),
              'Checked the lock in order',
            );
            sampleBuffer = null;
          }
        });
      });
    });

    streamtest.versions.forEach(function(version) {
      describe('for ' + version + ' streams', () => {
        describe('getStream()', () => {
          let sampleStream;

          before(() => {
            fs = {
              createReadStream: () => sampleStream,
            };
          });

          describe('should work', () => {
            it('with existing up-to-date cached contents', async () => {
              const fileCache = await initFileCache({
                FS_CACHE_DIR,
                FS_CACHE_TTL,
                time,
                lock,
                fs,
                log,
              });

              sampleStream = streamtest[version].fromChunks([
                _encodeHeader({ eol: time() + 1 }), // header
                Buffer.from('kikoolol'), // content
              ]);

              const stream = await fileCache.getStream('plop');

              await new Promise((resolve, reject) => {
                stream.pipe(
                  streamtest[version].toText((err, text) => {
                    if (err) {
                      reject(err);
                      return;
                    }
                    assert.equal(text, 'kikoolol');
                    resolve();
                  }),
                );
              });
            });
          });

          describe('should fail', () => {
            it('with unexisting cached contents', async () => {
              const fileCache = await initFileCache({
                FS_CACHE_DIR,
                FS_CACHE_TTL,
                time,
                lock,
                fs,
                log,
              });

              sampleStream = new Stream.PassThrough();

              setImmediate(() => {
                sampleStream.emit('error', new Error('ENOENT'));
              });

              try {
                await fileCache.getStream('plop');

                throw new YError('E_UNEXPECTED_SUCCESS');
              } catch (err) {
                assert.equal(err.code, 'E_NOENT');
              }
            });

            it('with existing outdated cached contents', async () => {
              const fileCache = await initFileCache({
                FS_CACHE_DIR,
                FS_CACHE_TTL,
                time,
                lock,
                fs,
                log,
              });
              sampleStream = streamtest[version].fromChunks([
                _encodeHeader({ eol: time() - 1 }), // header
                Buffer.from('kikoolol'), // content
              ]);

              try {
                await fileCache.getStream('plop');

                throw new YError('E_UNEXPECTED_SUCCESS');
              } catch (err) {
                assert.equal(err.code, 'E_END_OF_LIFE');
              }
            });
          });
        });

        describe('setStream()', () => {
          let outputStream;

          before(() => {
            outputStream = new Stream.Transform();
            fs = {
              createWriteStream: function(path) {
                if (path.includes('unauthorized')) {
                  setImmediate(
                    outputStream.emit.bind(
                      outputStream,
                      'error',
                      new YError('E_ACCESS'),
                    ),
                  );
                  outputStream._transform = () => {};
                } else {
                  outputStream._transform = function(chunk, encoding, done) {
                    this.push(chunk, encoding);
                    done();
                  };
                }
                return outputStream;
              },
              rename: (src, dest, cb) => {
                if (dest.includes('unauthorized')) {
                  cb(new YError('E_ACCESS'));
                  return;
                }
                cb(null);
              },
            };
          });

          describe('should work', () => {
            it('when writing cached contents', async () => {
              const fileCache = await initFileCache({
                FS_CACHE_DIR,
                FS_CACHE_TTL,
                time,
                lock,
                fs,
                log,
              });
              const inputStream = streamtest[version].fromChunks([
                'kik',
                'oo',
                'lol', // content
              ]);

              const [, text] = await Promise.all([
                fileCache.setStream('plop', inputStream, 1267833600000),
                new Promise((resolve, reject) => {
                  outputStream.on('error', reject).pipe(
                    streamtest[version].toText((err, text) => {
                      if (err) {
                        reject(err);
                        return;
                      }
                      resolve(text);
                    }),
                  );
                }),
              ]);

              assert.equal(
                text,
                Buffer.concat([
                  _encodeHeader({ eol: 1267833600000 }),
                  Buffer.from('kikoolol'),
                ]).toString(),
              );
              assert(lock.take.calledOnce, 'Checked the lock');
              assert(lock.release.calledOnce, 'Released the lock');
              assert(
                lock.release.calledAfter(lock.take),
                'Checked the lock in order',
              );
            });
          });

          describe('should fail', () => {
            it('with outdated end of life', async () => {
              const fileCache = await initFileCache({
                FS_CACHE_DIR,
                FS_CACHE_TTL,
                time,
                lock,
                fs,
                log,
              });
              const inputStream = streamtest[version].fromChunks([
                'kik',
                'oo',
                'lol', // content
              ]);

              try {
                await fileCache.setStream(
                  'plop',
                  inputStream,
                  1267833600000 - 1,
                );

                throw new YError('E_UNEXPECTED_SUCCESS');
              } catch (err) {
                assert.equal(err.code, 'E_END_OF_LIFE');
                assert(!lock.take.called, 'Did not check the lock');
                assert(!lock.release.called, 'Did not release the lock');
              }
            });

            it('when there is access problems', async () => {
              const fileCache = await initFileCache({
                FS_CACHE_DIR,
                FS_CACHE_TTL,
                time,
                lock,
                fs,
                log,
              });
              const inputStream = streamtest[version].fromChunks([
                'kik',
                'oo',
                'lol', // content
              ]);

              try {
                await fileCache.setStream(
                  'unauthorized',
                  inputStream,
                  1267833600000,
                );

                throw new YError('E_UNEXPECTED_SUCCESS');
              } catch (err) {
                assert.equal(err.code, 'E_ACCESS');
                assert(lock.take.calledOnce, 'Checked the lock');
                assert(lock.release.calledOnce, 'Released the lock');
                assert(
                  lock.release.calledAfter(lock.take),
                  'Checked the lock in order',
                );
              }
            });
          });
        });
      });
    });
  });
});
