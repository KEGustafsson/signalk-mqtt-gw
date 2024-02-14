const aedes = require('aedes')();
const server = require('net').createServer(aedes.handle);
const port = 1883; // MQTT default port

server.listen(port, function () {
  console.log('Aedes MQTT broker listening on port', port);
});

server.on('client', function (client) {
  console.log('Client connected', client.id);
},

server.on('clientDisconnect', function (client) {
  console.log('Client disconnected', client.id);
}, 

server.on('clientError', function (client, err) {
  console.log('Client error', client.id, err.message, err.stack);
}, 

server.on('clientReady', function (client) {
  console.log('Client ready', client.id);
}  



