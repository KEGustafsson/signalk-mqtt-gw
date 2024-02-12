const id = 'signalk-mqtt-gw';
const debug = require('debug')(id);
const aedes = require('aedes')();
const mqttServer = require('net').createServer(aedes.handle);
const mqtt = require('mqtt');

module.exports = function(app) {
  var plugin = {
    unsubscribes: [],
    outgoingMessages: [], // Store outgoing messages in memory
  };
  var server;

  plugin.id = id;
  plugin.name = 'Signal K - MQTT Gateway';
  plugin.description =
    'plugin that provides gateway functionality between Signal K and MQTT';

  plugin.schema = {
    title: 'Signal K - MQTT Gateway',
    type: 'object',
    required: ['port'],
    properties: {
      runLocalServer: {
        type: 'boolean',
        title: 'Run local server (publish all deltas there in individual topics based on SK path and convert all data published in them by other clients to SK deltas)',
        default: false,
      },
      port: {
        type: 'number',
        title: 'Local server port',
        default: 1883,
      },
      sendToRemote: {
        type: 'boolean',
        title: 'Send data for paths listed below to remote server',
        default: false,
      },
      remoteHost: {
        type: 'string',
        title: 'MQTT server Url (starts with mqtt/mqtts)',
        description:
          'MQTT server that the paths listed below should be sent to',
        default: 'mqtt://somehost',
      },
      username: {
        type: "string",
        title: "MQTT server username"
      },
      password: {
        type: "string",
        title: "MQTT server password"
      },
      rejectUnauthorized: {
        type: "boolean",
        default: false,
        title: "Reject self signed and invalid server certificates"
      },
      paths: {
        type: 'array',
        title: 'Signal K self paths to send',
        default: [{ path: 'navigation.position', interval: 60 }],
        items: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              title: 'Path',
            },
            interval: {
              type: 'number',
              title:
                'Minimum interval between updates for this path to be sent to the server',
            },
          },
        },
      },
    },
  };

  var started = false;
  var ad;

  plugin.onStop = [];

  plugin.start = function(options) {
    plugin.onStop = [];

    if (options.runLocalServer) {
      startLocalServer(options, plugin.onStop);
    }
    if (options.sendToRemote) {
      startSending(options, plugin.onStop);
    }

    mqttServer.listen(options.port, function() {
      console.log('Aedes MQTT server is up and running on port ' + options.port);
    });

    started = true;
  };

  plugin.stop = function() {
    plugin.onStop.forEach(f => f());
    mqttServer.close();
    aedes.close();
  };

  return plugin;

  function startSending(options, onStop) {
    const client = mqtt.connect(options.remoteHost, {
      rejectUnauthorized: options.rejectUnauthorized,
      reconnectPeriod: 60000,
      clientId: app.selfId,
      username: options.username,
      password: options.password
    });

    client.on('error', (err) => console.error(err))

    client.on('connect', function () {
      console.log('Connected to remote MQTT server');
      // Resend any stored outgoing messages
      plugin.outgoingMessages.forEach(message => {
        client.publish(message.topic, message.payload, message.options);
      });
    });

    client.on('offline', function () {
      console.log('Disconnected from remote MQTT server');
    });

    plugin.paths.forEach(pathInterval => {
      onStop.push(
        app.streambundle
          .getSelfBus(pathInterval.path)
          .debounceImmediate(pathInterval.interval * 1000)
          .onValue(normalizedPathValue => {
            const message = {
              topic: 'signalk/delta',
              payload: JSON.stringify({
                context: 'vessels.' + app.selfId,
                updates: [
                  {
                    timestamp: normalizedPathValue.timestamp,
                    $source: normalizedPathValue.$source,
                    values: [
                      {
                        path: pathInterval.path,
                        value: normalizedPathValue.value,
                      },
                    ],
                  },
                ],
              }),
              options: { qos: 1 }
            };
            if (client.connected) {
              client.publish(message.topic, message.payload, message.options);
            } else {
              plugin.outgoingMessages.push(message);
            }
          })
      );
    });

    onStop.push(_ => client.end());
  }

  function startLocalServer(options, onStop) {
    aedes.authenticate = function(client, username, password, callback) {
      // Your authentication logic here
      callback(null, true); // Accept all connections for now
    };

    aedes.authorizePublish = function(client, packet, callback) {
      // Your authorization logic here
      callback(null); // Allow all publishes for now
    };

    aedes.authorizeSubscribe = function(client, sub, callback) {
      // Your authorization logic here
      callback(null, sub); // Allow all subscriptions for now
    };

    aedes.on('client', function(client) {
      console.log('Client connected: ', client.id);
    });

    aedes.on('clientDisconnect', function(client) {
      console.log('Client disconnected: ', client.id);
    });

    aedes.on('publish', function(packet, client) {
      if (client) {
        var skData = extractSkData(packet);
        if (skData.valid) {
          app.handleMessage(id, toDelta(skData, client));
        }
      }
    });

    mqttServer.on('listening', function() {
      console.log(
        'Aedes MQTT server is up and running on port ' + options.port
      );
    });

    onStop.push(_ => { mqttServer.close() });
  }

  function toDelta(skData, client) {
    return {
      context: skData.context,
      updates: [
        {
          $source: 'mqtt.' + client.id.replace(/\//g, '_').replace(/\./g, '_'),
          values: [
            {
              path: skData.path,
              value: skData.value,
            },
          ],
        },
      ],
    };
  }

  function extractSkData(packet) {
    const result = {
      valid: false,
    };
    const pathParts = packet.topic.split('/');
    if (
      pathParts.length < 3 ||
      pathParts[0] != 'vessels' ||
      pathParts[1] != 'self'
    ) {
      return result;
    }
    result.context = 'vessels.' + app.selfId;
    result.path = pathParts.splice(2).join('.');
    if (packet.payload) {
      result.value = Number(packet.payload.toString());
    }
    result.valid = true;
    return result;
  }
};
