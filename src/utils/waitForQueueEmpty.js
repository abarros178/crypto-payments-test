import { connectRabbitMQ } from "./rabbitmq.js";

export async function waitForQueueEmpty(queueName, interval = 1000, maxWait = 30000) {
  const channel = await connectRabbitMQ();
  const start = Date.now();

  while (true) {
    const q = await channel.checkQueue(queueName);
    if (q.messageCount === 0) {
      console.log(`✅ La cola "${queueName}" está vacía.`);
      break;
    }

    if (Date.now() - start > maxWait) {
      console.warn(`⚠️ Timeout al esperar que la cola "${queueName}" se vacíe.`);
      break;
    }

    console.log(`⏳ Esperando a que la cola "${queueName}" se vacíe... (${q.messageCount} mensajes pendientes)`);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  await channel.close();
}
