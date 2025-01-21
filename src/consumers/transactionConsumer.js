import { connectRabbitMQ } from "../utils/rabbitmq.js";
import { waitForQueuesEmpty } from "../utils/waitForQueueEmpty.js";
import {
  updateSeenTxidsFromDB,
  classifyTransactions,
  persistTransactions,
} from "../services/transactionHelpers.js";

// Tamaño umbral para disparar una inserción en batch
const BATCH_SIZE = 50;

// Arrays para acumular transacciones y referencias a mensajes
let batchValidDeposits = [];
let batchFailedTransactions = [];
let batchMessages = [];

// Flag para evitar llamadas concurrentes a flushBatch
let isFlushing = false;

async function flushBatch(channel) {
  if (isFlushing) return;
  isFlushing = true;

  // Si no hay nada que procesar, salir
  if (batchValidDeposits.length === 0 && batchFailedTransactions.length === 0) {
    isFlushing = false;
    return;
  }

  try {
    // Intentar persistir todas las transacciones acumuladas
    await persistTransactions(batchValidDeposits, batchFailedTransactions);

    // Acknowledge (ack) todos los mensajes asociados a estas transacciones
    for (const msg of batchMessages) {
      channel.ack(msg);
    }
  } catch (err) {
    console.error("Error al vaciar el batch:", err);

    // En caso de error, para cada mensaje podrías implementar lógica de reintento
    // Aquí se muestra un ejemplo simple de reprocesamiento básico con reintentos
    for (const msg of batchMessages) {
      const headers = msg.properties.headers || {};
      const retryCount = headers["x-retry-count"] || 0;

      if (retryCount < 3) {
        channel.publish("retry_exchange", "retry", msg.content, {
          headers: { "x-retry-count": retryCount + 1 },
          persistent: true,
          mandatory: true,
        });
      } else {
        channel.publish("dead_letter_exchange", "dead", msg.content, {
          persistent: true,
          mandatory: true,
        });
      }
      channel.ack(msg);
    }
  } finally {
    // Limpiar arrays y liberar el flag de flushing
    batchValidDeposits = [];
    batchFailedTransactions = [];
    batchMessages = [];
    isFlushing = false;
  }
}

/**
 * Inicia un consumidor de RabbitMQ para la cola `transactionsQueue`, gestionando reintentos y cola de mensajes muertos (Dead Letter Queue).
 *
 * Este consumidor procesa mensajes de transacciones, los clasifica, persiste los resultados y maneja errores.
 * Si el procesamiento de un mensaje falla, se reintenta hasta 3 veces utilizando la `retryQueue`.
 * Si se exceden los reintentos, el mensaje se envía a la `deadLetterQueue`.
 *
 * @async
 * @function startTransactionConsumer
 * @returns {Promise<void>} Resuelve cuando el consumidor finaliza el procesamiento de todos los mensajes y señales de control.
 * @throws {Error} Lanza un error si falla la conexión con RabbitMQ o la configuración de las colas.
 *
 * @requires ../utils/rabbitmq
 * @requires ../utils/waitForQueueEmpty
 * @requires ../services/transactionHelpers
 */
