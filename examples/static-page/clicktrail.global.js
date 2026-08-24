"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/browser/index.ts
  var browser_exports = {};
  __export(browser_exports, {
    ATTRIBUTION_KEY: () => ATTRIBUTION_KEY,
    ATTRIBUTION_STORAGE_KEYS: () => ATTRIBUTION_STORAGE_KEYS,
    CANONICAL_PAYLOAD_KEYS: () => CANONICAL_PAYLOAD_KEYS,
    DAY_MS: () => DAY_MS,
    LEGACY_ATTRIBUTION_KEY: () => LEGACY_ATTRIBUTION_KEY,
    LEGACY_KEY_ALIASES: () => LEGACY_KEY_ALIASES,
    SESSION_ID_FALLBACK_KEY: () => SESSION_ID_FALLBACK_KEY,
    SESSION_STATE_KEY: () => SESSION_STATE_KEY,
    SESSION_TIMEOUT_MS: () => SESSION_TIMEOUT_MS,
    TOUCH_SUFFIXES: () => TOUCH_SUFFIXES,
    VISITOR_ID_FALLBACK_KEY: () => VISITOR_ID_FALLBACK_KEY,
    applyBrowserIdentifiers: () => applyBrowserIdentifiers,
    buildEventPayload: () => buildEventPayload,
    buildMarketingTrailEnvelope: () => buildMarketingTrailEnvelope,
    clearAttributionStorage: () => clearAttributionStorage,
    collectBrowserIdsFromCookies: () => collectBrowserIdsFromCookies,
    cookieStorage: () => cookieStorage,
    createClickTrail: () => createClickTrail,
    createLegacyGlobal: () => createLegacyGlobal,
    dataLayerDestination: () => dataLayerDestination,
    filterCanonical: () => filterCanonical,
    generateId: () => generateId,
    httpDestination: () => httpDestination,
    loadAttributionPayload: () => loadAttributionPayload,
    mirrorStorage: () => mirrorStorage,
    normalizeLegacyAliases: () => normalizeLegacyAliases,
    parseCookieMap: () => parseCookieMap,
    parseGaSessionDataValue: () => parseGaSessionDataValue,
    rollSession: () => rollSession,
    saveAttributionPayload: () => saveAttributionPayload,
    uuidV4FromBytes: () => uuidV4FromBytes
  });

  // src/conventions/stable.ts
  var SCHEMA_VERSION = "1.2.0";
  var CLASSIFIER_VERSION = "1.2.0";
  var CHANNEL_VALUE_REFERRAL = "referral";

  // src/core/sanitize.ts
  var MAX_FIELD_LENGTH = 512;
  var MACRO_PATTERN = /^\{\{.+\}\}$/;
  function sanitizeField(value) {
    if (typeof value !== "string") return "";
    const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
    if (!cleaned || MACRO_PATTERN.test(cleaned)) return "";
    if (cleaned.length > MAX_FIELD_LENGTH) return cleaned.slice(0, MAX_FIELD_LENGTH);
    return cleaned;
  }
  function normalizeHost(host) {
    let h = host.trim().toLowerCase();
    h = h.replace(/^https?:\/\//, "");
    const slash = h.indexOf("/");
    if (slash !== -1) h = h.slice(0, slash);
    const colon = h.indexOf(":");
    if (colon !== -1) h = h.slice(0, colon);
    if (h.startsWith("www.")) h = h.slice(4);
    return h;
  }
  function hostMatches(host, base) {
    const h = normalizeHost(host);
    const b = normalizeHost(base);
    if (!h || !b) return false;
    return h === b || h.endsWith(`.${b}`);
  }
  function areRelatedHosts(firstHost, secondHost) {
    const a = normalizeHost(firstHost);
    const b = normalizeHost(secondHost);
    if (!a || !b) return false;
    return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
  }

  // src/core/knowledge.ts
  var SEARCH_REFERRER_RULES = [
    {
      source: "google",
      domains: [
        "google.com",
        "google.ad",
        "google.ae",
        "google.at",
        "google.be",
        "google.ca",
        "google.ch",
        "google.co.id",
        "google.co.in",
        "google.co.jp",
        "google.co.kr",
        "google.co.uk",
        "google.co.za",
        "google.com.ar",
        "google.com.au",
        "google.com.br",
        "google.com.mx",
        "google.com.sg",
        "google.com.tr",
        "google.com.ua",
        "google.cz",
        "google.de",
        "google.dk",
        "google.es",
        "google.fi",
        "google.fr",
        "google.gr",
        "google.hu",
        "google.ie",
        "google.it",
        "google.nl",
        "google.no",
        "google.pl",
        "google.pt",
        "google.ro",
        "google.ru",
        "google.se"
      ]
    },
    { source: "bing", domains: ["bing.com"] },
    {
      source: "yahoo",
      domains: [
        "yahoo.com",
        "yahoo.co.jp",
        "yahoo.co.uk",
        "yahoo.com.au",
        "yahoo.com.br",
        "yahoo.ca",
        "yahoo.de",
        "yahoo.es",
        "yahoo.fr",
        "yahoo.it"
      ]
    },
    { source: "duckduckgo", domains: ["duckduckgo.com"] },
    { source: "ecosia", domains: ["ecosia.org"] },
    {
      source: "yandex",
      domains: ["yandex.com", "yandex.ru", "yandex.by", "yandex.kz", "yandex.com.tr", "ya.ru"]
    },
    { source: "baidu", domains: ["baidu.com"] },
    // Engine additions below (plugin treats these as plain referral):
    { source: "brave", domains: ["search.brave.com"] },
    { source: "startpage", domains: ["startpage.com"] }
  ];
  var SOCIAL_REFERRER_RULES = [
    { source: "facebook", domains: ["facebook.com", "fb.com"] },
    { source: "instagram", domains: ["instagram.com"] },
    { source: "linkedin", domains: ["linkedin.com", "lnkd.in"] },
    { source: "twitter", domains: ["twitter.com", "x.com", "t.co"] },
    { source: "tiktok", domains: ["tiktok.com"] },
    { source: "pinterest", domains: ["pinterest.com", "pin.it"] },
    { source: "youtube", domains: ["youtube.com", "youtu.be"] },
    { source: "reddit", domains: ["reddit.com", "redd.it"] },
    { source: "threads", domains: ["threads.net"] },
    { source: "whatsapp", domains: ["whatsapp.com", "wa.me"] },
    { source: "telegram", domains: ["telegram.me", "t.me"] },
    { source: "discord", domains: ["discord.com"] }
  ];
  var CHANNEL_LABELS = {
    // Paid click-ID platforms
    GOOGLE_ADS: "Google Ads",
    MICROSOFT_ADS: "Microsoft Ads",
    FACEBOOK_ADS: "Facebook Ads",
    LINKEDIN_ADS: "LinkedIn Ads",
    X_ADS: "X Ads",
    REDDIT_ADS: "Reddit Ads",
    TIKTOK_ADS: "TikTok Ads",
    PINTEREST_ADS: "Pinterest Ads",
    SNAPCHAT_ADS: "Snapchat Ads",
    DISPLAY_VIDEO_360: "Display & Video 360",
    PAID_SOCIAL: "Paid Social",
    PAID_SEARCH: "Paid Search",
    // Email platforms (Mailchimp reserved: its mc_cid/mc_eid triggers were
    // dropped from capture per ruling #1)
    MAILCHIMP: "Mailchimp",
    HUBSPOT: "HubSpot",
    SALESFORCE_PARDOT: "Salesforce Pardot",
    CONSTANT_CONTACT: "Constant Contact",
    // AI-assistant referrers
    CHATGPT: "ChatGPT",
    PERPLEXITY: "Perplexity",
    MICROSOFT_COPILOT: "Microsoft Copilot",
    GEMINI: "Gemini",
    CLAUDE: "Claude",
    GROK: "Grok",
    DEEPSEEK: "DeepSeek",
    // Organic search referrers (Brave/Startpage/Ecosia/Baidu are engine additions)
    GOOGLE_ORGANIC: "Google Organic",
    BING_ORGANIC: "Bing Organic",
    YAHOO: "Yahoo",
    DUCKDUCKGO: "DuckDuckGo",
    YANDEX: "Yandex",
    BRAVE: "Brave",
    STARTPAGE: "Startpage",
    ECOSIA: "Ecosia",
    BAIDU: "Baidu",
    // Organic social referrers
    FACEBOOK_ORGANIC: "Facebook Organic",
    INSTAGRAM_ORGANIC: "Instagram Organic",
    LINKEDIN_ORGANIC: "LinkedIn Organic",
    X_ORGANIC: "X Organic",
    REDDIT_ORGANIC: "Reddit Organic",
    TIKTOK_ORGANIC: "TikTok Organic",
    PINTEREST_ORGANIC: "Pinterest Organic",
    YOUTUBE_ORGANIC: "YouTube",
    THREADS: "Threads",
    WHATSAPP: "WhatsApp",
    TELEGRAM: "Telegram",
    DISCORD: "Discord",
    // Uncertain-certainty click-ID platforms WITHOUT paid evidence (ruling D2):
    // the surface is proven, the payment is not.
    FACEBOOK: "Facebook",
    INSTAGRAM: "Instagram",
    TIKTOK: "TikTok",
    LINKEDIN: "LinkedIn",
    TWITTER_X: "X",
    SNAPCHAT: "Snapchat",
    PINTEREST: "Pinterest",
    // Fallback
    UNKNOWN: "Unknown"
  };
  var PAID_MEDIUMS = ["cpc", "ppc", "paid", "paidsearch", "paid_social"];
  var AI_ASSISTANT_RULES = [
    { label: CHANNEL_LABELS.CHATGPT, domains: ["chatgpt.com", "chat.openai.com"] },
    { label: CHANNEL_LABELS.PERPLEXITY, domains: ["perplexity.ai"] },
    { label: CHANNEL_LABELS.MICROSOFT_COPILOT, domains: ["copilot.microsoft.com"] },
    { label: CHANNEL_LABELS.GEMINI, domains: ["gemini.google.com"] },
    { label: CHANNEL_LABELS.CLAUDE, domains: ["claude.ai"] },
    { label: CHANNEL_LABELS.GROK, domains: ["grok.com"] },
    { label: CHANNEL_LABELS.DEEPSEEK, domains: ["deepseek.com"] }
  ];
  var REFERRER_SOURCE_LABELS = {
    google: CHANNEL_LABELS.GOOGLE_ORGANIC,
    bing: CHANNEL_LABELS.BING_ORGANIC,
    yahoo: CHANNEL_LABELS.YAHOO,
    duckduckgo: CHANNEL_LABELS.DUCKDUCKGO,
    ecosia: CHANNEL_LABELS.ECOSIA,
    yandex: CHANNEL_LABELS.YANDEX,
    baidu: CHANNEL_LABELS.BAIDU,
    brave: CHANNEL_LABELS.BRAVE,
    startpage: CHANNEL_LABELS.STARTPAGE,
    facebook: CHANNEL_LABELS.FACEBOOK_ORGANIC,
    instagram: CHANNEL_LABELS.INSTAGRAM_ORGANIC,
    linkedin: CHANNEL_LABELS.LINKEDIN_ORGANIC,
    twitter: CHANNEL_LABELS.X_ORGANIC,
    tiktok: CHANNEL_LABELS.TIKTOK_ORGANIC,
    pinterest: CHANNEL_LABELS.PINTEREST_ORGANIC,
    youtube: CHANNEL_LABELS.YOUTUBE_ORGANIC,
    reddit: CHANNEL_LABELS.REDDIT_ORGANIC,
    threads: CHANNEL_LABELS.THREADS,
    whatsapp: CHANNEL_LABELS.WHATSAPP,
    telegram: CHANNEL_LABELS.TELEGRAM,
    discord: CHANNEL_LABELS.DISCORD
  };
  function paidLabelFromSource(source, medium) {
    if (["google", "google ads", "googleads", "youtube", "gdn"].includes(source)) {
      return CHANNEL_LABELS.GOOGLE_ADS;
    }
    if (["bing", "microsoft", "msn"].includes(source)) return CHANNEL_LABELS.MICROSOFT_ADS;
    if (["facebook", "meta", "instagram", "fb", "ig"].includes(source)) return CHANNEL_LABELS.FACEBOOK_ADS;
    if (source === "linkedin") return CHANNEL_LABELS.LINKEDIN_ADS;
    if (["twitter", "x"].includes(source)) return CHANNEL_LABELS.X_ADS;
    if (source === "reddit") return CHANNEL_LABELS.REDDIT_ADS;
    if (source === "tiktok") return CHANNEL_LABELS.TIKTOK_ADS;
    if (source === "pinterest") return CHANNEL_LABELS.PINTEREST_ADS;
    if (["snapchat", "snap"].includes(source)) return CHANNEL_LABELS.SNAPCHAT_ADS;
    return medium === "paid_social" ? CHANNEL_LABELS.PAID_SOCIAL : CHANNEL_LABELS.PAID_SEARCH;
  }
  function referrerParts(rawReferrer) {
    if (!rawReferrer) return null;
    try {
      const u = new URL(rawReferrer);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      const host = normalizeHost(u.host);
      if (!host) return null;
      return { host, pathname: u.pathname };
    } catch {
      return null;
    }
  }
  function matchesAnyDomain(host, domains) {
    return domains.some((domain) => hostMatches(host, domain));
  }
  function resolveChannelLabel(input) {
    const ids = input.clickIds;
    const medium = input.medium.trim().toLowerCase();
    const hasPaidEvidence = PAID_MEDIUMS.includes(medium);
    if (ids.gclid || ids.gbraid || ids.wbraid) return CHANNEL_LABELS.GOOGLE_ADS;
    if (ids.msclkid) return CHANNEL_LABELS.MICROSOFT_ADS;
    if (ids.li_fat_id) return hasPaidEvidence ? CHANNEL_LABELS.LINKEDIN_ADS : CHANNEL_LABELS.LINKEDIN;
    if (ids.twclid) return hasPaidEvidence ? CHANNEL_LABELS.X_ADS : CHANNEL_LABELS.TWITTER_X;
    if (ids.ttclid) return hasPaidEvidence ? CHANNEL_LABELS.TIKTOK_ADS : CHANNEL_LABELS.TIKTOK;
    if (ids.epik) return hasPaidEvidence ? CHANNEL_LABELS.PINTEREST_ADS : CHANNEL_LABELS.PINTEREST;
    if (ids.sccid) return hasPaidEvidence ? CHANNEL_LABELS.SNAPCHAT_ADS : CHANNEL_LABELS.SNAPCHAT;
    if (ids.fbclid) return hasPaidEvidence ? CHANNEL_LABELS.FACEBOOK_ADS : CHANNEL_LABELS.FACEBOOK;
    const source = input.source.trim().toLowerCase();
    if (source === "hubspot") return CHANNEL_LABELS.HUBSPOT;
    if (source === "pardot") return CHANNEL_LABELS.SALESFORCE_PARDOT;
    if (source === "constantcontact") return CHANNEL_LABELS.CONSTANT_CONTACT;
    if (PAID_MEDIUMS.includes(medium)) return paidLabelFromSource(source, medium);
    const ref = referrerParts(input.referrer);
    if (ref) {
      for (const rule of AI_ASSISTANT_RULES) {
        if (matchesAnyDomain(ref.host, rule.domains)) return rule.label;
      }
      if (matchesAnyDomain(ref.host, ["bing.com"]) && ref.pathname.startsWith("/chat")) return CHANNEL_LABELS.MICROSOFT_COPILOT;
      if (matchesAnyDomain(ref.host, ["x.com"]) && ref.pathname.startsWith("/i/grok")) return CHANNEL_LABELS.GROK;
      for (const rule of SEARCH_REFERRER_RULES) {
        if (matchesAnyDomain(ref.host, rule.domains)) return REFERRER_SOURCE_LABELS[rule.source] ?? CHANNEL_LABELS.UNKNOWN;
      }
      for (const rule of SOCIAL_REFERRER_RULES) {
        if (matchesAnyDomain(ref.host, rule.domains)) return REFERRER_SOURCE_LABELS[rule.source] ?? CHANNEL_LABELS.UNKNOWN;
      }
    }
    return CHANNEL_LABELS.UNKNOWN;
  }
  var CLICK_ID_PLATFORMS = {
    // Advertising-only identifiers: paid classification is unambiguous.
    gclid: { source: "google", certainty: "certain", paidChannel: "paid_search" },
    wbraid: { source: "google", certainty: "certain", paidChannel: "paid_search" },
    gbraid: { source: "google", certainty: "certain", paidChannel: "paid_search" },
    msclkid: { source: "bing", certainty: "certain", paidChannel: "paid_search" },
    // Platform identifiers also appended to non-paid outbound links: the mere
    // presence proves the SURFACE, not the payment (D2). paidChannel applies
    // only when explicit paid evidence exists alongside.
    fbclid: { source: "facebook", certainty: "uncertain", paidChannel: "paid_social" },
    ttclid: { source: "tiktok", certainty: "uncertain", paidChannel: "paid_social" },
    twclid: { source: "twitter", certainty: "uncertain", paidChannel: "paid_social" },
    li_fat_id: { source: "linkedin", certainty: "uncertain", paidChannel: "paid_social" },
    sccid: { source: "snapchat", certainty: "uncertain", paidChannel: "paid_social" },
    epik: { source: "pinterest", certainty: "uncertain", paidChannel: "paid_social" }
  };
  var CLICK_ID_HISTORY_KEY = "click_id_history";
  var ATTRIBUTION_SELECTED_CLICK_ID_KEY = "attribution_selected_click_id";
  var ATTRIBUTION_SELECTED_CLICK_ID_REASON_KEY = "attribution_selected_click_id_reason";
  var CLICK_ID_HISTORY_LIMIT = 50;
  var CLICK_ID_KEYS = [
    "gclid",
    "wbraid",
    "gbraid",
    "fbclid",
    "ttclid",
    "msclkid",
    "twclid",
    "li_fat_id",
    "sccid",
    "epik"
  ];
  var BROWSER_ID_KEYS = [
    "fbc",
    "fbp",
    "ttp",
    "li_gc",
    "ga_client_id",
    "ga_session_id",
    "ga_session_number"
  ];
  var BROWSER_ID_PARAMS = {
    fbc: "fbc",
    _fbc: "fbc",
    fbp: "fbp",
    _fbp: "fbp",
    ttp: "ttp",
    _ttp: "ttp",
    li_gc: "li_gc",
    ga_client_id: "ga_client_id",
    ga_session_id: "ga_session_id",
    ga_session_number: "ga_session_number"
  };
  function parseGaClientIdValue(raw) {
    const value = raw.trim();
    if (!value) return "";
    const parts = value.split(".");
    if (parts.length >= 4) {
      const left = parts[parts.length - 2];
      const right = parts[parts.length - 1];
      if (/^\d+$/.test(left) && /^\d+$/.test(right)) return `${left}.${right}`;
    }
    return "";
  }
  var UTM_PARAM_TO_FIELD = {
    utm_source: "source",
    utm_medium: "medium",
    utm_campaign: "campaign",
    utm_term: "term",
    utm_content: "content",
    utm_id: "utmId",
    utm_source_platform: "utmSourcePlatform",
    utm_creative_format: "utmCreativeFormat",
    utm_marketing_tactic: "utmMarketingTactic"
  };
  var PARAM_ALIASES = {
    sc_click_id: "sccid"
  };
  function touchKeys(prefix) {
    return {
      source: `${prefix}_source`,
      medium: `${prefix}_medium`,
      campaign: `${prefix}_campaign`,
      term: `${prefix}_term`,
      content: `${prefix}_content`,
      utmId: `${prefix}_utm_id`,
      utmSourcePlatform: `${prefix}_utm_source_platform`,
      utmCreativeFormat: `${prefix}_utm_creative_format`,
      utmMarketingTactic: `${prefix}_utm_marketing_tactic`,
      channel: `${prefix}_channel`,
      referrer: `${prefix}_referrer`,
      landingPage: `${prefix}_landing_page`,
      touchTimestamp: `${prefix}_touch_timestamp`
    };
  }

  // src/core/merge.ts
  var FT = touchKeys("ft");
  var LT = touchKeys("lt");
  function emptyAttribution() {
    const payload = {};
    for (const key of Object.values(FT)) payload[key] = "";
    for (const key of Object.values(LT)) payload[key] = "";
    for (const key of CLICK_ID_KEYS) payload[key] = "";
    for (const key of BROWSER_ID_KEYS) payload[key] = "";
    payload[CLICK_ID_HISTORY_KEY] = "[]";
    payload[ATTRIBUTION_SELECTED_CLICK_ID_KEY] = "";
    payload[ATTRIBUTION_SELECTED_CLICK_ID_REASON_KEY] = "";
    return payload;
  }
  function applyClickIdSelectionAudit(next, capturedNow, timestamp) {
    let history = [];
    try {
      const parsed = next[CLICK_ID_HISTORY_KEY] ? JSON.parse(next[CLICK_ID_HISTORY_KEY]) : [];
      if (Array.isArray(parsed)) history = parsed;
    } catch {
      history = [];
    }
    for (const entry of capturedNow) {
      history.push({ k: entry.k, v: entry.v, t: timestamp });
    }
    if (history.length > CLICK_ID_HISTORY_LIMIT) {
      history = history.slice(history.length - CLICK_ID_HISTORY_LIMIT);
    }
    next[CLICK_ID_HISTORY_KEY] = JSON.stringify(history);
    const newestValid = [...history].reverse().find((e) => typeof e.v === "string" && e.v !== "");
    if (!newestValid) return;
    const previousSelected = next[ATTRIBUTION_SELECTED_CLICK_ID_KEY];
    if (!previousSelected) {
      next[ATTRIBUTION_SELECTED_CLICK_ID_KEY] = newestValid.v;
      next[ATTRIBUTION_SELECTED_CLICK_ID_REASON_KEY] = "newest_valid";
    } else if (previousSelected !== newestValid.v) {
      next[ATTRIBUTION_SELECTED_CLICK_ID_KEY] = newestValid.v;
      next[ATTRIBUTION_SELECTED_CLICK_ID_REASON_KEY] = "newest_valid_superseded_previous";
    } else if (capturedNow.length > 0) {
      next[ATTRIBUTION_SELECTED_CLICK_ID_REASON_KEY] = "newest_valid";
    }
  }
  function mergeAttributionTouch(stored, touch) {
    const next = { ...stored };
    const ftEmpty = !next[FT.source] && !next[FT.medium] && !next[FT.campaign] && !next[FT.referrer] && !next[FT.landingPage] && CLICK_ID_KEYS.every((key) => !next[`ft_${key}`]);
    if (ftEmpty) {
      next[FT.source] = touch.source;
      next[FT.medium] = touch.medium;
      next[FT.campaign] = touch.campaign;
      next[FT.term] = touch.term;
      next[FT.content] = touch.content;
      next[FT.utmId] = touch.utmId;
      next[FT.utmSourcePlatform] = touch.utmSourcePlatform;
      next[FT.utmCreativeFormat] = touch.utmCreativeFormat;
      next[FT.utmMarketingTactic] = touch.utmMarketingTactic;
      next[FT.channel] = touch.channelLabel;
      next[FT.referrer] = touch.referrer;
      next[FT.landingPage] = touch.landingPage;
      next[FT.touchTimestamp] = touch.touchTimestamp;
      for (const key of CLICK_ID_KEYS) {
        const value = touch.clickIds?.[key];
        if (value) next[`ft_${key}`] = value;
      }
    }
    next[LT.source] = touch.source;
    next[LT.medium] = touch.medium;
    next[LT.campaign] = touch.campaign;
    next[LT.term] = touch.term;
    next[LT.content] = touch.content;
    next[LT.utmId] = touch.utmId;
    next[LT.utmSourcePlatform] = touch.utmSourcePlatform;
    next[LT.utmCreativeFormat] = touch.utmCreativeFormat;
    next[LT.utmMarketingTactic] = touch.utmMarketingTactic;
    next[LT.channel] = touch.channelLabel;
    next[LT.referrer] = touch.referrer;
    next[LT.landingPage] = touch.landingPage;
    next[LT.touchTimestamp] = touch.touchTimestamp;
    for (const key of CLICK_ID_KEYS) {
      const value = touch.clickIds?.[key];
      if (value) next[`lt_${key}`] = value;
    }
    const capturedNow = [];
    for (const key of CLICK_ID_KEYS) {
      const value = touch.clickIds?.[key];
      if (value) {
        next[key] = value;
        capturedNow.push({ k: key, v: value });
      }
    }
    applyClickIdSelectionAudit(next, capturedNow, touch.touchTimestamp);
    for (const key of BROWSER_ID_KEYS) {
      const value = touch.browserIds?.[key];
      if (value) next[key] = value;
    }
    return next;
  }
  function stampVersions(payload) {
    return {
      ...payload,
      schema_version: SCHEMA_VERSION,
      classifier_version: CLASSIFIER_VERSION
    };
  }

  // src/browser/serialize.ts
  var CLICK_ID_KEYS2 = [
    "gclid",
    "wbraid",
    "gbraid",
    "fbclid",
    "ttclid",
    "msclkid",
    "twclid",
    "li_fat_id",
    "sccid",
    "epik"
  ];
  function text(value) {
    return typeof value === "string" ? value : value == null ? "" : String(value);
  }
  function firstText(...values) {
    for (const value of values) {
      const candidate = text(value);
      if (candidate) return candidate;
    }
    return "";
  }
  function prefixed(value, prefix) {
    const candidate = text(value);
    if (!candidate) return "";
    return candidate.startsWith(prefix) ? candidate : `${prefix}${candidate}`;
  }
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function touchValue(payload, key, data) {
    return firstText(data[key], payload[`lt_${key}`], payload[`ft_${key}`], payload[key]);
  }
  function canonicalEventName(eventName) {
    return ["lead", "lead.submitted", "lead_submitted", "form_submission"].includes(eventName) ? "lead_submitted" : eventName;
  }
  function buildMarketingTrailEnvelope(payload, eventName, data = {}, context = {}) {
    const supplied = isRecord(data["marketing_trail"]) ? data["marketing_trail"] : {};
    const visitorId = firstText(context.identity?.visitorId, data["visitor_id"], payload["visitor_id"]);
    const anonymousId = prefixed(firstText(supplied["anonymous_id"], data["anonymous_id"], visitorId), "anon_");
    const eventId = prefixed(firstText(supplied["event_id"], data["event_id"]), "evt_");
    const leadEvent = ["lead", "lead.submitted", "lead_submitted", "form_submission"].includes(eventName);
    const leadId = prefixed(
      firstText(supplied["lead_id"], data["lead_id"], leadEvent ? eventId.replace(/^evt_/, "") : ""),
      "lead_"
    );
    const clickIds = {};
    const suppliedClickIds = isRecord(supplied["click_ids"]) ? supplied["click_ids"] : {};
    const dataClickIds = isRecord(data["click_ids"]) ? data["click_ids"] : {};
    for (const key of CLICK_ID_KEYS2) {
      const value = firstText(
        suppliedClickIds[key],
        dataClickIds[key],
        payload[key],
        payload[`lt_${key}`],
        payload[`ft_${key}`]
      );
      if (value) clickIds[key] = value;
    }
    const suppliedForm = isRecord(supplied["form"]) ? supplied["form"] : {};
    const dataForm = isRecord(data["form"]) ? data["form"] : isRecord(data["lead_context"]) ? data["lead_context"] : {};
    const suppliedConsent = isRecord(supplied["consent"]) ? supplied["consent"] : {};
    const dataConsent = isRecord(data["consent"]) ? data["consent"] : {};
    const consent = context.consent ?? dataConsent;
    return {
      schema_version: 1,
      event_id: eventId,
      trail_id: prefixed(firstText(supplied["trail_id"], data["trail_id"], payload["trail_id"], visitorId), "trl_"),
      anonymous_id: anonymousId,
      lead_id: leadId,
      workspace_id: firstText(supplied["workspace_id"], data["workspace_id"], context.workspaceId),
      site_id: firstText(supplied["site_id"], data["site_id"], context.siteId),
      event_name: firstText(supplied["event_name"], canonicalEventName(eventName)),
      occurred_at: firstText(supplied["occurred_at"], data["occurred_at"], data["event_time"]),
      landing_page: firstText(supplied["landing_page"], touchValue(payload, "landing_page", data)),
      referrer: firstText(supplied["referrer"], touchValue(payload, "referrer", data)),
      source: firstText(supplied["source"], touchValue(payload, "source", data)),
      medium: firstText(supplied["medium"], touchValue(payload, "medium", data)),
      campaign: firstText(supplied["campaign"], touchValue(payload, "campaign", data)),
      click_ids: clickIds,
      consent: {
        analytics: Boolean(suppliedConsent["analytics"] ?? consent["analytics"]),
        advertising: Boolean(suppliedConsent["advertising"] ?? suppliedConsent["marketing"] ?? consent["advertising"] ?? consent["marketing"])
      },
      form: {
        provider: firstText(suppliedForm["provider"], dataForm["provider"], data["form_provider"]),
        form_id: firstText(suppliedForm["form_id"], dataForm["form_id"], data["form_id"])
      }
    };
  }
  function buildEventPayload(payload, eventName, data, context) {
    const base = { ...payload };
    if (data) Object.assign(base, data);
    base.event_name = eventName;
    base.marketing_trail = buildMarketingTrailEnvelope(payload, eventName, base, context);
    return stampVersions(base);
  }

  // src/browser/transport.ts
  var DEFAULT_BATCH_SIZE = 10;
  function defaultSend(useBeacon) {
    return (endpoint, body) => {
      if (useBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(endpoint, blob)) return;
      }
      return fetch(endpoint, {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body
      }).then(() => void 0);
    };
  }
  function httpDestination(config) {
    const batchSize = Math.max(1, config.batchSize ?? DEFAULT_BATCH_SIZE);
    const useBeacon = config.beacon ?? true;
    const send = config.send ?? defaultSend(useBeacon);
    let batch = [];
    const flushBatch = async () => {
      if (batch.length === 0) return;
      const events = batch;
      const body = JSON.stringify({ events });
      batch = [];
      try {
        await send(config.endpoint, body);
      } catch (error) {
        try {
          config.onDropped?.(events, error);
        } catch {
        }
      }
    };
    return {
      name: "http",
      deliver(event) {
        batch.push(event);
        if (batch.length >= batchSize) void flushBatch();
      },
      flush: flushBatch
    };
  }
  function dataLayerDestination(config = {}) {
    let arr = config.dataLayer;
    return {
      name: "dataLayer",
      start() {
        arr ??= [];
      },
      deliver(event) {
        (arr ??= []).push({ ...event, event: event.event_name });
      },
      getArray() {
        return arr ??= [];
      }
    };
  }

  // src/browser/global-adapter.ts
  function createLegacyGlobal(instance) {
    return {
      getData: () => instance.getData(),
      getField: (key) => instance.getField(key),
      clearData: () => instance.clearData(),
      getSession: () => instance.getSession()
    };
  }

  // src/browser/browser-ids.ts
  function parseCookieMap(raw) {
    const out = {};
    if (!raw) return out;
    for (const pair of raw.split(";")) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const name = trimmed.slice(0, eq).trim().toLowerCase();
      if (!name) continue;
      let value = trimmed.slice(eq + 1);
      try {
        value = decodeURIComponent(value);
      } catch {
      }
      out[name] = value;
    }
    return out;
  }
  function parseGaSessionDataValue(rawValue) {
    const value = rawValue.trim();
    if (!value) return {};
    const out = {};
    const gs2SessionId = value.match(/(?:^|\$)s(\d{6,})(?:\$|$)/);
    const gs2SessionNumber = value.match(/(?:^|\$)o(\d+)(?:\$|$)/);
    const gs2Id = gs2SessionId?.[1];
    const gs2Num = gs2SessionNumber?.[1];
    if (gs2Id) out.ga_session_id = gs2Id;
    if (gs2Num) out.ga_session_number = gs2Num;
    if (out.ga_session_id || out.ga_session_number) return out;
    if (value.startsWith("GS1.")) {
      const parts = value.split(".");
      const gs1SessionId = parts[2];
      const gs1SessionNumber = parts[3];
      if (gs1SessionId) out.ga_session_id = gs1SessionId;
      if (gs1SessionNumber) out.ga_session_number = gs1SessionNumber;
      if (out.ga_session_id || out.ga_session_number) return out;
    }
    const numericTokens = value.match(/\d+/g) ?? [];
    if (numericTokens[0]) out.ga_session_id = numericTokens[0];
    if (numericTokens[1]) out.ga_session_number = numericTokens[1];
    return out;
  }
  function firstCookie(cookies, names) {
    for (const name of names) {
      const value = cookies[name];
      if (value) return value;
    }
    return "";
  }
  function collectBrowserIdsFromCookies(cookies) {
    const out = {};
    const fbp = firstCookie(cookies, ["_fbp", "fbp"]);
    if (fbp) out.fbp = fbp;
    const fbc = firstCookie(cookies, ["_fbc", "fbc"]);
    if (fbc) out.fbc = fbc;
    const ttp = firstCookie(cookies, ["_ttp", "ttp"]);
    if (ttp) out.ttp = ttp;
    const liGc = cookies.li_gc;
    if (liGc) out.li_gc = liGc;
    const gaClientId = parseGaClientIdValue(firstCookie(cookies, ["_ga"]));
    if (gaClientId) out.ga_client_id = gaClientId;
    for (const [name, value] of Object.entries(cookies)) {
      if (name === "_ga" || !name.startsWith("_ga_")) continue;
      const session = parseGaSessionDataValue(value);
      if (!session.ga_session_id && !session.ga_session_number) continue;
      if (session.ga_session_id) out.ga_session_id = session.ga_session_id;
      if (session.ga_session_number) out.ga_session_number = session.ga_session_number;
      break;
    }
    if (!out.ga_session_id && cookies.ga_session_id) out.ga_session_id = cookies.ga_session_id;
    if (!out.ga_session_number && cookies.ga_session_number) {
      out.ga_session_number = cookies.ga_session_number;
    }
    const canonical = {};
    for (const key of BROWSER_ID_KEYS) {
      const value = out[key];
      if (value) canonical[key] = value;
    }
    return canonical;
  }
  function applyBrowserIdentifiers(payload, ids) {
    let changed = false;
    const next = { ...payload };
    for (const key of BROWSER_ID_KEYS) {
      const value = ids[key];
      if (!value) continue;
      if (next[key] === value) continue;
      next[key] = value;
      changed = true;
    }
    return changed ? next : payload;
  }

  // src/core/diagnostics.ts
  var DIAGNOSTIC_CODES = {
    CLICK_ID_WITHOUT_UTM: "click_id_without_utm",
    NO_SIGNAL_LANDING: "no_signal_landing",
    INTERNAL_REFERRER_IGNORED: "internal_referrer_ignored",
    CONSENT_DENIED_CAPTURE_ATTEMPTED: "consent_denied_capture_attempted",
    FIELD_TRUNCATED: "field_truncated"
  };
  var nullDiagnosticSink = { report: () => {
  } };

  // src/browser/storage.ts
  var DAY_MS = 864e5;
  var ATTRIBUTION_KEY = "attribution";
  var LEGACY_ATTRIBUTION_KEY = "ct_attribution";
  var SESSION_ID_FALLBACK_KEY = "ct_session_id";
  var VISITOR_ID_FALLBACK_KEY = "ct_visitor_id";
  var SESSION_STATE_KEY = "ct_session";
  var SIGNING_KEY_KEY = "ct_signing_key";
  var JOURNEY_ID_KEY = "ct_journey_id";
  var ATTRIBUTION_STORAGE_KEYS = [
    ATTRIBUTION_KEY,
    LEGACY_ATTRIBUTION_KEY,
    SESSION_ID_FALLBACK_KEY,
    VISITOR_ID_FALLBACK_KEY,
    SESSION_STATE_KEY,
    SIGNING_KEY_KEY,
    JOURNEY_ID_KEY
  ];
  function clearAttributionStorage(...adapters) {
    for (const adapter of adapters) {
      for (const key of ATTRIBUTION_STORAGE_KEYS) adapter.delete(key);
    }
  }
  function serializeCookie(name, value, attrs) {
    let out = `${name}=${encodeURIComponent(value)}`;
    if (attrs.path !== void 0) out += `; Path=${attrs.path}`;
    if (attrs.domain !== void 0) out += `; Domain=${attrs.domain}`;
    if (attrs.maxAgeSeconds !== void 0) out += `; Max-Age=${attrs.maxAgeSeconds}`;
    if (attrs.secure === true) out += "; Secure";
    if (attrs.sameSite !== void 0) out += `; SameSite=${attrs.sameSite}`;
    return out;
  }
  function parseCookies(raw) {
    const map = /* @__PURE__ */ new Map();
    if (raw === "") return map;
    for (const pair of raw.split(";")) {
      const idx = pair.indexOf("=");
      if (idx <= 0) continue;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      try {
        map.set(name, decodeURIComponent(value));
      } catch {
        map.set(name, value);
      }
    }
    return map;
  }
  function defaultCookieJar() {
    const doc = () => globalThis.document;
    return {
      read: () => doc()?.cookie ?? "",
      write: (cookieString) => {
        const d = doc();
        if (d) d.cookie = cookieString;
      }
    };
  }
  function cookieStorage(config = {}) {
    const attrs = {
      path: "/",
      sameSite: "Lax",
      ...config.attrs ?? {}
    };
    const jar = config.jar ?? defaultCookieJar();
    return {
      get(key) {
        return parseCookies(jar.read()).get(key) ?? null;
      },
      set(key, value) {
        jar.write(serializeCookie(key, value, attrs));
      },
      delete(key) {
        jar.write(
          serializeCookie(key, "", { ...attrs, maxAgeSeconds: 0 })
        );
      }
    };
  }
  function defaultMirrorBackend() {
    const ls = globalThis.localStorage;
    return ls ?? null;
  }
  function parseEnvelope(raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return null;
      const env = parsed;
      if (env["v"] !== 1) return null;
      if (!("expires_at" in env)) return null;
      if (typeof env["data"] !== "string") return null;
      const expiresAt = env["expires_at"];
      if (expiresAt !== null && typeof expiresAt !== "number") return null;
      return { v: 1, expires_at: expiresAt, data: env["data"] };
    } catch {
      return null;
    }
  }
  function mirrorStorage(config = {}) {
    const backend = config.backend !== void 0 ? config.backend : defaultMirrorBackend();
    const nowMs = config.nowMs ?? (() => Date.now());
    const ttlMs = config.retentionDays !== void 0 ? config.retentionDays * DAY_MS : null;
    return {
      get(key) {
        if (!backend) return null;
        const raw = backend.getItem(key);
        if (raw === null) return null;
        const env = parseEnvelope(raw);
        if (env === null) {
          backend.removeItem(key);
          return null;
        }
        if (env.expires_at !== null && nowMs() >= env.expires_at) {
          backend.removeItem(key);
          return null;
        }
        return env.data;
      },
      set(key, value) {
        if (!backend) return;
        const env = {
          v: 1,
          expires_at: ttlMs === null ? null : nowMs() + ttlMs,
          data: value
        };
        try {
          backend.setItem(key, JSON.stringify(env));
        } catch {
        }
      },
      delete(key) {
        if (!backend) return;
        backend.removeItem(key);
      }
    };
  }

  // src/browser/identity.ts
  var SESSION_TIMEOUT_MS = 30 * 60 * 1e3;
  function uuidV4FromBytes(bytes) {
    if (bytes.length < 16) throw new Error("uuidV4FromBytes needs 16 bytes");
    const b = bytes.slice(0, 16);
    b[6] = b[6] & 15 | 64;
    b[8] = b[8] & 63 | 128;
    const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
  function generateId(randomBytes) {
    return uuidV4FromBytes(randomBytes(16));
  }
  function rollSession(input) {
    const { lastEventTs, now, timeoutMs } = input;
    if (lastEventTs === null) return true;
    if (now < lastEventTs) return false;
    return now - lastEventTs >= timeoutMs;
  }
  function readStoredSession(adapter) {
    const raw = adapter.get(SESSION_STATE_KEY);
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return null;
      const rec = parsed;
      const sessionId = rec["session_id"];
      const sessionNumber = rec["session_number"];
      const lastEventTs = rec["last_event_ts"];
      if (typeof sessionId !== "string" || sessionId === "") return null;
      if (typeof sessionNumber !== "number" || !Number.isInteger(sessionNumber)) return null;
      if (typeof lastEventTs !== "number") return null;
      return { session_id: sessionId, session_number: sessionNumber, last_event_ts: lastEventTs };
    } catch {
      return null;
    }
  }
  function persist(adapter, state, visitorId) {
    adapter.set(SESSION_STATE_KEY, JSON.stringify(state));
    adapter.set(VISITOR_ID_FALLBACK_KEY, visitorId);
    adapter.set(SESSION_ID_FALLBACK_KEY, state.session_id);
  }
  function createIdentityStore(config) {
    const adapter = config.adapter;
    const randomBytes = config.randomBytes;
    const nowMs = config.nowMs;
    const timeoutMs = config.timeoutMs ?? SESSION_TIMEOUT_MS;
    let cachedVisitorId = null;
    const resolveVisitorId = (stored) => {
      if (cachedVisitorId !== null) return cachedVisitorId;
      if (stored !== null && stored.session_id !== "") {
        cachedVisitorId = adapter.get(VISITOR_ID_FALLBACK_KEY) ?? "";
        if (cachedVisitorId !== "") return cachedVisitorId;
      }
      cachedVisitorId = generateId(randomBytes);
      return cachedVisitorId;
    };
    return {
      current() {
        const now = nowMs();
        const stored = readStoredSession(adapter);
        const visitorId = resolveVisitorId(stored);
        if (stored === null || rollSession({ lastEventTs: stored.last_event_ts, now, timeoutMs })) {
          const next = {
            session_id: generateId(randomBytes),
            session_number: (stored?.session_number ?? 0) + 1,
            last_event_ts: now
          };
          persist(adapter, next, visitorId);
          return { visitorId, sessionId: next.session_id, sessionNumber: next.session_number };
        }
        return { visitorId, sessionId: stored.session_id, sessionNumber: stored.session_number };
      },
      touch() {
        const stored = readStoredSession(adapter);
        if (stored === null) return;
        const visitorId = resolveVisitorId(stored);
        persist(adapter, { ...stored, last_event_ts: nowMs() }, visitorId);
      },
      clear() {
        cachedVisitorId = null;
        adapter.delete(SESSION_STATE_KEY);
        adapter.delete(VISITOR_ID_FALLBACK_KEY);
        adapter.delete(SESSION_ID_FALLBACK_KEY);
      }
    };
  }

  // src/browser/payload-store.ts
  var FT_KEYS = touchKeys("ft");
  var LT_KEYS = touchKeys("lt");
  var CANONICAL_PAYLOAD_KEYS = [
    ...Object.values(FT_KEYS),
    ...Object.values(LT_KEYS),
    // Ruling #12: captured click IDs are mirrored into touch fields
    // (ft_<cid>/lt_<cid>) and MUST survive store round-trips + hydration.
    ...CLICK_ID_KEYS.flatMap((cid) => [`ft_${cid}`, `lt_${cid}`]),
    ...CLICK_ID_KEYS,
    ...BROWSER_ID_KEYS,
    "visitor_id",
    "session_id",
    "session_number",
    // D3 selection audit trail
    CLICK_ID_HISTORY_KEY,
    ATTRIBUTION_SELECTED_CLICK_ID_KEY,
    ATTRIBUTION_SELECTED_CLICK_ID_REASON_KEY
  ];
  var CANONICAL_KEY_SET = new Set(CANONICAL_PAYLOAD_KEYS);
  var TOUCH_SUFFIXES = [
    "source",
    "medium",
    "campaign",
    "term",
    "content",
    "utm_id",
    "utm_source_platform",
    "utm_creative_format",
    "utm_marketing_tactic",
    "channel",
    "referrer",
    "landing_page",
    "touch_timestamp"
  ];
  var LEGACY_KEY_ALIASES = Object.freeze(Object.fromEntries(
    TOUCH_SUFFIXES.flatMap((suffix) => [
      // DATA-MODEL.md:123 — legacy `first_*` aliases normalized on read.
      [`first_${suffix}`, `ft_${suffix}`],
      // DATA-MODEL.md:123 — legacy `last_*` aliases normalized on read.
      [`last_${suffix}`, `lt_${suffix}`]
    ])
  ));
  function normalizeLegacyAliases(raw) {
    const out = { ...raw };
    for (const [alias, canonical] of Object.entries(LEGACY_KEY_ALIASES)) {
      const aliasValue = out[alias];
      if (aliasValue === void 0) continue;
      if (out[canonical] === void 0 || out[canonical] === "") {
        out[canonical] = aliasValue;
      }
      delete out[alias];
    }
    return out;
  }
  function filterCanonical(raw) {
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!CANONICAL_KEY_SET.has(key)) continue;
      if (typeof value !== "string") continue;
      out[key] = value;
    }
    return out;
  }
  function loadAttributionPayload(adapter, key = ATTRIBUTION_KEY) {
    const raw = adapter.get(key);
    if (raw === null) return {};
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const record = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v !== "string") continue;
      record[k] = v;
    }
    return filterCanonical(normalizeLegacyAliases(record));
  }
  function saveAttributionPayload(adapter, payload, key = ATTRIBUTION_KEY) {
    adapter.set(key, JSON.stringify(filterCanonical(payload)));
  }

  // src/browser/form-injection.ts
  function defaultFormDocument() {
    const doc = globalThis.document;
    if (!doc) return null;
    return {
      // Real DOM elements carry the full form/input surface; the structural
      // lookup types only guarantee attribute access.
      querySelectorAll: (selector) => Array.from(doc.querySelectorAll(selector)),
      createElement: (tagName) => doc.createElement(tagName),
      body: doc.body
    };
  }
  function defaultObserverFactory() {
    const ctor = globalThis.MutationObserver;
    if (!ctor) return null;
    return (callback) => new ctor(callback);
  }
  var FORM_SELECTOR = "form";
  var HIDDEN_INPUT_SELECTOR = 'input[type="hidden"]';
  var FORM_FIELD_PREFIX = "ct_";
  var DEFAULT_FORM_FIELDS = [
    "ft_source",
    "ft_medium",
    "ft_campaign",
    "ft_term",
    "ft_content",
    "ft_channel",
    "ft_referrer",
    "ft_landing_page",
    "ft_touch_timestamp",
    "lt_source",
    "lt_medium",
    "lt_campaign",
    "lt_term",
    "lt_content",
    "lt_channel",
    "lt_referrer",
    "lt_landing_page",
    "lt_touch_timestamp",
    "gclid",
    "wbraid",
    "gbraid",
    "fbclid",
    "ttclid",
    "msclkid",
    "twclid",
    "li_fat_id",
    "sccid",
    "epik",
    "trail_id",
    "visitor_id",
    "session_id",
    "session_number"
  ];
  function resolveInjectionEntries(input) {
    const out = [];
    for (const key of input.fields) {
      let value = input.payload[key] ?? "";
      if (!value) {
        if (key === "visitor_id") value = input.identity.visitorId ?? "";
        else if (key === "trail_id") value = input.identity.trailId ?? (input.identity.visitorId ? `trl_${input.identity.visitorId}` : "");
        else if (key === "session_id") value = input.identity.sessionId ?? "";
        else if (key === "session_number") value = input.identity.sessionNumber ?? "";
      }
      if (value) out.push([FORM_FIELD_PREFIX + key, value]);
    }
    return out;
  }
  function applyEntryToForm(form, doc, name, value, overwrite) {
    const existing = form.querySelectorAll(HIDDEN_INPUT_SELECTOR);
    for (const node of existing) {
      if (node.getAttribute("name") !== name) continue;
      const current = node.getAttribute("value");
      if (current) {
        if (!overwrite || current === value) return false;
        node.setAttribute("value", value);
        return true;
      }
      node.setAttribute("value", value);
      return true;
    }
    const input = doc.createElement("input");
    input.setAttribute("type", "hidden");
    input.setAttribute("name", name);
    input.setAttribute("value", value);
    form.appendChild(input);
    return true;
  }
  function createFormInjector(config) {
    const fields = config.fields ?? DEFAULT_FORM_FIELDS;
    const overwrite = config.overwrite ?? false;
    const injectOnce = () => {
      if (!config.consentAllowed()) return;
      const doc = config.doc;
      if (!doc) return;
      const entries = resolveInjectionEntries({
        payload: config.getPayload(),
        identity: config.getIdentity(),
        fields
      });
      const forms = doc.querySelectorAll(FORM_SELECTOR);
      for (const form of forms) {
        for (const [name, value] of entries) {
          applyEntryToForm(form, doc, name, value, overwrite);
        }
      }
    };
    let observer = null;
    return {
      start() {
        injectOnce();
        if (observer !== null) return;
        const factory = config.observer !== void 0 ? config.observer : defaultObserverFactory();
        if (!factory) return;
        observer = factory(injectOnce);
        observer.observe(config.doc?.body ?? {}, { childList: true, subtree: true });
      },
      stop() {
        observer?.disconnect();
        observer = null;
      }
    };
  }

  // src/core/parse.ts
  function emptyTouch(now, landingPage = "") {
    return {
      source: "",
      medium: "",
      campaign: "",
      term: "",
      content: "",
      utmId: "",
      utmSourcePlatform: "",
      utmCreativeFormat: "",
      utmMarketingTactic: "",
      referrer: "",
      landingPage,
      touchTimestamp: now ?? "",
      clickIds: {}
    };
  }
  function matchesRule(referrerHost, rule) {
    return rule.domains.some((domain) => hostMatches(referrerHost, domain));
  }
  function classifyReferrerHost(referrerHost) {
    for (const rule of SEARCH_REFERRER_RULES) {
      if (matchesRule(referrerHost, rule)) return { source: rule.source, channel: "organic_search" };
    }
    for (const rule of SOCIAL_REFERRER_RULES) {
      if (matchesRule(referrerHost, rule)) return { source: rule.source, channel: "organic_social" };
    }
    return { source: referrerHost, channel: "referral" };
  }
  function referrerHostOf(referrer) {
    try {
      const u = new URL(referrer);
      if (u.protocol !== "http:" && u.protocol !== "https:") return "";
      return normalizeHost(u.host);
    } catch {
      return "";
    }
  }
  function readQuery(url) {
    try {
      const flat = /* @__PURE__ */ new Map();
      for (const [rawKey, rawValue] of new URL(url).searchParams.entries()) {
        flat.set(rawKey.toLowerCase(), rawValue);
      }
      const sortedKeys = Array.from(flat.keys()).sort();
      return {
        get: (k) => flat.get(k.toLowerCase()),
        keys: () => sortedKeys
      };
    } catch {
      return null;
    }
  }
  function parseAttributionUrl(input) {
    const now = input.now ? input.now : "";
    const query = readQuery(input.url);
    const landingPage = landingPageOf(input.url);
    let hasUtm = false;
    const touch = emptyTouch(now, landingPage);
    if (query) {
      for (const [param, field] of Object.entries(UTM_PARAM_TO_FIELD)) {
        const raw = query.get(param);
        if (raw != null && raw !== "") {
          touch[field] = sanitizeField(raw);
          hasUtm = true;
        }
      }
    }
    const clickIds = {};
    if (query) {
      for (const key of query.keys()) {
        const canonical = PARAM_ALIASES[key] ?? key;
        if (CLICK_ID_KEYS.includes(canonical)) {
          const value = query.get(key);
          if (value) clickIds[canonical] = sanitizeField(value);
        }
      }
    }
    const hasClickId = Object.keys(clickIds).length > 0;
    const browserIds = {};
    for (const [param, canonical] of Object.entries(BROWSER_ID_PARAMS)) {
      if (browserIds[canonical]) continue;
      const raw = query ? query.get(param) : void 0;
      if (!raw) continue;
      if (canonical === "ga_client_id") {
        const parsed = parseGaClientIdValue(sanitizeField(raw));
        if (parsed) browserIds[canonical] = parsed;
      } else {
        browserIds[canonical] = sanitizeField(raw);
      }
    }
    if (!browserIds.fbc && clickIds.fbclid) {
      const nowMs = now ? Date.parse(now) : NaN;
      if (!Number.isNaN(nowMs)) {
        browserIds.fbc = sanitizeField(`fb.1.${nowMs}.${clickIds.fbclid}`);
      }
    }
    if (!hasUtm && !hasClickId) {
      const rHost = input.referrer ? referrerHostOf(input.referrer) : "";
      if (!rHost) {
        return { kind: "none", reason: "no_signal" };
      }
      const pageHost = input.currentHost ? normalizeHost(input.currentHost) : "";
      if (pageHost && areRelatedHosts(rHost, pageHost)) {
        return { kind: "none", reason: "internal_referrer" };
      }
      const inferred = classifyReferrerHost(rHost);
      touch.source = sanitizeField(inferred.source);
      touch.medium = inferred.channel === "organic_search" ? "organic" : inferred.channel === "organic_social" ? "social" : "referral";
      touch.referrer = sanitizeField(input.referrer ?? "");
      const channelLabel2 = resolveChannelLabel({
        source: touch.source,
        medium: touch.medium,
        clickIds: {},
        referrer: input.referrer ?? ""
      });
      return {
        kind: "touch",
        touch: { ...touch, clickIds: {}, browserIds, channel: inferred.channel, channelLabel: channelLabel2 }
      };
    }
    let channel;
    if (hasClickId) {
      const matched = CLICK_ID_KEYS.find((key) => Boolean(clickIds[key]));
      if (matched) {
        const plat = CLICK_ID_PLATFORMS[matched];
        if (!touch.source) touch.source = plat.source;
        if (plat.certainty === "certain") {
          channel = plat.paidChannel ?? "unknown";
          if (!touch.medium) touch.medium = "cpc";
        } else {
          channel = PAID_MEDIUMS.includes(touch.medium.toLowerCase()) && plat.paidChannel ? plat.paidChannel : classifyUtmChannel(touch.medium);
        }
      } else {
        channel = "unknown";
      }
    } else {
      channel = classifyUtmChannel(touch.medium);
    }
    touch.referrer = sanitizeField(input.referrer ?? "");
    const channelLabel = resolveChannelLabel({
      source: touch.source,
      medium: touch.medium,
      clickIds,
      referrer: input.referrer ?? ""
    });
    const withClickIds = { ...touch, clickIds, browserIds, channel, channelLabel };
    return { kind: "touch", touch: withClickIds };
  }
  function classifyUtmChannel(medium) {
    const m = medium.toLowerCase();
    if (m.includes("cpc") || m.includes("ppc") || m.includes("paid")) return "paid_other";
    if (m === "email" || m.includes("newsletter")) return "email";
    if (m === "affiliate") return "affiliate";
    if (m === "referral") return "referral";
    if (m === "organic") return "organic_search";
    if (m === "social" || m.includes("social")) return "organic_social";
    return "unknown";
  }
  function landingPageOf(url) {
    try {
      return sanitizeField(new URL(url).href);
    } catch {
      return "";
    }
  }

  // src/browser/link-decoration.ts
  var TOKEN_TTL_MS = 30 * DAY_MS;
  var MAX_TOKEN_LENGTH = 2048;
  var DEFAULT_TOKEN_PARAM = "ct_token";
  var CONTINUATION_FIELDS = [
    "lt_source",
    "lt_medium",
    "lt_campaign",
    "lt_term",
    "lt_content",
    "lt_channel",
    "lt_referrer",
    "lt_landing_page",
    "lt_touch_timestamp",
    ...CLICK_ID_KEYS
  ];
  function isApprovedHost(host, domains) {
    const h = normalizeHostForMatch(host);
    if (!h) return false;
    return domains.some((d) => {
      const base = normalizeHostForMatch(d);
      return base !== "" && (h === base || h.endsWith(`.${base}`));
    });
  }
  function normalizeHostForMatch(host) {
    const stripped = host.trim().toLowerCase().replace(/:\d+$/, "");
    if (stripped.includes("/") || stripped.includes("@")) return "";
    return stripped;
  }
  function asciiJson(value) {
    return JSON.stringify(value).replace(
      /[^\u0020-\u007E]/g,
      (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`
    );
  }
  var B64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  function bytesToBase64Url(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const b0 = bytes[i];
      const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      out += B64URL_ALPHABET[b0 >> 2];
      out += B64URL_ALPHABET[(b0 & 3) << 4 | b1 >> 4];
      if (i + 1 < bytes.length) out += B64URL_ALPHABET[(b1 & 15) << 2 | b2 >> 6];
      if (i + 2 < bytes.length) out += B64URL_ALPHABET[b2 & 63];
    }
    return out;
  }
  var B64URL_LOOKUP = Object.freeze(
    Object.fromEntries(B64URL_ALPHABET.split("").map((c, i) => [c, i]))
  );
  function base64UrlToBytes(s) {
    if (s.length === 0) return new Uint8Array(0);
    const out = [];
    let buffer = 0;
    let bits = 0;
    for (const ch of s) {
      const v = B64URL_LOOKUP[ch];
      if (v === void 0) return null;
      buffer = buffer << 6 | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out.push(buffer >> bits & 255);
      }
    }
    return new Uint8Array(out);
  }
  async function encodeContinuationToken(input) {
    const payload = {
      visitor_id: input.visitorId,
      session_id: input.sessionId,
      attribution: input.attribution,
      exp: input.nowMs + (input.ttlMs ?? TOKEN_TTL_MS)
    };
    const body = bytesToBase64Url(new TextEncoder().encode(asciiJson(payload)));
    const signature = await input.sign(body);
    const token = `${body}.${signature}`;
    if (token.length > MAX_TOKEN_LENGTH) {
      throw new Error(
        `clicktrail: continuation token exceeds MAX_TOKEN_LENGTH (${token.length} > ${MAX_TOKEN_LENGTH}).`
      );
    }
    return token;
  }
  async function decodeContinuationToken(token, verify, nowMs) {
    const dot = token.indexOf(".");
    if (dot <= 0 || dot === token.length - 1) return { kind: "invalid", reason: "malformed" };
    const body = token.slice(0, dot);
    const signature = token.slice(dot + 1);
    const decoded = base64UrlToBytes(body);
    if (decoded === null) return { kind: "invalid", reason: "malformed" };
    let json;
    try {
      json = new TextDecoder("utf-8").decode(decoded);
    } catch {
      return { kind: "invalid", reason: "malformed" };
    }
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { kind: "invalid", reason: "malformed" };
    }
    const checked = validateContinuationShape(parsed);
    if (checked === null) return { kind: "invalid", reason: "malformed" };
    const ok = await verify(body, signature);
    if (!ok) return { kind: "invalid", reason: "bad_signature" };
    if (nowMs >= checked.exp) return { kind: "invalid", reason: "expired" };
    return { kind: "valid", payload: checked };
  }
  function validateContinuationShape(value) {
    if (typeof value !== "object" || value === null) return null;
    const rec = value;
    const { visitor_id: vid, session_id: sid, attribution, exp } = rec;
    if (typeof vid !== "string" || typeof sid !== "string") return null;
    if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
    if (typeof attribution !== "object" || attribution === null) return null;
    const attrs = {};
    for (const [k, v] of Object.entries(attribution)) {
      if (typeof v !== "string") return null;
      attrs[k] = v;
    }
    return { visitor_id: vid, session_id: sid, attribution: attrs, exp };
  }
  function urlHasStrongerSignal(url) {
    const query = readQuery(url);
    if (!query) return false;
    for (const key of query.keys()) {
      const k = key.toLowerCase();
      if (k.startsWith("utm_")) return true;
      const canonical = k === "sc_click_id" ? "sccid" : k;
      if (CLICK_ID_KEYS.includes(canonical)) return true;
    }
    return false;
  }
  function buildReferralTouch(input) {
    const a = input.payload.attribution;
    const source = a["lt_source"] ?? "";
    const touch = {
      source,
      medium: "referral",
      campaign: a["lt_campaign"] ?? "",
      term: a["lt_term"] ?? "",
      content: a["lt_content"] ?? "",
      utmId: "",
      utmSourcePlatform: "",
      utmCreativeFormat: "",
      utmMarketingTactic: "",
      referrer: a["lt_landing_page"] ?? "",
      landingPage: input.landingUrl,
      touchTimestamp: input.nowIso,
      clickIds: Object.fromEntries(
        CLICK_ID_KEYS.filter((k) => a[k]).map((k) => [k, a[k]])
      ),
      channel: CHANNEL_VALUE_REFERRAL
    };
    return {
      ...touch,
      channelLabel: resolveChannelLabel({
        source: touch.source,
        medium: touch.medium,
        clickIds: {},
        referrer: ""
      })
    };
  }
  function defaultLocationSeam() {
    const loc = globalThis.location;
    const hist = globalThis.history;
    if (!loc || !hist) return null;
    return {
      href: () => loc.href,
      replaceState: (url) => hist.replaceState(null, "", url)
    };
  }
  async function consumeLandingToken(input) {
    const original = input.seam.href();
    let parsed;
    try {
      parsed = new URL(original);
    } catch {
      return "no_token";
    }
    const rawValues = parsed.searchParams.getAll(input.tokenParam);
    if (rawValues.length === 0) return "no_token";
    const raw = rawValues[0];
    parsed.searchParams.delete(input.tokenParam);
    const strippedHref = parsed.toString();
    try {
      input.seam.replaceState(strippedHref);
    } catch {
    }
    if (!input.consentAllowed()) return "consent_denied";
    const result = await decodeContinuationToken(raw, input.verify, input.nowMs());
    if (result.kind === "invalid") {
      return `invalid_${result.reason}`;
    }
    if (urlHasStrongerSignal(strippedHref)) return "skipped_stronger_signal";
    input.mergeTouch(
      buildReferralTouch({
        payload: result.payload,
        landingUrl: strippedHref,
        nowIso: input.nowIso()
      })
    );
    return "merged";
  }
  function decorateUrl(input) {
    let parsed;
    try {
      parsed = new URL(input.url, input.baseUrl);
    } catch {
      return null;
    }
    if (parsed.searchParams.has(input.tokenParam)) {
      if (input.skipSignedUrls) return null;
    }
    parsed.searchParams.set(input.tokenParam, input.token);
    return parsed.toString();
  }
  var ANCHOR_SELECTOR = "a[href]";
  function defaultLinkDocument() {
    const doc = globalThis.document;
    if (!doc) return null;
    return { querySelectorAll: (s) => Array.from(doc.querySelectorAll(s)), body: doc.body };
  }
  function defaultLinkObserver() {
    const ctor = globalThis.MutationObserver;
    if (!ctor) return null;
    return (cb) => new ctor(cb);
  }
  function createLinkDecorator(config) {
    const tokenParam = config.tokenParam ?? DEFAULT_TOKEN_PARAM;
    const skipSignedUrls = config.skipSignedUrls ?? true;
    let token = "";
    const decorateOnce = () => {
      if (!token || !config.consentAllowed()) return;
      const doc = config.doc;
      if (!doc) return;
      const base = config.getBaseUrl();
      for (const anchor of doc.querySelectorAll(ANCHOR_SELECTOR)) {
        const href = anchor.getAttribute("href");
        if (!href) continue;
        try {
          const resolved = new URL(href, base || void 0);
          if (!isApprovedHost(resolved.host, config.domains)) continue;
        } catch {
          continue;
        }
        const next = decorateUrl({
          url: href,
          baseUrl: base || void 0,
          token,
          tokenParam,
          skipSignedUrls
        });
        if (next !== null && next !== href) anchor.setAttribute("href", next);
      }
    };
    let observer = null;
    return {
      start() {
        if (config.observer !== void 0 && config.observer === null) {
        } else if (observer === null) {
          const factory = config.observer ?? defaultLinkObserver();
          if (factory) {
            observer = factory(decorateOnce);
            observer.observe(config.doc?.body ?? {}, { childList: true, subtree: true });
          }
        }
        void config.getToken().then((t) => {
          token = t;
          decorateOnce();
        }).catch(() => {
          token = "";
        });
      },
      stop() {
        observer?.disconnect();
        observer = null;
      }
    };
  }
  function subtleOrThrow() {
    const crypto = globalThis.crypto;
    if (!crypto?.subtle) {
      throw new Error(
        "clicktrail: no WebCrypto available; inject crossDomain.sign / crossDomain.verify."
      );
    }
    return crypto.subtle;
  }
  async function loadOrCreateKeyBytes(adapters, randomBytes) {
    for (const adapter of adapters) {
      const raw = adapter.get(SIGNING_KEY_KEY);
      if (raw !== null) {
        const bytes = base64UrlToBytes(raw);
        if (bytes !== null && bytes.length > 0) return bytes;
      }
    }
    const fresh = randomBytes(32);
    const encoded = bytesToBase64Url(fresh);
    for (const adapter of adapters) adapter.set(SIGNING_KEY_KEY, encoded);
    return fresh;
  }
  function defaultHmacSign(adapters, randomBytes) {
    return async (data) => {
      const subtle = subtleOrThrow();
      const keyBytes = await loadOrCreateKeyBytes(adapters, randomBytes);
      const key = await subtle.importKey(
        "raw",
        keyBytes,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const mac = await subtle.sign({ name: "HMAC" }, key, new TextEncoder().encode(data));
      return bytesToBase64Url(new Uint8Array(mac));
    };
  }
  function defaultHmacVerify(adapters) {
    return async (data, signatureB64Url) => {
      const raw = adapters.map((a) => a.get(SIGNING_KEY_KEY)).find((v) => v !== null);
      if (raw === void 0 || raw === null) return false;
      const keyBytes = base64UrlToBytes(raw);
      const sigBytes = base64UrlToBytes(signatureB64Url);
      if (keyBytes === null || sigBytes === null || keyBytes.length === 0) return false;
      const subtle = subtleOrThrow();
      try {
        const key = await subtle.importKey(
          "raw",
          keyBytes,
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["verify"]
        );
        return await subtle.verify(
          { name: "HMAC" },
          key,
          sigBytes,
          new TextEncoder().encode(data)
        );
      } catch {
        return false;
      }
    };
  }

  // src/browser/create-clicktrail.ts
  var warnConsoleSink = {
    report: (d) => console.warn(`[clicktrail:${d.code}] ${d.message}`)
  };
  function resolveSink(config) {
    if (config.diagnosticSink) return config.diagnosticSink;
    if ((config.diagnosticsLevel ?? "silent") === "warn") return warnConsoleSink;
    return nullDiagnosticSink;
  }
  var defaultRandomBytes = (byteLength) => {
    const crypto = globalThis.crypto;
    if (!crypto?.getRandomValues) {
      throw new Error(
        "clicktrail: no crypto.getRandomValues available; inject config.storage.randomBytes."
      );
    }
    return crypto.getRandomValues(new Uint8Array(byteLength));
  };
  function createClickTrail(config) {
    const destinations = [...config.destinations];
    const now = config.now;
    const consentGate = config.consentGate;
    const sink = resolveSink(config);
    let eventSequence = 0;
    let started = false;
    let payload = emptyAttribution();
    let consentDeniedReported = false;
    const storageCfg = config.storage;
    let adapters = null;
    let identity = null;
    let formInjector = null;
    let linkDecorator = null;
    const initStorage = () => {
      if (!storageCfg || adapters !== null) return;
      const nowMs = storageCfg.nowMs ?? (() => Date.now());
      const primary = storageCfg.primaryAdapter ?? cookieStorage(
        storageCfg.cookieAttrs !== void 0 ? { attrs: storageCfg.cookieAttrs } : {}
      );
      const mirror = storageCfg.mirrorAdapter ?? mirrorStorage({
        ...storageCfg.retentionDays !== void 0 ? { retentionDays: storageCfg.retentionDays } : {},
        nowMs
      });
      adapters = { primary, mirror };
      identity = createIdentityStore({
        adapter: mirror,
        randomBytes: storageCfg.randomBytes ?? defaultRandomBytes,
        nowMs
      });
    };
    const persistPayload = () => {
      if (!adapters) return;
      saveAttributionPayload(adapters.primary, payload);
      saveAttributionPayload(adapters.mirror, payload);
    };
    const mergeCookieBrowserIds = () => {
      if (consentGate && !consentGate()) return;
      let ids;
      try {
        const jar = storageCfg?.browserIdCookieJar ?? defaultCookieJar();
        ids = collectBrowserIdsFromCookies(parseCookieMap(jar.read()));
      } catch {
        return;
      }
      const merged = applyBrowserIdentifiers(payload, ids);
      if (merged !== payload) {
        payload = merged;
        if (started && adapters) persistPayload();
      }
    };
    const snapshotFromIdentity = (snap) => ({
      visitorId: snap.visitorId,
      sessionId: snap.sessionId,
      sessionNumber: String(snap.sessionNumber)
    });
    const consentAllows = () => {
      if (!consentGate || consentGate()) {
        consentDeniedReported = false;
        return true;
      }
      if (!consentDeniedReported) {
        consentDeniedReported = true;
        sink.report({
          code: DIAGNOSTIC_CODES.CONSENT_DENIED_CAPTURE_ATTEMPTED,
          level: "warn",
          message: "Capture attempted while consent denied; event dropped."
        });
        payload = emptyAttribution();
        if (adapters) {
          clearAttributionStorage(adapters.primary, adapters.mirror);
          identity?.clear();
        }
      }
      return false;
    };
    const generateEventId = () => {
      const crypto = globalThis.crypto;
      if (crypto?.randomUUID) return `evt_${crypto.randomUUID()}`;
      eventSequence += 1;
      return `evt_${Date.now().toString(36)}_${eventSequence}`;
    };
    const isLeadEvent = (eventName) => ["lead", "lead.submitted", "lead_submitted", "form_submission"].includes(eventName);
    function wireCrossDomain(instance2) {
      const crossCfg = config.crossDomain;
      if (!crossCfg) return;
      if ((!crossCfg.sign || !crossCfg.verify) && !storageCfg) {
        throw new Error(
          "clicktrail: crossDomain default sign/verify requires config.storage; inject both sign and verify for externally provisioned keys."
        );
      }
      const nowMs = storageCfg?.nowMs ?? (() => Date.now());
      const randomBytes = storageCfg?.randomBytes ?? defaultRandomBytes;
      const adapterList = adapters !== null ? [adapters.primary, adapters.mirror] : [];
      const sign = crossCfg.sign ?? defaultHmacSign(adapterList, randomBytes);
      const verify = crossCfg.verify ?? defaultHmacVerify(adapterList);
      const seam = crossCfg.location ?? defaultLocationSeam();
      const nowIso = () => config.now ? config.now() : new Date(nowMs()).toISOString();
      if (seam) {
        void consumeLandingToken({
          seam,
          tokenParam: crossCfg.tokenParam ?? DEFAULT_TOKEN_PARAM,
          verify,
          nowMs,
          nowIso,
          consentAllowed: () => !consentGate || consentGate(),
          mergeTouch: (touch) => instance2.mergeParsedTouch(touch)
        }).catch(() => {
        });
      }
      const doc = crossCfg.doc ?? defaultLinkDocument() ?? void 0;
      linkDecorator = createLinkDecorator({
        domains: crossCfg.domains,
        tokenParam: crossCfg.tokenParam,
        skipSignedUrls: crossCfg.skipSignedUrls,
        doc,
        observer: crossCfg.observer,
        consentAllowed: () => !consentGate || consentGate(),
        getBaseUrl: () => seam?.href() ?? "",
        getToken: async () => {
          const snap = instance2.getSession();
          if (!snap.visitorId && !snap.sessionId) return "";
          const attribution = {};
          for (const key of CONTINUATION_FIELDS) {
            const value = payload[key];
            if (value) attribution[key] = value;
          }
          try {
            return await encodeContinuationToken({
              visitorId: snap.visitorId,
              sessionId: snap.sessionId,
              attribution,
              nowMs: nowMs(),
              sign
            });
          } catch {
            return "";
          }
        }
      });
      linkDecorator.start();
    }
    const instance = {
      start() {
        if (started) return;
        started = true;
        for (const dest of destinations) dest.start?.();
        if (storageCfg) {
          initStorage();
          const stored = loadAttributionPayload(adapters.primary);
          payload = Object.keys(stored).length > 0 ? { ...emptyAttribution(), ...stored } : { ...emptyAttribution(), ...loadAttributionPayload(adapters.mirror) };
          persistPayload();
        }
        mergeCookieBrowserIds();
        if (config.forms) {
          const { fields, overwrite, observer } = config.forms;
          formInjector = createFormInjector({
            fields,
            overwrite,
            observer,
            consentAllowed: () => !consentGate || consentGate(),
            getPayload: () => payload,
            getIdentity: () => instance.getSession(),
            doc: config.forms.doc ?? defaultFormDocument() ?? void 0
          });
          formInjector.start();
        }
        if (config.crossDomain) {
          wireCrossDomain(instance);
        }
      },
      stop() {
        if (!started) return;
        for (const dest of destinations) void Promise.resolve(dest.flush?.());
        formInjector?.stop();
        formInjector = null;
        linkDecorator?.stop();
        linkDecorator = null;
        started = false;
      },
      isStarted: () => started,
      track(eventName, data) {
        if (!started) {
          sink.report({
            code: "track_before_start",
            level: "warn",
            message: `track('${eventName}') ignored: SDK not started.`
          });
          return;
        }
        if (!consentAllows()) return;
        const eventData = {};
        if (now && data?.["event_time"] === void 0) eventData.event_time = now();
        Object.assign(eventData, data);
        eventData.event_id = eventData.event_id || generateEventId();
        if (isLeadEvent(eventName) && !eventData.lead_id) {
          eventData.lead_id = `lead_${String(eventData.event_id).replace(/^evt_/, "")}`;
        }
        const envelopeContext = { identity: instance.getSession() };
        if (config.workspaceId !== void 0) envelopeContext.workspaceId = config.workspaceId;
        if (config.siteId !== void 0) envelopeContext.siteId = config.siteId;
        const consentState = config.consentState?.();
        if (consentState !== void 0) envelopeContext.consent = consentState;
        const event = buildEventPayload(payload, eventName, eventData, envelopeContext);
        for (const dest of destinations) dest.deliver(event);
      },
      mergeParsedTouch(touch) {
        mergeCookieBrowserIds();
        payload = mergeAttributionTouch(payload, touch);
        if (started && adapters) persistPayload();
      },
      hydrateStoredPayload(incoming) {
        for (const key of Object.keys(incoming)) {
          const value = incoming[key];
          if (CANONICAL_KEY_SET.has(key) && typeof value === "string" && value !== "") {
            payload[key] = value;
          }
        }
        if (started && adapters) persistPayload();
      },
      getData: () => ({ ...payload }),
      getField(key) {
        return payload[key] ?? "";
      },
      clearData() {
        payload = emptyAttribution();
        if (started && adapters) {
          clearAttributionStorage(adapters.primary, adapters.mirror);
          identity?.clear();
        }
      },
      getSession() {
        if (started && identity && (!consentGate || consentGate())) {
          return snapshotFromIdentity(identity.current());
        }
        return {
          visitorId: payload["visitor_id"] ?? "",
          sessionId: payload["session_id"] ?? "",
          sessionNumber: payload["session_number"] ?? ""
        };
      }
    };
    return instance;
  }

  // src/global-entry.ts
  var globals = globalThis;
  globals["ClickTrail"] = { ...browser_exports, parseAttributionUrl };
})();
