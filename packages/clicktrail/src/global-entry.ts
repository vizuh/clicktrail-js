/**
 * IIFE global-build entry (dist/clicktrail.global.js).
 *
 * Attaches a `ClickTrail` namespace to globalThis from the /browser entry
 * (createClickTrail + createLegacyGlobal + destinations), plus the pure core
 * parser so hosts/pages can turn a landing URL into a ParsedTouch without a
 * module system (legacy WP embeds, integration probes).
 *
 * Import-only module: NO side effects beyond namespace attachment; nothing
 * here touches document/cookies/network. Instances are created by calling
 * ClickTrail.createClickTrail(...).start() from page code.
 */
import * as clicktrailBrowser from './browser/index.js';
import { parseAttributionUrl } from './core/parse.js';

const globals = globalThis as unknown as Record<string, unknown>;
globals['ClickTrail'] = { ...clicktrailBrowser, parseAttributionUrl };

export { clicktrailBrowser, parseAttributionUrl };
