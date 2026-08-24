# Security policy

ClickTrail treats attribution data, consent state, identifiers, and delivery
configuration as security-sensitive.

## Report a vulnerability

Please use a private [GitHub Security Advisory](https://github.com/vizuh/clicktrail-js/security/advisories/new).
Do not disclose an unpatched vulnerability in a public issue.

Include the affected package/version, reproduction steps, impact, and any
safe mitigation. We will acknowledge reports after triage and publish a fix
or mitigation when it is ready.

## Development boundary

- Do not commit credentials, collector secrets, cookies, or real visitor data.
- Proxy configuration must use an explicit HTTPS collector in production.
- Consent-gated integrations must not write identifiers before consent.
- Dependency and GitHub Actions updates are reviewed through Dependabot and CI.
