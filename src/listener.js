const {Configuration} = require('@schul-cloud/commons');
const amqp = require('amqplib/callback_api');
const syncer = require('./syncer');

const RABBITMQ_URI = Configuration.get("RABBITMQ_URI");
const RABBIT_MQ_QUEUE = Configuration.get("RABBIT_MQ_QUEUE");

module.exports = {
  listen: listen,
};

function listen() {
  amqp.connect(RABBITMQ_URI, function(error0, connection) {
    if (error0) {
      throw error0;
    }
    connection.createChannel(function(error1, channel) {
      if (error1) {
        throw error1;
      }

      channel.assertQueue(RABBIT_MQ_QUEUE, {
        durable: false
      });

      console.log(" [*] Waiting for messages in %s.", RABBIT_MQ_QUEUE);

      channel.consume(RABBIT_MQ_QUEUE, onMessage, {
        noAck: true //TODO: check this setting
      });
    });
  });
}

function onMessage(msg) {
  console.log(" [x] Received %s", msg.content.toString());
  syncer.syncUserWithMatrix(msg.content);
}
