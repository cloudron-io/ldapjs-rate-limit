'use strict';

var defaults = require('defaults'),
    ldapjs = require('ldapjs');

var MemoryStore = require('./memory-store');

function RateLimit(options) {

    options = defaults(options, {
        // window, delay, and max apply per-key unless global is set to true
        windowMs: 60 * 1000, // milliseconds - how long to keep records of requests in memory
        delayAfter: 1, // how many requests to allow through before starting to delay responses
        delayMs: 1000, // milliseconds - base delay applied to the response - multiplied by number of recent hits for the same key.
        max: 5, // max number of recent connections during `window` milliseconds before limiting access
        message : 'Too many requests, please try again later.',
        errorType: ldapjs.BusyError,
        keyGenerator: function (req /*, res*/) {
            // return req.connection.ldap.id;
            return req.connection.ldap.id.split(':')[0];
        },
        skip: function (/*req, res*/) {
            return false;
        },
        handler: function (req, res, next) {
            next(new options.errorType(options.message));
        }
    });

    // store to use for persisting rate limit data
    options.store = options.store || new MemoryStore(options.windowMs);

    // ensure that the store has the incr method
    if (typeof options.store.incr !== 'function' || typeof options.store.resetKey !== 'function') {
        throw new Error('The store is not valid.');
    }

    if (options.global) {
        throw new Error('The global option was removed from express-rate-limit v2.');
    }

    function rateLimit(req, res, next) {
        if (options.skip(req, res)) return next();

        var key = options.keyGenerator(req, res);

        options.store.incr(key, function (error, current) {
            if (error) return next(error);

            req.rateLimit = {
                limit: options.max,
                remaining: Math.max(options.max - current, 0)
            };

            if (options.max && current > options.max) {
                return options.handler(req, res, next);
            }

            if (options.delayAfter && options.delayMs && current > options.delayAfter) {
                var delay = (current - options.delayAfter) * options.delayMs;
                return setTimeout(next, delay);
            }

            next();
        });
    }

    rateLimit.resetKey = options.store.resetKey.bind(options.store);

    return rateLimit;
}

module.exports = RateLimit;
