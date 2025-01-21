export async function waitForQueuesEmpty(channel, queues, interval = 1000, timeout = 60000) {
    const endTime = Date.now() + timeout;
  
    while (Date.now() < endTime) {
      let allEmpty = true;
      for (const queue of queues) {
        const q = await channel.checkQueue(queue);
        if (q.messageCount > 0) {
          allEmpty = false;
          break;
        }
      }
      if (allEmpty) return;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  
    throw new Error("Timeout: Las colas no se vaciaron en el tiempo esperado.");
  }
  
