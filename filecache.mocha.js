'use strict';

var assert = require('assert');
var streamtest = require('streamtest');
var mockery = require('mockery');
var time = require('../../stubs/time')();
var Stream = require('stream');

describe('FileCache', function() {
  var fileCache;

  before(function() {
    time.setTime(1267833600000);
  });

  describe('_keyToPath()', function() {

    before(function() {
      fileCache = new (require('../../../services/filecache'))();
    });

    it('should work as expected', function() {
      assert.equal(
        fileCache._keyToPath('/plop/wadup/?kikoo=lol'),
        '/tmp/__nodeFileCache/_/__plopwadupkikoo=lol.bucket'
      );
    });

  });

  describe('_createHeader()', function() {

    before(function() {
      fileCache = new (require('../../../services/filecache'))();
    });

    it('should work as expected', function() {
      assert.deepEqual(
        fileCache._createHeader({
          eol: 12,
        }),
        new Buffer([
          66, 85, 67, 75, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 40, 64,
          120, 120, 120, 120, 120, 120, 120, 120,
        ])
      );
    });

  });

  describe('_readHeader()', function() {

    before(function() {
      fileCache = new (require('../../../services/filecache'))();
    });

    it('should work as expected', function() {
      assert.deepEqual(
        fileCache._readHeader(new Buffer([
          66, 85, 67, 75, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 40, 64,
          120, 120, 120, 120, 120, 120, 120, 120,
        ])), {
          eol: 12,
        }
      );
    });

  });

  describe('_keyToPath()', function() {

    before(function() {
      fileCache = new (require('../../../services/filecache'))();
    });

    it('should work as expected', function() {
      assert.equal(
        fileCache._keyToPath('/plop/wadup/?kikoo=lol'),
        '/tmp/__nodeFileCache/_/__plopwadupkikoo=lol.bucket'
      );
    });

  });

  describe('get()', function() {
    var sampleBuffer;

    before(function() {
      mockery.enable({ useCleanCache: true });
      mockery.resetCache();
      mockery.registerAllowable('os');
      mockery.registerAllowable('yerror');
      mockery.registerAllowable('path');
      mockery.registerAllowable('sanitize-filename');
      mockery.registerAllowable('first-chunk-stream');
      mockery.registerAllowable('stream');
      mockery.registerAllowable('util');
      mockery.registerAllowable('../../../services/filecache');
      mockery.registerMock('mkdirp', function() {});
      mockery.registerMock('fs', {
        readFile: function(path, cb) {
          if('plop' === path) {
            return cb(new Error('ENOENT'));
          }
          cb(null, sampleBuffer);
        },
      });
      fileCache = new (require('../../../services/filecache'))({
        clock: time,
      });
    });

    after(function() {
      mockery.deregisterAll();
      mockery.resetCache();
      mockery.disable();
    });

    describe('should work', function() {

      it('with existing up-to-date cached contents', function(done) {
        sampleBuffer = Buffer.concat([
          fileCache._createHeader({ eol: 1267833600000 + 1 }), // header
           new Buffer([0x01, 0x03, 0x03, 0x07]), // content
        ]);

        fileCache.get('plop', function(err, data) {
          if(err) {
            return done(err);
          }
          assert.deepEqual(data, new Buffer([0x01, 0x03, 0x03, 0x07]));
          done();
        });
      });

    });

    describe('should fail', function() {

      it('with unexisting cached contents', function(done) {
        sampleBuffer = null;

        fileCache.get('plip', function(err) {
          assert(err.message, 'ENOENT');
          done();
        });
      });

      it('with existing outdated cached contents', function(done) {
        sampleBuffer = Buffer.concat([
          fileCache._createHeader({ eol: 1267833600000 - 1 }), // header
           new Buffer([0x01, 0x03, 0x03, 0x07]), // content
        ]);

        fileCache.get('plop', function(err, data) {
          assert.equal(err.code, 'E_END_OF_LIFE');
          assert.equal(data, null);
          done();
        });
      });

    });

  });

  describe('set()', function() {
    var sampleBuffer;

    before(function() {
      mockery.enable({ useCleanCache: true });
      mockery.resetCache();
      mockery.registerAllowable('os');
      mockery.registerAllowable('yerror');
      mockery.registerAllowable('path');
      mockery.registerAllowable('sanitize-filename');
      mockery.registerAllowable('first-chunk-stream');
      mockery.registerAllowable('stream');
      mockery.registerAllowable('util');
      mockery.registerAllowable('../../../services/filecache');
      mockery.registerMock('mkdirp', function() {});
      mockery.registerMock('fs', {
        writeFile: function(path, data, cb) {
          if('unauthorized' === path) {
            return cb(new Error('EACCESS'));
          }
          sampleBuffer = data;
          cb(null);
        },
      });
      fileCache = new (require('../../../services/filecache'))({
        clock: time,
      });
    });

    after(function() {
      mockery.deregisterAll();
      mockery.resetCache();
      mockery.disable();
    });

    describe('should work', function() {

      it('when adding cached contents', function(done) {
        fileCache.set('plop', new Buffer([0x01, 0x03, 0x03, 0x07]), 1267833600000, function(err) {
          if(err) {
            return done(err);
          }
          assert.deepEqual(sampleBuffer, Buffer.concat([
            fileCache._createHeader({ eol: 1267833600000 }),
            new Buffer([0x01, 0x03, 0x03, 0x07]),
          ]));
          done();
        });
      });

    });

    describe('should fail', function() {

      it('with outdated end of life', function(done) {
        fileCache.set('plop', new Buffer([0x01, 0x03, 0x03, 0x07]), 1267833600000 - 1, function(err) {
          assert(err.code, 'E_END_OF_LIFE');
          done();
        });
        sampleBuffer = null;
      });

      it('when there is access problems', function(done) {
        fileCache.set('unauthorized', new Buffer([0x01, 0x03, 0x03, 0x07]), 1267833600000 - 1, function(err) {
          assert(err.code, 'E_ACCESS');
          done();
        });
        sampleBuffer = null;
      });

    });

  });

  streamtest.versions.forEach(function(version) {

    describe('for ' + version + ' streams', function() {

      describe('getStream()', function() {
        var sampleStream;

        before(function() {
          mockery.enable({ useCleanCache: true });
          mockery.resetCache();
          mockery.registerAllowable('os');
          mockery.registerAllowable('yerror');
          mockery.registerAllowable('path');
          mockery.registerAllowable('sanitize-filename');
          mockery.registerAllowable('first-chunk-stream');
          mockery.registerAllowable('stream');
          mockery.registerAllowable('util');
          mockery.registerAllowable('../../../services/filecache');
          mockery.registerMock('mkdirp', function() {});
          mockery.registerMock('fs', {
            createReadStream: function() {
              return sampleStream;
            },
          });
          fileCache = new (require('../../../services/filecache'))({
            clock: time,
          });
        });

        after(function() {
          mockery.deregisterAll();
          mockery.resetCache();
          mockery.disable();
        });

        describe('should work', function() {

          it('with existing up-to-date cached contents', function(done) {
            sampleStream = streamtest[version].fromChunks([
              fileCache._createHeader({ eol: time() + 1 }), // header
               new Buffer('kikoolol'), // content
            ]);

            fileCache.getStream('plop', function(err, stream) {
              if(err) {
                return done(err);
              }
              stream.pipe(streamtest[version].toText(function(err2, text) {
                if(err2) {
                  return done(err2);
                }
                assert.equal(text, 'kikoolol');
                done();
              }));
            });
          });

        });

        describe('should fail', function() {

          it('with unexisting cached contents', function(done) {
            sampleStream = new Stream.PassThrough();

            fileCache.getStream('plop', function(err, stream) {
              assert.equal(err.code, 'E_NOENT');
              assert.equal(stream, null);
              done();
            });

            setImmediate(function() {
              sampleStream.emit('error', new Error('ENOENT'));
            });
          });

          it('with existing outdated cached contents', function(done) {
            sampleStream = streamtest[version].fromChunks([
              fileCache._createHeader({ eol: time() - 1 }), // header
               new Buffer('kikoolol'), // content
            ]);

            fileCache.getStream('plop', function(err) {
              assert(err.code, 'E_END_OF_LIFE');
              done();
            });
          });

        });

      });

      describe('setStream()', function() {
        var outputStream;

        before(function() {
          mockery.enable({ useCleanCache: true });
          mockery.resetCache();
          mockery.registerAllowable('os');
          mockery.registerAllowable('yerror');
          mockery.registerAllowable('path');
          mockery.registerAllowable('sanitize-filename');
          mockery.registerAllowable('first-chunk-stream');
          mockery.registerAllowable('stream');
          mockery.registerAllowable('util');
          mockery.registerAllowable('../../../services/filecache');
          mockery.registerMock('mkdirp', function() {});
          mockery.registerMock('fs', {
            createWriteStream: function(path) {
              outputStream = new Stream.Transform();
              if('/tmp/__nodeFileCache/_/__unauthorized.bucket' === path) {
                setImmediate(outputStream.emit.bind(outputStream, 'error', new Error('EACCESS')));
                outputStream._transform = function(chunk, encoding, done) {
                };
              } else {
                outputStream._transform = function(chunk, encoding, done) {
                  this.push(chunk, encoding);
                  done();
                };
              }
              return outputStream;
            },
          });
          fileCache = new (require('../../../services/filecache'))({
            clock: time,
          });
        });

        after(function() {
          mockery.deregisterAll();
          mockery.resetCache();
          mockery.disable();
        });

        describe('should work', function() {

          it('when writing cached contents', function(done) {
            var inputStream = streamtest[version].fromChunks([
               'kik', 'oo', 'lol', // content
            ]);

            fileCache.setStream('plop', inputStream, 1267833600000, function(err) {
              if(err) {
                return done(err);
              }
              outputStream.pipe(streamtest[version].toText(function(err2, text) {
                if(err2) {
                  return done(err2);
                }
                assert.equal(text, Buffer.concat([
                  fileCache._createHeader({ eol: 1267833600000 }),
                  new Buffer('kikoolol'),
                ]).toString());
                done();
              }));
            });
          });

        });

        describe('should fail', function() {

          it('with outdated end of life', function(done) {
            var inputStream = streamtest[version].fromChunks([
               'kik', 'oo', 'lol', // content
            ]);

            fileCache.setStream('plop', inputStream, 1267833600000 - 1, function(err) {
              assert(err.code, 'E_END_OF_LIFE');
              done();
            });
          });

          it('when there is access problems', function(done) {
            var inputStream = streamtest[version].fromChunks([
               'kik', 'oo', 'lol', // content
            ]);

            fileCache.setStream('unauthorized', inputStream, 1267833600000, function(err) {
              assert.equal(err.code, 'E_ACCESS');
              done();
            });
          });

        });

      });

    });

  });

});
