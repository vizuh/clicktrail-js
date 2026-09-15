/**
 * Thin translation layer: builder results -> one stamped event -> one POST.
 *
 * All attribution/serialization logic lives in @vizuh/clicktrail/browser
 * (`buildEventPayload`). This module only wires the Activepieces httpClient:
 * auth header, collector URL, `{ events: [event] }` batch body, and failure
 * surfacing as {@link ActionError} carrying the action displayName.
 */
import { httpClient, HttpMethod, type HttpRequest } from '@activepieces/pieces-common';
import type { ClickTrailEvent } from '@vizuh/clicktrail/browser';
import { buildActionEvent } from './events.js';
import type { BuilderResult, ActionEventContext } from './events.js';

/** Collector default; override per connection for self-hosted ClickTrail. */
export const DEFAULT_BASE_URL = 'https://events.clicktrail.example';

export const CLICKTRAIL_API_KEY_HEADER = 'X-ClickTrail-Key';

export interface SendEventInput {
  displayName: string;
  apiKey: string;
  baseUrl?: string | undefined;
  siteId: string;
  /** Optional under exactOptionalPropertyTypes; omit the key when absent. */
  workspaceId?: string | undefined;
  result: BuilderResult;
}

export interface SendEventOutput {
  ok: boolean;
  status: number;
  /** The exact stamped event that was sent in the `{ events: [...] }` body. */
  event: ClickTrailEvent;
}

/** Error surfaced to the automation author when a ClickTrail send fails. */
export class ActionError extends Error {
  readonly actionDisplayName: string;
  readonly status: number;

  constructor(actionDisplayName: string, message: string, status = 0) {
    super(`clicktrail ${actionDisplayName}: ${message}`);
    this.name = 'ActionError';
    this.actionDisplayName = actionDisplayName;
    this.status = status;
  }
}

/** Resolve the configured base URL or fall back to the hosted collector. */
export function resolveBaseUrl(baseUrl: string | undefined): string {
  if (typeof baseUrl === 'string' && baseUrl.trim() !== '') return baseUrl.trim();
  return DEFAULT_BASE_URL;
}

/**
 * Build the single-event batch request. Pure and exported so tests can assert
 * header/body wiring without network access.
 */
export function buildEventsRequest(
  baseUrl: string,
  apiKey: string,
  event: ClickTrailEvent,
): HttpRequest {
  return {
    method: HttpMethod.POST,
    timeout: 3000,
    url: baseUrl,
    headers: {
      [CLICKTRAIL_API_KEY_HEADER]: apiKey,
      'Content-Type': 'application/json',
    },
    body: { events: [event] },
  };
}

function extractStatus(error: unknown): number {
  const candidate = error as { response?: { status?: unknown }; status?: unknown } | null;
  if (candidate && typeof candidate === 'object') {
    for (const value of [candidate.response?.status, candidate.status]) {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
  }
  return 0;
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Build + send ONE event for an action. Never throws for non-2xx responses —
 * failures reject with {@link ActionError} including the action displayName;
 * success resolves with the sent event plus `{ ok, status }`.
 */
export async function sendActionEvent(input: SendEventInput): Promise<SendEventOutput> {
  let event: ClickTrailEvent;
  try {
    event = buildActionEvent(input.result, {
      siteId: input.siteId,
      ...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}),
    });
  } catch (error) {
    throw new ActionError(input.displayName, extractMessage(error));
  }

  const request = buildEventsRequest(resolveBaseUrl(input.baseUrl), input.apiKey, event);
  try {
    const response = await httpClient.sendRequest<{ status?: number }>(request);
    return { ok: true, status: typeof response.status === 'number' ? response.status : 200, event };
  } catch (error) {
    const status = extractStatus(error);
    throw new ActionError(
      input.displayName,
      `event "${event.event_name}" was not delivered${status ? ` (HTTP ${status})` : ''}: ${extractMessage(error)}`,
      status,
    );
  }
}