export async function startTransactionConsumer() {
  console.log("[startTransactionConsumer] Iniciando consumidor de RabbitMQ...");

  const channel = await connectRabbitMQ();
  console.log("[startTransactionConsumer] Conexión a RabbitMQ exitosa.");

  // Definir Exchanges
  const mainExchange = "main_exchange";
  const deadLetterExchange = "dead_letter_exchange";
  const retryExchange = "retry_exchange";

  console.log("[startTransactionConsumer] Configurando exchanges...");
  await channel.assertExchange(mainExchange, "direct", { durable: true });
  await channel.assertExchange(deadLetterExchange, "direct", { durable: true });
  await channel.assertExchange(retryExchange, "direct", { durable: true });
  console.log(
    "[startTransactionConsumer] Exchanges configurados correctamente."
  );

  // Definir Colas
  const mainQueue = "transactionsQueue";
  console.log(
    `[startTransactionConsumer] Configurando cola principal: ${mainQueue}`
  );
  await channel.assertQueue(mainQueue, {
    durable: true,
    deadLetterExchange: deadLetterExchange, // Mensajes muertos van a DLX
  });
  await channel.bindQueue(mainQueue, mainExchange, "transaction");

  const deadLetterQueue = "deadLetterQueue";
  console.log(
    `[startTransactionConsumer] Configurando cola DLQ: ${deadLetterQueue}`
  );
  await channel.assertQueue(deadLetterQueue, { durable: true });
  await channel.bindQueue(deadLetterQueue, deadLetterExchange, "dead");

  const retryQueue = "retryQueue";
  console.log(
    `[startTransactionConsumer] Configurando cola de reintentos: ${retryQueue}`
  );
  await channel.assertQueue(retryQueue, {
    durable: true,
    messageTtl: 5000, // Tiempo de espera antes de reintentar (5 segundos)
    deadLetterExchange: mainExchange, // Reenvía al mainExchange tras el TTL
    deadLetterRoutingKey: "transaction",
  });
  await channel.bindQueue(retryQueue, retryExchange, "retry");

  console.log(
    "[startTransactionConsumer] Todas las colas configuradas correctamente."
  );
  channel.prefetch(10);

  const seenTxids = new Set();
  console.log("[startTransactionConsumer] Conjunto de txids inicializado.");

  // Promesa que se resuelve cuando todo el proceso ha terminado
  let doneResolve;
  const donePromise = new Promise((resolve) => {
    doneResolve = resolve;
  });

  console.log("[startTransactionConsumer] Comenzando consumo de mensajes...");
  channel.consume(mainQueue, async (msg) => {
    if (!msg) return;

    try {
      const content = JSON.parse(msg.content.toString());
      console.log(
        `[startTransactionConsumer] Mensaje recibido: ${msg.content.toString()}`
      );

      // Manejo del mensaje de control sigue igual
      if (content.control) {
        console.log(
          "[startTransactionConsumer] Mensaje de control recibido. Finalizando consumo."
        );
        channel.ack(msg);

        await waitForQueuesEmpty(channel, [mainQueue, retryQueue], 1000, 10000);
        await flushBatch(channel); // Asegurarse de vaciar cualquier batch pendiente
        doneResolve();
        return;
      }

      const { tx, executionId } = content;
      console.log(
        `[startTransactionConsumer] Procesando transacción txid: ${tx.txid}`
      );

      await updateSeenTxidsFromDB([tx.txid], seenTxids);

      const { validDeposits, failedTransactions } = classifyTransactions(
        [tx],
        executionId,
        seenTxids
      );

      // Acumular resultados en los arrays globales
      batchValidDeposits.push(...validDeposits);
      batchFailedTransactions.push(...failedTransactions);
      batchMessages.push(msg);

      // Si se alcanza el tamaño umbral del batch, vaciar el lote
      if (
        batchValidDeposits.length + batchFailedTransactions.length >=
        BATCH_SIZE
      ) {
        await flushBatch(channel);
      }
    } catch (error) {
      // Lógica de reintentos y DLQ permanece igual para errores en procesamiento
      const headers = msg.properties.headers || {};
      const retryCount = headers["x-retry-count"] || 0;

      if (retryCount < 3) {
        console.warn(
          `⚠️ [Consumer] Error al procesar. Reintentando (${
            retryCount + 1
          }/3)...`
        );
        channel.publish(retryExchange, "retry", msg.content, {
          headers: { "x-retry-count": retryCount + 1 },
          persistent: true,
          mandatory: true,
        });
      } else {
        console.error(
          `❌ [Consumer] Error tras 3 reintentos. Enviando a Dead Letter Queue.`
        );
        channel.publish(deadLetterExchange, "dead", msg.content, {
          persistent: true,
          mandatory: true,
        });
      }
      channel.ack(msg);
    }
  });

  // Aquí va el setInterval
  setInterval(() => flushBatch(channel), 5000);

  return donePromise;
}
