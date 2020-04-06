// Client-only version of Youtify.
// Server-side spotify logging with app.js is broken for now

var express = require('express');
var app = express();
app.use(express.static(__dirname + '/public'));

var port = 8888;
console.log('Listening on ' + port);
app.listen(port);
