'use strict';

function MemoryStore(windowMs) {
    var hits = {};

    this.incr = function (key, callback) {
        if (hits[key]) hits[key]++;
        else hits[key] = 1;

        callback(null, hits[key]);
    };

    this.resetAll = function () {
        hits = {};
    };

    // export an API to allow hits from one or all identifiers to be reset
    this.resetKey = function (key) {
        delete hits[key];
    };

    // simply reset ALL hits every windowMs
    setInterval(this.resetAll, windowMs).unref();
}

module.exports = MemoryStore;
