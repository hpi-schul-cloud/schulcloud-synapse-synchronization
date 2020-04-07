const { Configuration } = require('@schul-cloud/commons');
const amqp = require('amqplib/callback_api');
const syncer = require('./syncer');

const RABBITMQ_URI = Configuration.get('RABBITMQ_URI');
const RABBIT_MQ_QUEUE = Configuration.get('RABBIT_MQ_QUEUE');
const RABBIT_MQ_QUEUE_DEAD_LETTER = Configuration.get('RABBIT_MQ_QUEUE') + '_dlq';
const CONCURRENCY = 1;

module.exports = {
  listen,
  onMessage,
};

let messageNumber = 0;

function listen() {
  amqp.connect(RABBITMQ_URI, (error0, connection) => {
    process.on('SIGINT', () => {
      console.log('Caught signal SIGINT, closing connection and exit.');
      connection.close();
      process.exit();
    });
    process.on('SIGTERM', () => {
      console.log('Caught signal SIGTERM, closing connection and exit.');
      connection.close();
      process.exit();
    });

    if (error0) {
      throw error0;
    }
    connection.createChannel((error1, channel) => {
      if (error1) {
        throw error1;
      }

      // ensure queues exist
      channel.assertQueue(RABBIT_MQ_QUEUE, {
        durable: false,
      });
      channel.assertQueue(RABBIT_MQ_QUEUE_DEAD_LETTER, {
        durable: false,
      });

      console.log(' [*] Waiting for messages in %s. To exit press CTRL+C', RABBIT_MQ_QUEUE);

      channel.prefetch(CONCURRENCY);
      channel.consume(RABBIT_MQ_QUEUE, (msg) => {
        onMessage(msg)
          .then(() => {
            channel.ack(msg);
          })
          .catch(() => {
            if (!msg.fields.redelivered) {
              // retry message
              channel.reject(msg, true);
            } else {
              // reject and store message
              channel.reject(msg, false);
              channel.sendToQueue(RABBIT_MQ_QUEUE_DEAD_LETTER, msg.content);
            }
          })
        ;
      });
    });
  });
}

async function onMessage(msg) {
  messageNumber += 1;
  const number = messageNumber;
  console.log(' [%i] Received %s', number, msg.content.toString());
  await syncer.syncUserWithMatrix(JSON.parse(msg.content));
  console.log(' [%i] Done', number);
  return true;
}
