import { EventBus } from '@/core/events/EventBus';
import type { FromSim, MessagePort, ToSim } from './messages';

type FromSimEvents = { [K in FromSim['type']]: Extract<FromSim, { type: K }> };

/** Main-thread handle to the simulation. Hides the transport (worker today). */
export class SimClient {
  private readonly bus = new EventBus<FromSimEvents>();

  constructor(private readonly port: MessagePort<FromSim, ToSim>) {
    port.onMessage((msg) => this.bus.emit(msg.type, msg as never));
  }

  static spawnWorker(): SimClient {
    const worker = new Worker(new URL('../sim/sim.worker.ts', import.meta.url), {
      type: 'module',
      name: 'sim',
    });
    return new SimClient({
      post: (message, transfer) => worker.postMessage(message, transfer ?? []),
      onMessage: (handler) => {
        worker.addEventListener('message', (e: MessageEvent<FromSim>) => handler(e.data));
      },
    });
  }

  send(msg: ToSim): void {
    this.port.post(msg);
  }

  on<K extends FromSim['type']>(type: K, handler: (msg: FromSimEvents[K]) => void): () => void {
    return this.bus.on(type, handler);
  }

  /** Resolves with the next message of the given type. */
  once<K extends FromSim['type']>(type: K): Promise<FromSimEvents[K]> {
    return new Promise((resolve) => {
      const off = this.on(type, (msg) => {
        off();
        resolve(msg);
      });
    });
  }
}
