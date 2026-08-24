/**
 * Delivery retry classification shared by browser queue and server senders.
 *
 * At-most-once semantics: senders may retry only RETRYABLE outcomes while
 * reusing the original event_id; collectors no-op duplicates.
 */
export type DeliveryOutcome =
  | { kind: 'delivered' }
  | { kind: 'retryable'; reason: string }
  | { kind: 'permanent'; reason: string };

/** HTTP status -> retry classification for collector deliveries. */
export function classifyDeliveryStatus(status: number): DeliveryOutcome {
  if (status >= 200 && status < 300) return { kind: 'delivered' };
  if (status === 408 || status === 425 || status === 429) {
    return { kind: 'retryable', reason: `http_${status}` };
  }
  if (status >= 500) return { kind: 'retryable', reason: `http_${status}` };
  return { kind: 'permanent', reason: `http_${status}` };
}

/** Network-level failure (no status): always retryable at the sender's policy. */
export function classifyNetworkError(): DeliveryOutcome {
  return { kind: 'retryable', reason: 'network_error' };
}
