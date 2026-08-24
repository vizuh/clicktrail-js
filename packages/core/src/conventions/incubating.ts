/**
 * INCUBATING attribution conventions.
 *
 * Subject to breaking changes in minor releases. Do not depend on this
 * entry point from published instrumentation libraries; copy definitions
 * into your codebase instead (same guidance as OpenTelemetry).
 */
import type { Channel } from './stable.js';

/** Durable identifier for one complete customer journey across surfaces. */
export const ATTR_JOURNEY_ID = 'journey.id' as const;

/** Conversation identifiers (Chatwoot-style surfaces). */
export const ATTR_CONVERSATION_ID = 'conversation.id' as const;
export const ATTR_MESSAGE_ID = 'conversation.message.id' as const;

/** Agent-run linkage (Hermes/n8n-style automation runs). */
export const ATTR_AGENT_RUN_ID = 'agent.run.id' as const;
export const ATTR_AGENT_NAME = 'agent.name' as const;

/** Correlation with an external OpenTelemetry trace. */
export const ATTR_AI_TRACE_ID = 'ai.trace_id' as const;

/** Actor types for journey events. */
export const ACTOR_TYPE_VALUE_HUMAN = 'human' as const;
export const ACTOR_TYPE_VALUE_AGENT = 'agent' as const;
export const ACTOR_TYPE_VALUE_AUTOMATION = 'automation' as const;
export const ACTOR_TYPE_VALUE_SYSTEM = 'system' as const;
export const ACTOR_TYPE_VALUE_ROBOT = 'robot' as const;

export type ActorType =
  | typeof ACTOR_TYPE_VALUE_HUMAN
  | typeof ACTOR_TYPE_VALUE_AGENT
  | typeof ACTOR_TYPE_VALUE_AUTOMATION
  | typeof ACTOR_TYPE_VALUE_SYSTEM
  | typeof ACTOR_TYPE_VALUE_ROBOT;

/** Incubating channels: AI-assistant referrals (ChatGPT, Perplexity, ...). */
export const CHANNEL_VALUE_AI_REFERRAL = 'ai_referral' as const;

/** Incubating event set. */
export const EVENT_CONVERSATION_STARTED = 'conversation.started' as const;
export const EVENT_AGENT_RUN_STARTED = 'agent.run.started' as const;
export const EVENT_AGENT_RUN_FINISHED = 'agent.run.finished' as const;
export const EVENT_HUMAN_HANDOFF = 'handoff.human' as const;
export const EVENT_LEAD_QUALIFIED = 'lead.qualified' as const;

/**
 * Known AI assistant referrer hosts. Incubating: membership and naming may
 * change without notice while the ecosystem settles.
 */
export const AI_REFERRER_HOSTS: ReadonlySet<string> = new Set([
  'chat.openai.com',
  'chatgpt.com',
  'perplexity.ai',
  'claude.ai',
  'gemini.google.com',
  'copilot.microsoft.com',
  'poe.com',
]);

/** Extended channel union including incubating members. */
export type IncubatingChannel = Channel | typeof CHANNEL_VALUE_AI_REFERRAL;
