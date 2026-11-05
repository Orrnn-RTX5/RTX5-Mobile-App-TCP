// Pinned cloud fallback origins are disabled in Binary TCP builds so that
// directory entries resolved via the local 127.0.0.1:18404 bridge are never
// rewritten to *.orrnn.com.
export const PINNED_BROKER_SERVICE_ROOTS: Readonly<Record<string, string>> = Object.freeze({});

export function getPinnedBrokerServiceRoot(_brokerId: unknown): string | null {
  return null;
}

export function withPinnedBrokerEndpoints(
  _record: Readonly<Record<string, unknown>>,
): Record<string, unknown> | null {
  return null;
}
