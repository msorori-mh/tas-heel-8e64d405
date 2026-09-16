/** Spread reconnect/retry traffic without changing durable operation identities. */
export function offlineRetryDelay(attempts: number, random = Math.random): number {
  const ceiling = Math.min(6 * 60 * 60 * 1000, 1000 * 2 ** Math.min(30, Math.max(0, attempts - 1)));
  return Math.round(ceiling * (0.5 + random() * 0.5));
}
export function offlineReconnectDelay(random = Math.random): number {
  return 500 + Math.floor(random() * 4500);
}
