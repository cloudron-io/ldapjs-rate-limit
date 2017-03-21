# ldapjs-rate-limit

This is just a port from [express-rate-limit](https://github.com/nfriedly/express-rate-limit) to [ldapjs](http://ldapjs.org/).

## Example

```
var ldapjs = require('ldapjs');
var rateLimit = require('ldapjs-rate-limit');

var server = ldapjs.createServer();

server.search('o=example', rateLimit({ delayMs: 100, delayAfter: 2 }), function (req, res) { res.end(); });

server.listen(389, '127.0.0.1', function () {});

```
