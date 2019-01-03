/* eslint max-nested-callbacks:[1,6], func-names:[0] */

'use strict';

const assert = require('assert');
const streamtest = require('streamtest');
const mockery = require('mockery');
const time = require('sf-time-mock')();
const Stream = require('stream');
const os = require('os');

describe('FileCache', () => {
  let fileCache;

  before(() => {
    time.setTime(1267833600000);
  });

  describe('_keyToPath()', () => {
    before(() => {
      // eslint-disable-next-line
      fileCache = new (require('./'))();
    });

    it('should work as expected', () => {
      assert.equal(
        fileCache._keyToPath('/plop/wadup/?kikoo=lol'),
        os.tmpdir() + '/__nodeFileCache/_/__plopwadupkikoo=lol.bucket'
      );
    });
  });

  describe('_createHeader()', () => {
    before(() => {
      // eslint-disable-next-line
      fileCache = new (require('./'))();
    });

    it('should work as expected', () => {
      assert.deepEqual(
        fileCache._createHeader({
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
        ])
      );
    });
  });

  describe('_readHeader()', () => {
    before(() => {
      // eslint-disable-next-line
      fileCache = new (require('./'))();
    });

    it('should work as expected', () => {
      assert.deepEqual(
        fileCache._readHeader(
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
          ])
        ),
        {
          eol: 12,
        }
      );
    });
  });

  describe('_keyToPath()', () => {
    before(() => {
      // eslint-disable-next-line
      fileCache = new (require('./'))();
    });

    it('should work as expected', () => {
      assert.equal(
        fileCache._keyToPath('/plop/wadup/?kikoo=lol'),
        os.tmpdir() + '/__nodeFileCache/_/__plopwadupkikoo=lol.bucket'
      );
    });
  });

  describe('get()', () => {
    let sampleBuffer;

    before(() => {
      mockery.enable({ useCleanCache: true });
      mockery.resetCache();
      mockery.registerAllowable('os');
      mockery.registerAllowable('yerror');
      mockery.registerAllowable('path');
      mockery.registerAllowable('sanitize-filename');
      mockery.registerAllowable('first-chunk-stream');
      mockery.registerAllowable('stream');
      mockery.registerAllowable('util');
      mockery.registerAllowable('./');
      mockery.registerMock('mkdirp', () => {});
      mockery.registerMock('fs', {
        readFile: function(path, cb) {
          if ('plop' === path) {
            cb(new Error('ENOENT'));
            return;
          }
          cb(null, sampleBuffer);
        },
      });
      // eslint-disable-next-line
      fileCache = new (require('./'))({
        clock: time,
      });
    });

    after(() => {
      mockery.deregisterAll();
      mockery.resetCache();
      mockery.disable();
    });

    describe('should work', () => {
      it('with existing up-to-date cached contents', function(done) {
        sampleBuffer = Buffer.concat([
          fileCache._createHeader({ eol: 1267833600000 + 1 }), // header
          Buffer.from([0x01, 0x03, 0x03, 0x07]), // content
        ]);

        fileCache.get('plop', function(err, data) {
          if (err) {
            done(err);
            return;
          }
          assert.deepEqual(data, Buffer.from([0x01, 0x03, 0x03, 0x07]));
          done();
        });
      });
    });

    describe('should fail', () => {
      it('with unexisting cached contents', function(done) {
        sampleBuffer = null;

        fileCache.get('plip', err => {
          assert(err.message, 'ENOENT');
          done();
        });
      });

      it('with existing outdated cached contents', function(done) {
        sampleBuffer = Buffer.concat([
          fileCache._createHeader({ eol: 1267833600000 - 1 }), // header
          Buffer.from([0x01, 0x03, 0x03, 0x07]), // content
        ]);

        fileCache.get('plop', function(err, data) {
          assert.equal(err.code, 'E_END_OF_LIFE');
          assert.equal(data, null);
          done();
        });
      });
    });
  });

  describe('set()', () => {
    let sampleBuffer;

    before(() => {
      mockery.enable({ useCleanCache: true });
      mockery.resetCache();
      mockery.registerAllowable('os');
      mockery.registerAllowable('yerror');
      mockery.registerAllowable('path');
      mockery.registerAllowable('sanitize-filename');
      mockery.registerAllowable('first-chunk-stream');
      mockery.registerAllowable('stream');
      mockery.registerAllowable('util');
      mockery.registerAllowable('./');
      mockery.registerMock('mkdirp', () => {});
      mockery.registerMock('fs', {
        files: [],
        unlink: function(path, cb) {
          delete this.files[path];
          cb(null);
        },
        writeFile: function(path, data, options, cb) {
          if (
            os.tmpdir() + '/__nodeFileCache/_/__unauthorized.bucket.tpm' ===
            path
          ) {
            cb(new Error('EACCESS'));
            return;
          }
          sampleBuffer = data;
          cb(null);
        },
        rename: function(src, dest, cb) {
          if ('unauthorized' === dest) {
            cb(new Error('EACCESS'));
            return;
          }
          if (this.files[dest]) {
            cb(new Error('EEXIST'));
            return;
          }
          this.files[dest] = true;
          cb(null);
        },
      });
      // eslint-disable-next-line
      fileCache = new (require('./'))({
        clock: time,
      });
    });

    after(() => {
      mockery.deregisterAll();
      mockery.resetCache();
      mockery.disable();
    });

    describe('should work', () => {
      it('when adding cached contents', function(done) {
        fileCache.set(
          'plop',
          Buffer.from([0x01, 0x03, 0x03, 0x07]),
          1267833600000,
          err => {
            if (err) {
              done(err);
              return;
            }
            assert.deepEqual(
              sampleBuffer,
              Buffer.concat([
                fileCache._createHeader({ eol: 1267833600000 }),
                Buffer.from([0x01, 0x03, 0x03, 0x07]),
              ])
            );
            fileCache.set(
              'plop',
              Buffer.from([0x01, 0x03, 0x03, 0x07]),
              1267833600000,
              err2 => {
                if (err2) {
                  done(err2);
                  return;
                }
                assert.deepEqual(
                  sampleBuffer,
                  Buffer.concat([
                    fileCache._createHeader({ eol: 1267833600000 }),
                    Buffer.from([0x01, 0x03, 0x03, 0x07]),
                  ])
                );
                done();
              }
            );
          }
        );
      });
    });

    describe('should fail', () => {
      it('with outdated end of life', function(done) {
        fileCache.set(
          'plop',
          Buffer.from([0x01, 0x03, 0x03, 0x07]),
          1267833600000 - 1,
          err => {
            assert(err.code, 'E_END_OF_LIFE');
            done();
          }
        );
        sampleBuffer = null;
      });

      it('when there is access problems', function(done) {
        fileCache.set(
          'unauthorized',
          Buffer.from([0x01, 0x03, 0x03, 0x07]),
          1267833600000 - 1,
          err => {
            assert(err.code, 'E_ACCESS');
            done();
          }
        );
        sampleBuffer = null;
      });
    });
  });

  streamtest.versions.forEach(function(version) {
    describe('for ' + version + ' streams', () => {
      describe('getStream()', () => {
        let sampleStream;

        before(() => {
          mockery.enable({ useCleanCache: true });
          mockery.resetCache();
          mockery.registerAllowable('os');
          mockery.registerAllowable('yerror');
          mockery.registerAllowable('path');
          mockery.registerAllowable('sanitize-filename');
          mockery.registerAllowable('first-chunk-stream');
          mockery.registerAllowable('stream');
          mockery.registerAllowable('util');
          mockery.registerAllowable('./');
          mockery.registerMock('mkdirp', () => {});
          mockery.registerMock('fs', {
            createReadStream: () => sampleStream,
          });
          // eslint-disable-next-line
          fileCache = new (require('./'))({
            clock: time,
          });
        });

        after(() => {
          mockery.deregisterAll();
          mockery.resetCache();
          mockery.disable();
        });

        describe('should work', () => {
          it('with existing up-to-date cached contents', function(done) {
            sampleStream = streamtest[version].fromChunks([
              fileCache._createHeader({ eol: time() + 1 }), // header
              Buffer.from('kikoolol'), // content
            ]);

            fileCache.getStream('plop', function(err, stream) {
              if (err) {
                done(err);
                return;
              }
              stream.pipe(
                streamtest[version].toText((err2, text) => {
                  if (err2) {
                    done(err2);
                    return;
                  }
                  assert.equal(text, 'kikoolol');
                  done();
                })
              );
            });
          });
        });

        describe('should fail', () => {
          it('with unexisting cached contents', function(done) {
            sampleStream = new Stream.PassThrough();

            fileCache.getStream('plop', function(err, stream) {
              assert.equal(err.code, 'E_NOENT');
              assert.equal(stream, null);
              done();
            });

            setImmediate(() => {
              sampleStream.emit('error', new Error('ENOENT'));
            });
          });

          it('with existing outdated cached contents', function(done) {
            sampleStream = streamtest[version].fromChunks([
              fileCache._createHeader({ eol: time() - 1 }), // header
              Buffer.from('kikoolol'), // content
            ]);

            fileCache.getStream('plop', err => {
              assert(err.code, 'E_END_OF_LIFE');
              done();
            });
          });
        });
      });

      describe('setStream()', () => {
        let outputStream;

        before(() => {
          mockery.enable({ useCleanCache: true });
          mockery.resetCache();
          mockery.registerAllowable('os');
          mockery.registerAllowable('yerror');
          mockery.registerAllowable('path');
          mockery.registerAllowable('sanitize-filename');
          mockery.registerAllowable('first-chunk-stream');
          mockery.registerAllowable('stream');
          mockery.registerAllowable('util');
          mockery.registerAllowable('./');
          mockery.registerMock('mkdirp', () => {});
          mockery.registerMock('fs', {
            createWriteStream: function(path) {
              outputStream = new Stream.Transform();
              if (
                os.tmpdir() + '/__nodeFileCache/_/__unauthorized.bucket.tmp' ===
                path
              ) {
                setImmediate(
                  outputStream.emit.bind(
                    outputStream,
                    'error',
                    new Error('EACCESS')
                  )
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
              if (
                os.tmpdir() + '/__nodeFileCache/_/__unauthorized.bucket' ===
                dest
              ) {
                cb(new Error('EACCESS'));
                return;
              }
              cb(null);
            },
          });
          // eslint-disable-next-line
          fileCache = new (require('./'))({
            clock: time,
          });
        });

        after(() => {
          mockery.deregisterAll();
          mockery.resetCache();
          mockery.disable();
        });

        describe('should work', () => {
          it('when writing cached contents', function(done) {
            const inputStream = streamtest[version].fromChunks([
              'kik',
              'oo',
              'lol', // content
            ]);

            fileCache.setStream('plop', inputStream, 1267833600000, err => {
              if (err) {
                done(err);
                return;
              }
              outputStream.pipe(
                streamtest[version].toText(function(err2, text) {
                  if (err2) {
                    done(err2);
                    return;
                  }
                  assert.equal(
                    text,
                    Buffer.concat([
                      fileCache._createHeader({ eol: 1267833600000 }),
                      Buffer.from('kikoolol'),
                    ]).toString()
                  );
                  done();
                })
              );
            });
          });
        });

        describe('should fail', () => {
          it('with outdated end of life', function(done) {
            const inputStream = streamtest[version].fromChunks([
              'kik',
              'oo',
              'lol', // content
            ]);

            fileCache.setStream(
              'plop',
              inputStream,
              1267833600000 - 1,
              err => {
                assert(err.code, 'E_END_OF_LIFE');
                done();
              }
            );
          });

          it('when there is access problems', function(done) {
            const inputStream = streamtest[version].fromChunks([
              'kik',
              'oo',
              'lol', // content
            ]);

            fileCache.setStream(
              'unauthorized',
              inputStream,
              1267833600000,
              err => {
                assert.equal(err.code, 'E_ACCESS');
                done();
              }
            );
          });
        });
      });
    });
  });
});
