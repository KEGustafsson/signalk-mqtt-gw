const aedes = require('aedes')();
const server = require('net').createServer(aedes.handle);
const port = 1883; // MQTT default port

// Create a MQTT client to publish JSON data
const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://localhost');

client.on('connect', function () {
  console.log('Connected to MQTT broker');

  // Example JSON data
  const jsonData = {
    temperature: 25,
    humidity: 60,
    timestamp: new Date().toISOString()
  };

  // Publish the JSON data to a topic
  client.publish('sensor/data', JSON.stringify(jsonData), function (err) {
    if (err) {
      console.error('Error publishing message:', err);
    } else {
      console.log('JSON data published successfully');
    }

    // Disconnect the client after publishing
    //client.end();
  });
});
