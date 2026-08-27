/**
 * OpenTelemetry EventRecord destination (`/otel`).
 *
 * Business events are point-in-time facts, so this adapter emits them through
 * an injected Logger-like sink instead of manufacturing zero-duration spans.
 * The host owns OTel context, sampling, processors, and export.
 */
import type { Destination, StampedClickTrailEvent } from '@vizuh/clicktrail-browser';
import {
  ATTR_AGENT_NAME,
  ATTR_AGENT_RUN_ID,
  ATTR_CONVERSATION_ID,
  ATTR_JOURNEY_ID,
  ATTR_MESSAGE_ID,
  toCanonicalEventName,
} from '@vizuh/clicktrail-core';
import { defaultEventTimestamp } from './traceparent.js';

export type OtelAttributeValue = string | number | boolean;

/** Structural subset accepted by the OpenTelemetry JS Logger API. */
export interface OtelEventRecordLike {
  eventName: string;
  timestamp?: Date | number;
  attributes?: Record<string, OtelAttributeValue>;
}

/** Real OTel Logger instances and small test fakes satisfy this interface. */
export interface OtelLoggerLike {
  emit(record: OtelEventRecordLike): void;
}

export interface OtelDestinationConfig {
  /** Injected OTel Logger. Omit to keep a side-effect-free inspection buffer. */
  logger?: OtelLoggerLike;
  /** Explicit host-owned attribute mapping; raw payload fields are never copied. */
  attributes?: (event: StampedClickTrailEvent) => Record<string, OtelAttributeValue>;
}

export interface OtelDestination extends Destination {
  /** Normalized delivered events. No synthetic trace context is added. */
  getEvents(): StampedClickTrailEvent[];
}

const SAFE_ATTRIBUTES: Readonly<Record<string, string>> = {
  event_id: 'clicktrail.event.id',
  schema_version: 'clicktrail.schema.version',
  classifier_version: 'clicktrail.classifier.version',
  [ATTR_JOURNEY_ID]: 'clicktrail.journey.id',
  [ATTR_CONVERSATION_ID]: 'clicktrail.conversation.id',
  [ATTR_MESSAGE_ID]: 'clicktrail.conversation.message.id',
  [ATTR_AGENT_RUN_ID]: 'clicktrail.agent.run.id',
  [ATTR_AGENT_NAME]: 'clicktrail.agent.name',
};

function defaultAttributes(event: StampedClickTrailEvent): Record<string, OtelAttributeValue> {
  const attributes: Record<string, OtelAttributeValue> = {};
  for (const [source, target] of Object.entries(SAFE_ATTRIBUTES)) {
    const value = event[source];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      attributes[target] = value;
    }
  }
  return attributes;
}

function eventTimestamp(event: StampedClickTrailEvent): Date | number | undefined {
  const value = defaultEventTimestamp(event);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const milliseconds = Date.parse(value);
  return Number.isNaN(milliseconds) ? undefined : new Date(milliseconds);
}

/** Build a dependency-free bridge to an OTel Logger. */
export function otelDestination(config: OtelDestinationConfig = {}): OtelDestination {
  const events: StampedClickTrailEvent[] = [];

  return {
    name: 'otel',
    deliver(event) {
      const eventName = toCanonicalEventName(event.event_name);
      const normalized: StampedClickTrailEvent = { ...event, event_name: eventName };
      events.push(normalized);

      if (!config.logger || eventName === '') return;
      const timestamp = eventTimestamp(normalized);
      config.logger.emit({
        eventName: `clicktrail.${eventName}`,
        ...(timestamp !== undefined ? { timestamp } : {}),
        attributes: {
          ...defaultAttributes(normalized),
          ...config.attributes?.(normalized),
        },
      });
    },
    clear() {
      events.length = 0;
    },
    getEvents() {
      return events;
    },
  };
}
