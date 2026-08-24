import { describe, expect, it } from 'vitest';
import { mapVariables, mergeVariables, normalizeConsent } from '../src/variables.js';

describe('mapVariables', () => {
  it('maps the full Typebot variable table onto canonical fields', () => {
    const { mapped, extra } = mapVariables({
      Email: 'ana@example.com',
      Phone: '+351910000000',
      'Lead ID': 'lead_123',
      utm_campaign: 'spring-promo',
      gclid: 'EAIaIQobChM',
      'Quoted value': '1200.50',
      'Marketing consent': 'granted',
    });
    expect(mapped).toEqual({
      email: 'ana@example.com',
      phone: '+351910000000',
      lead_id: 'lead_123',
      campaign: 'spring-promo',
      gclid: 'EAIaIQobChM',
      value: 1200.5,
      consent_state: 'granted',
    });
    expect(extra).toEqual({});
  });

  it('omits missing optional variables entirely', () => {
    const { mapped } = mapVariables({ Email: 'x@example.com' });
    expect(mapped).toEqual({ email: 'x@example.com' });
  });

  it('never emits empty or whitespace-only strings', () => {
    const { mapped } = mapVariables({
      Email: '   ',
      Phone: '',
      'Lead ID': undefined,
      utm_campaign: null,
    });
    expect(mapped).toEqual({});
  });

  it('normalizes Marketing consent values to consent states', () => {
    expect(normalizeConsent(true)).toBe('granted');
    expect(normalizeConsent('YES')).toBe('granted');
    expect(normalizeConsent(false)).toBe('withdrawn');
    expect(normalizeConsent('no')).toBe('withdrawn');
    expect(normalizeConsent('policy_updated')).toBe('policy_updated');
    expect(normalizeConsent('policy updated')).toBe('policy_updated');
    expect(normalizeConsent('')).toBeUndefined();
  });

  it('coerces Quoted value numeric strings to numbers', () => {
    const { mapped } = mapVariables({ 'Quoted value': '250' });
    expect(mapped['value']).toBe(250);
  });

  it('keeps non-numeric Quoted value as cleaned text', () => {
    const { mapped } = mapVariables({ 'Quoted value': 'two thousand' });
    expect(mapped['value']).toBe('two thousand');
  });

  it('collects unmapped variables into extra', () => {
    const { mapped, extra } = mapVariables({
      Email: 'x@example.com',
      Plan: 'premium',
      Notes: 'wants demo on Friday',
    });
    expect(mapped).toEqual({ email: 'x@example.com' });
    expect(extra).toEqual({ Plan: 'premium', Notes: 'wants demo on Friday' });
  });

  it('trims whitespace around mapped values', () => {
    const { mapped } = mapVariables({ utm_campaign: '  brand-launch  ', gclid: ' abc ' });
    expect(mapped['campaign']).toBe('brand-launch');
    expect(mapped['gclid']).toBe('abc');
  });
});

describe('mergeVariables', () => {
  it('merges campaign + gclid passthrough onto the current visitor payload', () => {
    const merged = mergeVariables(
      { visitor_id: 'anon_42' },
      { campaign: 'spring-promo', gclid: 'G-123' },
    );
    expect(merged).toEqual({ visitor_id: 'anon_42', campaign: 'spring-promo', gclid: 'G-123' });
  });

  it('attaches arbitrary extras under properties without mutating the input', () => {
    const payload = { email: 'x@example.com' };
    const merged = mergeVariables(payload, { phone: '+351910000000' }, { Plan: 'premium' });
    expect(merged).toEqual({
      email: 'x@example.com',
      phone: '+351910000000',
      properties: { Plan: 'premium' },
    });
    expect(payload).toEqual({ email: 'x@example.com' });
  });

  it('preserves earlier properties when merging again', () => {
    const first = mergeVariables({}, {}, { Plan: 'premium' });
    const second = mergeVariables(first, {}, { Channel: 'whatsapp' });
    expect(second['properties']).toEqual({ Plan: 'premium', Channel: 'whatsapp' });
  });
});
