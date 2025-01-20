/**
 * Espera hasta que las colas indicadas estén vacías o se alcance un tiempo máximo.
 * @param {import("amqplib").Channel} channel
 * @param {string[]} queues - Nombres de las colas a verificar.
 * @param {number} intervalMs - Intervalo (ms) entre verificaciones.
 * @param {number} maxWaitMs - Tiempo máximo de espera antes de rendirse.
 */
export async function waitForQueuesEmpty(channel, queues, intervalMs = 1000, maxWaitMs = 10000) {
    const start = Date.now();
  
    while (true) {
      let allEmpty = true;
      for (const q of queues) {
        const check = await channel.checkQueue(q);
        if (check.messageCount > 0) {
          allEmpty = false;
          break;
        }
      }
  
      if (allEmpty) {
        return;
      }
  
      if (Date.now() - start > maxWaitMs) {
        console.warn(`⚠️ Se alcanzó el tiempo máximo esperando que las colas [${queues.join(", ")}] estén vacías.`);
        return;
      }
  
      // Espera antes de volver a verificar
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }