# SignalDesk Privacy

**Last updated: August 28, 2026**

SignalDesk is a hosted web application. RJH LLC does not operate a SignalDesk account system, analytics service, advertising service, or crash-reporting service.

## Data saved in the browser

SignalDesk stores the following data under the `app.signaldesk.run` browser origin:

- The X API Bearer Token and optional LLM API key, encrypted with AES-GCM.
- The selected LLM provider and model, inside the same encrypted credential record.
- Saved search definitions, including queries, filters, toggles, sort order, and optional AI instruction, in a separate encrypted record.
- Advanced-filter layout preferences in ordinary local storage. These preferences contain section order and open/closed state, not credentials.

Web Crypto creates a non-extractable encryption key and IndexedDB stores it separately from the encrypted records. The vault normally persists between visits in the same browser profile. SignalDesk does not sync or recover it.

Search results and AI result tabs are held in browser memory. CSV files are created in the browser only when the user explicitly exports them.

Selecting **Forget this browser** clears the encrypted vault and layout preferences. Clearing browser site data has the same effect. Private-browsing storage may be deleted automatically when the private session ends.

## Data processed by the SignalDesk relay

X does not accept the browser preflight required for an authenticated search. SignalDesk therefore uses one same-origin HTTPS relay at `app.signaldesk.run` for X and the supported AI providers.

When the user runs an X search, the browser decrypts and sends these values to the relay:

- The user's X Bearer Token.
- The search query, selected filters, requested time range, result limit, retrieval order, and sort choice.

The relay forwards the request to X, processes the returned public posts and author metadata, and returns the report to that browser.

When the user explicitly requests AI review, the browser sends these values to the relay:

- The configured AI provider key, provider name, and model ID.
- The original search-result posts and relevant public author metadata.
- The original search topic and cumulative review-instruction conversation.

The relay forwards that request to the selected AI provider and returns the validated result.

The SignalDesk application has no credential, query, result, or conversation database. It holds request data in process memory only for the request and does not intentionally write request bodies or authorization headers to logs. Provider credentials are supplied per request and are not configured on the server. For abuse control, the relay keeps per-IP request timestamps in a sliding one-minute window in volatile memory; stale entries are discarded as traffic continues, and the state is never persisted.

Hosting and network providers necessarily process connection metadata such as IP address, timestamps, TLS traffic, and request size. Infrastructure administrators can technically access data while it is being processed. Browser-local encryption does not make in-transit data opaque to the relay.

## Data sent to third parties

### X

X receives the Bearer Token, generated X query, requested fields, time bounds, result limits, sort order supported by X, and normal network metadata. X's terms, privacy policy, access tiers, and billing apply.

### OpenAI or Anthropic

The selected provider receives its API key, model ID, posts being reviewed, relevant public author metadata, the search topic, the cumulative review conversation, and normal network metadata. AI review is optional and occurs only after the user requests it.

SignalDesk never sends the X Bearer Token to an AI provider or an AI provider key to X.

### Application hosting and deployment

Cloudflare serves both `signaldesk.run` and `app.signaldesk.run`, executes the same-origin relay, and receives normal request and infrastructure metadata. GitHub Actions deploys repository revisions to production; deployment jobs do not receive browser credentials, searches, or results.

## Data RJH LLC receives

RJH LLC does not receive application data through an account, analytics, advertising, telemetry, or support pipeline. RJH LLC operates the relay infrastructure and therefore may have operational access to request data in transit and basic infrastructure metadata, even though the application does not persist that data.

If a user voluntarily sends a support email, issue report, or diagnostic file, RJH LLC receives only the information that user chooses to provide through that separate channel.

## Security properties and limits

- API routes require a same-origin browser request and do not enable cross-origin access.
- Provider base URLs are fixed server-side to X, OpenAI, and Anthropic.
- The application Worker exposes only the `public` asset directory; repository source and deployment files are not web-accessible.
- Responses use a restrictive Content Security Policy, no-referrer policy, same-origin resource policy, and other browser hardening headers.
- The application loads no third-party scripts.
- Cloudflare terminates HTTPS and executes the relay in its Workers runtime.
- Preview requests are limited per client network, and provider requests are limited per supplied credential, within each Cloudflare location.
- User credentials are never configured as Worker secrets or included in repository revisions and deployment jobs.

The browser vault protects credentials at rest from casual inspection of browser files. It cannot protect credentials when the browser profile is unlocked and compromised by a malicious extension, device malware, developer-tools access, or a future same-origin script vulnerability.

## Third-party terms

Use of X, OpenAI, and Anthropic remains subject to each provider's terms, privacy policy, billing, and API restrictions. SignalDesk is not affiliated with those providers.

Privacy questions may be sent to [support@signaldesk.run](mailto:support@signaldesk.run). Report security vulnerabilities through GitHub's private vulnerability reporting form. Do not include credentials, saved searches, confidential results, or unredacted request data in email or a public issue.
