/*global describe, it, beforeEach, afterEach, before */
'use strict';
var ldapjs = require('ldapjs');
var assert = require('assert');
var rateLimit = require('../lib/ldapjs-rate-limit.js');

describe('ldapjs-rate-limit node module', function() {

    var start, delay, app;

    var LDAP_HOST = '127.0.0.1';
    var LDAP_PORT = 1389;
    var LDAP_URL = 'ldap://' + LDAP_HOST + ':' + LDAP_PORT;
    var LDAP_BASE = 'o=example';

    beforeEach(function() {
        start = Date.now();
    });

    afterEach(function() {
        delay = null;
    });

    before(function (done) {
        app = ldapjs.createServer();
        app.listen(LDAP_PORT, LDAP_HOST, done);
    });

    function InvalidStore() {}

    function MockStore() {
      this.incr_was_called = false;
      this.resetKey_was_called = false;

      var self = this;
      this.incr = function(key, cb) {
        self.incr_was_called = true;

        cb(null, 1);
      };

      this.resetKey = function() {
        self.resetKey_was_called = true;
      };
    }

    function request(handler) {
        var client = ldapjs.createClient({ url: LDAP_URL });

        client.search(LDAP_BASE, {}, function (error, result) {
            assert(!error);

            result.on('error', function (error) { handler(error); });
            result.on('end', function (result) {
                delay = Date.now() - start;
                handler();
            });
        });
    }

    it('should not allow the use of a store that is not valid', function(done) {
        try {
            rateLimit({
                store: new InvalidStore()
            });
        } catch(e) {
            return done();
        }

        done(new Error('It allowed an invalid store'));
    });

    it('should call incr on the store', function (done) {
      var store = new MockStore();

      app.search(LDAP_BASE, rateLimit({ store: store }), function (req, res) { res.end(); });

      var client = ldapjs.createClient({ url: LDAP_URL });

      client.search(LDAP_BASE, {}, function (error, result) {
          assert(!error);

          result.on('error', function (error) { done(error); });
          result.on('end', function (result) {
              if (!store.incr_was_called) {
                  done(new Error('incr was not called on the store'));
              } else {
                  done();
              }
          });
      });
    });

    it('should call resetKey on the store', function (done) {
        var store = new MockStore();
        var limiter = rateLimit({
            store: store
        });

        limiter.resetKey('key');

        if (!store.resetKey_was_called) {
            done(new Error('resetKey was not called on the store'));
        } else {
            done();
        }
    });

    it('should allow the first request with minimal delay', function (done) {
        app.search(LDAP_BASE, rateLimit(), function (req, res) { res.end(); });

        request(function (error) {
            assert(!error);

            if (delay > 99) {
                done(new Error('First request took too long: ' + delay + 'ms'));
            } else {
                done();
            }
        });
    });

    it('should apply a small delay to the second request', function (done) {
        app.search(LDAP_BASE, rateLimit({ delayMs: 100 }), function (req, res) { res.end(); });

        request(function (error) {
            assert(!error);
            if (delay > 99) done(new Error("First request took too long: " + delay + "ms"));
        });

        request(function (error) {
            assert(!error);

            if (delay < 100) return done(new Error("Second request was served too fast: " + delay + "ms"));
            if (delay > 199) return done(new Error("Second request took too long: " + delay + "ms"));
            done();
        });
    });

    it('should apply a larger delay to the subsequent request', function(done) {
        app.search(LDAP_BASE, rateLimit({ delayMs: 100 }), function (req, res) { res.end(); });

        request(function (error) { assert(!error); });
        request(function (error) { assert(!error); });
        request(function (error) { assert(!error); });

        request(function (error) {
            assert(!error);

            // should be about 300ms delay on 4th request - because the multiplier starts at 0
            if (delay < 300) {
                return done(new Error("Fourth request was served too fast: " + delay + "ms"));
            }
            if (delay > 400) {
                return done(new Error("Fourth request took too long: " + delay + "ms"));
            }
            done();
        });
    });

    it('should allow delayAfter requests before delaying responses', function (done) {
        app.search(LDAP_BASE, rateLimit({ delayMs: 100, delayAfter: 2 }), function (req, res) { res.end(); });

        request(function (error) {
            assert(!error);
            if (delay > 50) done(new Error("First request took too long: " + delay + "ms"));
        });

        request(function (error) {
            assert(!error);
            if (delay > 100) done(new Error("First request took too long: " + delay + "ms"));
        });

        request(function (error) {
            assert(!error);
            if (delay < 100) done(new Error("First request took too long: " + delay + "ms"));
            if (delay > 150) return done(new Error("Second request took too long: " + delay + "ms"));
            done();
        });
    });

    it('should allow delayAfter to be disabled entirely', function (done) {
        app.search(LDAP_BASE, rateLimit({ delayMs: 1000, delayAfter: 0 }), function (req, res) { res.end(); });

        request(function (error) { assert(!error); });
        request(function (error) { assert(!error); });
        request(function (error) { assert(!error); });

        request(function (error) {
            assert(!error);
            // should be about 300ms delay on 4th request - because the multiplier starts at 0
            if (delay > 100) return done(new Error("Fourth request was served too fast: " + delay + "ms"));
            done();
        });
    });

    it('should refuse additional connections once IP has reached the max', function (done) {
        app.search(LDAP_BASE, rateLimit({ delayMs: 0, max: 2 }), function (req, res) { res.end(); });

        request(function (error) { assert(!error); });
        request(function (error) { assert(!error); });

        request(function (error) { assert(error); done(); });
    });

    it('should allow max to be disabled entirely', function (done) {
        app.search(LDAP_BASE, rateLimit({ delayMs: 1, max: 0 }), function (req, res) { res.end(); });

        request(function (error) { assert(!error); });
        request(function (error) { assert(!error); });
        request(function (error) { assert(!error); });
        request(function (error) { assert(!error); done(); });
    });

    it('should show the provided message instead of the default message when max connections are reached', function (done) {
        app.search(LDAP_BASE, rateLimit({ delayMs: 0, max: 2, message: 'foobar' }), function (req, res) { res.end(); });

        request(function (error) { assert(!error); });
        request(function (error) { assert(!error); });
        request(function (error) { assert(error.message === 'foobar'); done(); });
    });

    it('should (eventually) accept new connections from a blocked IP', function (done) {
        app.search(LDAP_BASE, rateLimit({ delayMs: 100, max: 2, windowMs: 50 }), function (req, res) { res.end(); });

        request(function (error) { assert(!error); });
        request(function (error) { assert(!error); });
        request(function (error) { assert(error); });

        setTimeout(function() {
            start = Date.now();
            request(function (error) {
                assert(!error);
                if (delay > 50) done(new Error("Eventual request took too long: " + delay + "ms"));
                else done();
            });
        }, 60);
    });

    it('should work repeatedly', function(done) {
        app.search(LDAP_BASE, rateLimit({ delayMs: 100, max: 2, windowMs: 50 }), function (req, res) { res.end(); });

        request(function (error) { assert(!error); });
        request(function (error) { assert(!error); });
        request(function (error) { assert(error); });

        setTimeout(function() {
            start = Date.now();
            request(function (error) {
                assert(!error);

                if (delay > 50) {
                    done(new Error("Eventual request took too long: " + delay + "ms"));
                } else {
                    request(function (error) { assert(!error); });
                    request(function (error) { assert(error); });

                    setTimeout(function() {
                        start = Date.now();

                        request(function (error) {
                            assert(!error);
                            if (delay > 50) done(new Error("Eventual request took too long: " + delay + "ms"));
                            else done();
                        });
                    }, 60);
                }
            });
        }, 60);
    });

    it('should allow the error type to be customized', function(done) {
        var errorType = ldapjs.UnavailableError;

        app.search(LDAP_BASE, rateLimit({ delayMs: 0, max: 1, errorType: errorType }), function (req, res) { res.end(); });

        request(function (error) { assert(!error); });
        request(function (error) { assert(error.code === new errorType().code); done(); });
    });

    it ('should use the custom handler when specified', function (done) {
        app.search(LDAP_BASE, rateLimit({
            delayMs: 0,
            max: 1,
            handler: function (req, res, next) {
                next(new ldapjs.OtherError('foobar'));
            }
        }), function (req, res) { res.end(); });

        request(function (error) { assert(!error); });
        request(function (error) { assert(error.message === 'foobar'); done(); });
    });

    it ('should allow custom key generators', function (done) {
        var called = false;
        app.search(LDAP_BASE, rateLimit({
            delayMs: 0,
            max: 1,
            keyGenerator: function (req, res) {
                called = true;
                return req.connection.ldap.id.split(':')[0];
            }
        }), function (req, res) { res.end(); });

        request(function (error) { assert(!error); });
        request(function (error) { assert(error); assert(called); done(); });
    });

    it ('should allow custom skip function', function (done) {
        app.search(LDAP_BASE, rateLimit({
            delayMs: 0,
            max: 2,
            skip: function (req, res) {
                assert.ok(req);
                assert.ok(res);

                return true;
            }
        }), function (req, res) { res.end(); });

        request(function (error) { assert(!error); });
        request(function (error) { assert(!error); });
        // 3rd request would normally fail but we're skipping it
        request(function (error) { assert(!error); done(); });
    });

    it('should allow individual id to be reset', function(done) {
        var limiter = rateLimit({ delayMs: 100, max: 1, windowMs: 50 });
        app.search(LDAP_BASE, limiter, function (req, res) { res.end(); });

        request(function (error) { assert(!error); });
        // during local testing the host and client id are the same
        request(function (error) {
            assert(error);

            limiter.resetKey(LDAP_HOST);
            
            request(function (error) { assert(!error); done(); });
        });
    });
});
