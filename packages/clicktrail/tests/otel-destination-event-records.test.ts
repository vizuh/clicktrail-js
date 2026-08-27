import { describe, expect, it } from 'vitest';
import {
  ATTR_CONVERSATION_ID,
  ATTR_JOURNEY_ID,
  ATTR_MESSAGE_ID,
} from '@vizuh/clicktrail-core';
import { otelDestination } from '../src/otel/destination.js';
import type { OtelEventRecordLike } from '../src/otel/destination.js';
import type { StampedClickTrailEvent } from '@vizuh/clicktrail-browser';

function journeyEvent(): StampedClickTrailEvent {
  return {
    event_id: 'evt_1',
    event_name: 'lead.qualified',
    occurred_at: '2026-08-23T10:00:00.000Z',
    [ATTR_JOURNEY_ID]: 'j-abc',
    [ATTR_CONVERSATION_ID]: 'cw-77',
    [ATTR_MESSAGE_ID]: 'm-1',
    email: 'private@example.com',
    gclid: 'not-otel-by-default',
    schema_version: '1.2.0',
    classifier_version: '1.2.0',
  };
}

describe('otelDestination EventRecords', () => {
  it('emits one qualified OTel event per delivered ClickTrail fact', () => {
    const records: OtelEventRecordLike[] = [];
    const dest = otelDestination({ logger: { emit: (record) => records.push(record) } });
    dest.deliver(journeyEvent());

    expect(records).toHaveLength(1);
    expect(records[0]!.eventName).toBe('clicktrail.lead_qualified');
    expect(records[0]!.timestamp).toEqual(new Date('2026-08-23T10:00:00.000Z'));
    expect(records[0]!.attributes).toEqual({
      'clicktrail.event.id': 'evt_1',
      'clicktrail.schema.version': '1.2.0',
      'clicktrail.classifier.version': '1.2.0',
      'clicktrail.journey.id': 'j-abc',
      'clicktrail.conversation.id': 'cw-77',
      'clicktrail.conversation.message.id': 'm-1',
    });
  });

  it('copies no raw payload attributes unless the host maps them explicitly', () => {
    const records: OtelEventRecordLike[] = [];
    const dest = otelDestination({
      logger: { emit: (record) => records.push(record) },
      attributes: (event) => ({ 'deployment.environment.name': String(event['environment']) }),
    });
    dest.deliver({ ...journeyEvent(), environment: 'production' });

    expect(records[0]!.attributes?.['deployment.environment.name']).toBe('production');
    expect(records[0]!.attributes?.['email']).toBeUndefined();
    expect(records[0]!.attributes?.['gclid']).toBeUndefined();
  });

  it('omits invalid timestamps', () => {
    const records: OtelEventRecordLike[] = [];
    const dest = otelDestination({ logger: { emit: (record) => records.push(record) } });
    dest.deliver({ ...journeyEvent(), occurred_at: 'not-a-date' });

    expect(records[0]!.timestamp).toBeUndefined();
  });

  it('does not emit an unnamed EventRecord', () => {
    const records: OtelEventRecordLike[] = [];
    const dest = otelDestination({ logger: { emit: (record) => records.push(record) } });
    dest.deliver({ ...journeyEvent(), event_name: '' });

    expect(records).toEqual([]);
  });
});
