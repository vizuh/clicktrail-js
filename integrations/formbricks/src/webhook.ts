import { createHmac, timingSafeEqual } from 'node:crypto';

export interface FormbricksWebhookHeaders {
  'webhook-id'?: string;
  'webhook-timestamp'?: string;
  'webhook-signature'?: string;
  [name: string]: string | undefined;
}

export interface VerifyFormbricksWebhookOptions {
  now?: number;
  toleranceSeconds?: number;
}

function header(headers: FormbricksWebhookHeaders, name: string): string | undefined {
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === name && typeof value === 'string') return value.trim() || undefined;
  }
  return undefined;
}

function decodeSecret(secret: unknown): Buffer | undefined {
  if (typeof secret !== 'string') return undefined;
  const value = secret.trim();
  if (!value.startsWith('whsec_')) return undefined;
  const encoded = value.slice('whsec_'.length);
  if (!/^[a-z0-9+/]+={0,2}$/i.test(encoded)) return undefined;
  const bytes = Buffer.from(encoded, 'base64');
  return bytes.length > 0 ? bytes : undefined;
}

export function verifyFormbricksWebhookSignature(
  rawBody: string,
  headers: FormbricksWebhookHeaders,
  secret: string,
  options: VerifyFormbricksWebhookOptions = {},
): boolean {
  if (typeof rawBody !== 'string') return false;
  const webhookId = header(headers, 'webhook-id');
  const timestampRaw = header(headers, 'webhook-timestamp');
  const signatureHeader = header(headers, 'webhook-signature');
  const secretBytes = decodeSecret(secret);
  if (!webhookId || !timestampRaw || !signatureHeader || !secretBytes) return false;

  const timestamp = Number(timestampRaw);
  const toleranceSeconds = options.toleranceSeconds ?? 300;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(timestamp) ||
    !Number.isFinite(now) ||
    !Number.isFinite(toleranceSeconds) ||
    toleranceSeconds < 0 ||
    Math.abs(now - timestamp) > toleranceSeconds
  ) {
    return false;
  }

  const expected = createHmac('sha256', secretBytes)
    .update(`${webhookId}.${timestamp}.${rawBody}`)
    .digest('base64');
  const expectedBytes = Buffer.from(expected);

  return signatureHeader.split(/\s+/).some((candidate) => {
    const [version, value] = candidate.split(',', 2);
    if (version !== 'v1' || !value) return false;
    const actualBytes = Buffer.from(value);
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
  });
}
