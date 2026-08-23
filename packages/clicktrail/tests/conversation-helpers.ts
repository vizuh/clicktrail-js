/**
 * Shared deterministic fakes for /conversation tests.
 * No Date.now / Math.random / window / document anywhere: clock, random
 * bytes, storage, and consent are all injected.
 */
import type { StorageAdapter } from '../src/browser/storage.js';
import type { ConversationHost } from '../src/conversation/tracker.js';

const UUID_RE = /^(.{8})(.{4})(.{4})(.{4})(.{12})$/;

/**
 * Deterministic UUID v4 from a fixed byte pattern, formatted exactly like
 * identity.ts uuidV4FromBytes (version + RFC 4122 variant bits applied).
 */
export function uuidFromByte(byte: number): string {
  const bytes = new Uint8Array(16).fill(byte);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('');
  return hex.replace(UUID_RE, '$1-$2-$3-$4-$5');
}

export function fakeAdapter(): StorageAdapter & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    delete: (k) => void map.delete(k),
  };
}

/** Host fake capturing every track() call with the exact data bags. */
export function fakeHost(snap = { visitorId: 'v-1', sessionId: 's-1', sessionNumber: '1' }):
  ConversationHost & { events: { name: string; data: Record<string, unknown> }[] } {
  const events: { name: string; data: Record<string, unknown> }[] = [];
  return {
    events,
    track(name, data) {
      events.push({ name, data: data ?? {} });
    },
    getData: () => ({}),
    getSession: () => snap,
  };
}
