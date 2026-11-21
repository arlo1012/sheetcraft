import { getCurrentScope, onScopeDispose } from "vue";

export type EventHandler<Payload> = (payload: Payload) => void;
export type EventUnsubscribe = () => void;

export type TypedEventBus<Events extends Record<string, unknown>> = {
  on<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): EventUnsubscribe;
  once<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): EventUnsubscribe;
  off<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): void;
  emit<K extends keyof Events>(event: K, payload: Events[K]): void;
  clear(): void;
};

/**
 * Creates a lightweight, synchronous, strictly-typed event bus scoped to a single owner.
 * Snapshots listeners before dispatch so unsubscribing mid-emit never skips sibling handlers.
 */
export function createTypedEventBus<
  Events extends Record<string, unknown>,
>(): TypedEventBus<Events> {
  const listeners = new Map<keyof Events, Set<EventHandler<unknown>>>();

  function getBucket(event: keyof Events): Set<EventHandler<unknown>> {
    let bucket = listeners.get(event);
    if (!bucket) {
      bucket = new Set();
      listeners.set(event, bucket);
    }
    return bucket;
  }

  function off<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): void {
    const bucket = listeners.get(event);
    if (!bucket) return;
    bucket.delete(handler as EventHandler<unknown>);
    if (bucket.size === 0) listeners.delete(event);
  }

  function on<K extends keyof Events>(
    event: K,
    handler: EventHandler<Events[K]>,
  ): EventUnsubscribe {
    getBucket(event).add(handler as EventHandler<unknown>);
    return () => off(event, handler);
  }

  function once<K extends keyof Events>(
    event: K,
    handler: EventHandler<Events[K]>,
  ): EventUnsubscribe {
    const wrapped: EventHandler<Events[K]> = (payload) => {
      off(event, wrapped);
      handler(payload);
    };
    return on(event, wrapped);
  }

  function emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const bucket = listeners.get(event);
    if (!bucket || bucket.size === 0) return;
    for (const handler of Array.from(bucket)) {
      (handler as EventHandler<Events[K]>)(payload);
    }
  }

  function clear(): void {
    listeners.clear();
  }

  return { on, once, off, emit, clear };
}

/** Registers an event listener and automatically disposes it with the active Vue effect scope. */
export function useScopedEventListener<
  Events extends Record<string, unknown>,
  K extends keyof Events,
>(bus: TypedEventBus<Events>, event: K, handler: EventHandler<Events[K]>): EventUnsubscribe {
  const unsubscribe = bus.on(event, handler);
  if (getCurrentScope()) onScopeDispose(unsubscribe);
  return unsubscribe;
}
