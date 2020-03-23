const {Configuration} = require('@schul-cloud/commons');
const amqp = require('amqplib/callback_api');
const syncer = require('./syncer');

const RABBITMQ_URI = Configuration.get("RABBITMQ_URI");
const RABBIT_MQ_QUEUE = Configuration.get("RABBIT_MQ_QUEUE");
const CONCURRENCY = 1;

module.exports = {
  listen: listen,
};

let messageNumber = 0;

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

      channel.prefetch(CONCURRENCY);
      channel.consume(RABBIT_MQ_QUEUE, (msg) => {
        onMessage(msg).then(_ => {
          channel.ack(msg);
        });
      });
    });
  });
}

async function onMessage(msg) {
  const number = messageNumber++;
  console.log(" [%i] Received %s", number, msg.content.toString());
  await syncer.syncUserWithMatrix(JSON.parse(msg.content));
  console.log(" [%i] Done", number);
  return true;
}
