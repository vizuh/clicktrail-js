/**
 * ClickTrail n8n community node.
 *
 * Routes every operation through the pure builders in src/events.ts, so all
 * event logic stays testable outside the n8n runtime. Each item POSTs
 * `{ events: [builtEvent] }` to the configured collector endpoint via
 * this.helpers.httpRequest and reports `{ ok, status }` per item, mirroring
 * the @vizuh/clicktrail-astro server send contract. Transport/validation failures
 * surface as NodeApiError with the operation name included — never silent
 * success.
 *
 * NOTE on anonymizeVisitor: it emits a deletion REQUEST event only. Actual
 * erasure depends on collector support.
 */
import type {
  ICredentialDataDecryptedObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import {
  DEFAULT_TIMEOUT_MS,
  buildRequestHeaders,
  validateCollectorUrl,
} from '../../credentials/ClickTrailApi.credentials.js';
import { OPERATIONS } from '../../events.js';
import type { BuilderContext, ResourceName } from '../../events.js';

/** Declared UI fields per operation — used both for the property list below and input assembly. */
const OP_FIELDS: Readonly<Record<ResourceName, Readonly<Record<string, readonly string[]>>>> = Object.freeze({
  lead: Object.freeze({
    createOrIdentify: ['visitorId', 'email', 'leadId', 'name', 'attributionPayloadJson'],
    attachAttribution: ['attributionPayloadJson', 'flatAttribution'],
    updateStage: ['stage', 'leadId'],
    markQualified: ['leadId'],
    mergeVisitor: ['anonymousVisitorId', 'knownContactId'],
  }),
  conversion: Object.freeze({
    recordAppointment: ['bookingId', 'value', 'currency', 'startDate'],
    recordCompletedAppointment: ['bookingId'],
    recordSale: ['transactionId', 'value', 'currency'],
    recordRecurringRevenue: ['subscriptionId', 'value', 'currency', 'interval'],
    recordRefund: ['originalTransactionId', 'value'],
    sendOfflineConversion: ['clickId', 'trailId', 'conversionName', 'value', 'currency'],
  }),
  consent: Object.freeze({
    recordConsent: ['state', 'source', 'policyVersion'],
    recordWithdrawal: ['source', 'policyVersion'],
    updateConsentPolicy: ['source', 'policyVersion'],
    anonymizeVisitor: ['visitorId'],
  }),
});

function requiredFields(resource: ResourceName, operation: string): readonly string[] {
  switch (`${resource}.${operation}`) {
    case 'lead.updateStage': return ['stage'];
    case 'lead.markQualified': return ['leadId'];
    case 'lead.mergeVisitor': return ['anonymousVisitorId', 'knownContactId'];
    case 'conversion.recordSale': return ['transactionId', 'value', 'currency'];
    case 'conversion.recordRecurringRevenue': return ['subscriptionId', 'value', 'currency'];
    case 'conversion.recordRefund': return ['originalTransactionId'];
    case 'conversion.sendOfflineConversion': return ['conversionName'];
    case 'consent.recordConsent': return ['state'];
    case 'consent.updateConsentPolicy': return ['source', 'policyVersion'];
    case 'consent.anonymizeVisitor': return ['visitorId'];
    default: return [];
  }
}

function nonEmpty(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

export class ClickTrail implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'ClickTrail',
    name: 'clickTrail',
    icon: 'file:clicktrail.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
    description:
      'Send first-party attribution events (leads, conversions, consent) to a ClickTrail collector. ' +
      'anonymizeVisitor sends a deletion REQUEST event only — actual erasure depends on collector support.',
    defaults: { name: 'ClickTrail' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{ name: 'clickTrailApi', required: true }],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        options: [
          { name: 'Lead', value: 'lead' },
          { name: 'Conversion', value: 'conversion' },
          { name: 'Consent', value: 'consent' },
        ],
        default: 'lead',
        required: true,
        description: 'The kind of ClickTrail event to emit.',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        displayOptions: { show: { resource: ['lead'] } },
        options: [
          { name: 'Create or Identify Lead', value: 'createOrIdentify' },
          { name: 'Attach Attribution', value: 'attachAttribution' },
          { name: 'Update Stage', value: 'updateStage' },
          { name: 'Mark Qualified', value: 'markQualified' },
          { name: 'Merge Visitor', value: 'mergeVisitor' },
        ],
        default: 'createOrIdentify',
        required: true,
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        displayOptions: { show: { resource: ['conversion'] } },
        options: [
          { name: 'Record Appointment', value: 'recordAppointment' },
          { name: 'Record Completed Appointment', value: 'recordCompletedAppointment' },
          { name: 'Record Sale', value: 'recordSale' },
          { name: 'Record Recurring Revenue', value: 'recordRecurringRevenue' },
          { name: 'Record Refund', value: 'recordRefund' },
          { name: 'Send Offline Conversion', value: 'sendOfflineConversion' },
        ],
        default: 'recordSale',
        required: true,
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        displayOptions: { show: { resource: ['consent'] } },
        options: [
          { name: 'Record Consent', value: 'recordConsent' },
          { name: 'Record Withdrawal', value: 'recordWithdrawal' },
          { name: 'Update Consent Policy', value: 'updateConsentPolicy' },
          { name: 'Anonymize Visitor', value: 'anonymizeVisitor' },
        ],
        default: 'recordConsent',
        required: true,
      },

      // ---- shared optionals ----
      {
        displayName: 'Site ID',
        name: 'siteId',
        type: 'string',
        default: '',
        description: 'Optional site identifier stamped into the marketing_trail envelope.',
      },
      {
        displayName: 'Workspace ID',
        name: 'workspaceId',
        type: 'string',
        default: '',
        description: 'Optional workspace identifier stamped into the marketing_trail envelope.',
      },
      {
        displayName: 'Endpoint Path Suffix',
        name: 'endpointPath',
        type: 'string',
        default: '',
        description: 'Appended verbatim to the credential baseUrl (default: none).',
      },

      // ---- LEAD ----
      {
        displayName: 'Visitor ID',
        name: 'visitorId',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['lead'], operation: ['createOrIdentify'] } },
        description: 'Existing ClickTrail visitor id, when one is already known.',
      },
      {
        displayName: 'Email',
        name: 'email',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['lead'], operation: ['createOrIdentify'] } },
      },
      {
        displayName: 'Lead ID',
        name: 'leadId',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['lead'], operation: ['createOrIdentify'] } },
        description: 'Your CRM lead id, when the lead already exists upstream.',
      },
      {
        displayName: 'Name',
        name: 'name',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['lead'], operation: ['createOrIdentify'] } },
      },
      {
        displayName: 'Attribution Payload JSON',
        name: 'attributionPayloadJson',
        type: 'string',
        typeOptions: { rows: 4 },
        default: '',
        displayOptions: { show: { resource: ['lead'], operation: ['createOrIdentify', 'attachAttribution'] } },
        description:
          'Canonical flat attribution payload (ft_/lt_ keys, click ids, trail_id) as JSON. ' +
          'For createOrIdentify this attaches the full trail to the lead.',
      },
      {
        displayName: 'Flat Attribution Collection',
        name: 'flatAttribution',
        type: 'collection',
        default: {},
        displayOptions: { show: { resource: ['lead'], operation: ['attachAttribution'] } },
        description: 'Flat ft_/lt_ key-value pairs; merged over Attribution Payload JSON when both are set.',
      },
      {
        displayName: 'Stage',
        name: 'stage',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['lead'], operation: ['updateStage'] } },
        description: 'Pipeline stage label (e.g. contacted, demo_booked, proposal_sent).',
      },
      {
        displayName: 'Lead ID',
        name: 'leadId',
        type: 'string',
        default: '',
        required: false,
        displayOptions: { show: { resource: ['lead'], operation: ['updateStage'] } },
      },
      {
        displayName: 'Lead ID',
        name: 'leadId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['lead'], operation: ['markQualified'] } },
      },
      {
        displayName: 'Anonymous Visitor ID',
        name: 'anonymousVisitorId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['lead'], operation: ['mergeVisitor'] } },
      },
      {
        displayName: 'Known Contact ID',
        name: 'knownContactId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['lead'], operation: ['mergeVisitor'] } },
      },

      // ---- CONVERSION ----
      {
        displayName: 'Booking ID',
        name: 'bookingId',
        type: 'string',
        default: '',
        displayOptions: {
          show: { resource: ['conversion'], operation: ['recordAppointment', 'recordCompletedAppointment'] },
        },
      },
      {
        displayName: 'Value',
        name: 'value',
        type: 'number',
        default: 0,
        displayOptions: {
          show: {
            resource: ['conversion'],
            operation: [
              'recordAppointment', 'recordSale', 'recordRecurringRevenue',
              'recordRefund', 'sendOfflineConversion',
            ],
          },
        },
        description:
          'Positive finite monetary amount (required for sale/recurring revenue). ' +
          'For refunds any finite number is accepted, including negative deltas.',
      },
      {
        displayName: 'Currency',
        name: 'currency',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            resource: ['conversion'],
            operation: ['recordAppointment', 'recordSale', 'recordRecurringRevenue', 'sendOfflineConversion'],
          },
        },
        description: 'ISO-4217 code (required for sale/recurring revenue).',
      },
      {
        displayName: 'Start Date',
        name: 'startDate',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['conversion'], operation: ['recordAppointment'] } },
        description: 'ISO-8601 appointment start time.',
      },
      {
        displayName: 'Transaction ID',
        name: 'transactionId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['conversion'], operation: ['recordSale'] } },
      },
      {
        displayName: 'Subscription ID',
        name: 'subscriptionId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['conversion'], operation: ['recordRecurringRevenue'] } },
      },
      {
        displayName: 'Interval',
        name: 'interval',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['conversion'], operation: ['recordRecurringRevenue'] } },
        description: 'Billing interval, e.g. month or year.',
      },
      {
        displayName: 'Original Transaction ID',
        name: 'originalTransactionId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['conversion'], operation: ['recordRefund'] } },
      },
      {
        displayName: 'Click ID',
        name: 'clickId',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['conversion'], operation: ['sendOfflineConversion'] } },
        description: 'GCLID-style ad click id. Required unless Trail ID is set.',
      },
      {
        displayName: 'Trail ID',
        name: 'trailId',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['conversion'], operation: ['sendOfflineConversion'] } },
        description: 'ClickTrail trail id. Required unless Click ID is set.',
      },
      {
        displayName: 'Conversion Name',
        name: 'conversionName',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['conversion'], operation: ['sendOfflineConversion'] } },
      },

      // ---- CONSENT ----
      {
        displayName: 'State',
        name: 'state',
        type: 'options',
        options: [
          { name: 'Granted', value: 'granted' },
          { name: 'Denied', value: 'denied' },
          { name: 'Withdrawn', value: 'withdrawn' },
        ],
        default: 'granted',
        required: true,
        displayOptions: { show: { resource: ['consent'], operation: ['recordConsent'] } },
      },
      {
        displayName: 'Source',
        name: 'source',
        type: 'string',
        default: '',
        displayOptions: {
          show: { resource: ['consent'], operation: ['recordConsent', 'recordWithdrawal', 'updateConsentPolicy'] },
        },
        description: 'Where the decision came from (e.g. cookie-banner, crm-import). Required for updateConsentPolicy.',
      },
      {
        displayName: 'Policy Version',
        name: 'policyVersion',
        type: 'string',
        default: '',
        displayOptions: {
          show: { resource: ['consent'], operation: ['recordConsent', 'recordWithdrawal', 'updateConsentPolicy'] },
        },
        description: 'Consent policy version the decision refers to. Required for updateConsentPolicy.',
      },
      {
        displayName: 'Visitor ID',
        name: 'visitorId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['consent'], operation: ['anonymizeVisitor'] } },
        description:
          'Visitor whose erasure is requested. This emits a deletion REQUEST event; actual erasure depends on collector support.',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const returnItems: INodeExecutionData[] = [];
    const items = this.getInputData();

    const credentials = await this.getCredentials('clickTrailApi') as ICredentialDataDecryptedObject;

    let url: URL;
    try {
      url = validateCollectorUrl(credentials.baseUrl);
    } catch (error) {
      throw new NodeApiError(this.getNode(), { message: (error as Error).message }, {
        message: 'ClickTrail: credential baseUrl must be a valid https:// URL.',
      });
    }
    const endpointPath = this.getNodeParameter('endpointPath', 0, '') as string;
    const targetUrl = `${url.toString().replace(/\/$/, '')}${endpointPath}`;
    const headers = buildRequestHeaders(credentials.apiKey);
    const timeout = typeof credentials.timeout === 'number' ? credentials.timeout : DEFAULT_TIMEOUT_MS;

    for (let i = 0; i < items.length; i++) {
      const resource = this.getNodeParameter('resource', i) as ResourceName;
      const operation = this.getNodeParameter('operation', i) as string;
      const opLabel = `${resource}.${operation}`;
      const def = OPERATIONS[resource]?.[operation];
      if (!def) {
        throw new NodeApiError(
          this.getNode(),
          { message: `Unknown ClickTrail operation ${opLabel}.` },
          {
            message: `ClickTrail ${opLabel}: unknown operation.`,
            itemIndex: i,
          },
        );
      }

      // Assemble builder input from the declared fields of this operation.
      const input: Record<string, unknown> = {};
      for (const field of OP_FIELDS[resource][operation] ?? []) {
        const value = this.getNodeParameter(field, i, '') as unknown;
        if (nonEmpty(value)) input[field] = value;
      }

      const context: BuilderContext = {};
      const siteId = this.getNodeParameter('siteId', i, '') as string;
      const workspaceId = this.getNodeParameter('workspaceId', i, '') as string;
      if (siteId !== '') context.siteId = siteId;
      if (workspaceId !== '') context.workspaceId = workspaceId;

      try {
        const event = await def.builder(input, context);
        const response = (await this.helpers.httpRequest({
          method: 'POST',
          url: targetUrl,
          body: { events: [event] },
          headers,
          timeout,
          json: true,
          returnFullResponse: true,
          ignoreHttpStatusErrors: true,
        })) as { statusCode: number };
        returnItems.push({ json: { ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode } });
      } catch (error) {
        throw new NodeApiError(
          this.getNode(),
          { message: error instanceof Error ? error.message : String(error) },
          {
            message: `ClickTrail ${opLabel}: request failed.`,
            itemIndex: i,
          },
        );
      }
    }

    return [returnItems];
  }
}

