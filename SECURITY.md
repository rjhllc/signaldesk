# SignalDesk Security

## Reporting a vulnerability

Do not include API keys, bearer tokens, saved credential records, confidential searches, private results, or unredacted request data in an issue, discussion, screenshot, or email.

Report a suspected SignalDesk vulnerability through GitHub's private vulnerability reporting form:

<https://github.com/rjhllc/signaldesk/security/advisories/new>

Include only the minimum information required to reproduce the problem. Redact credentials, personal information, customer information, searches, posts, local paths, and device identifiers.

## Supported version

The production application at [app.signaldesk.run](https://app.signaldesk.run) is the supported version. A push to `main` deploys one immutable application revision after the contract suite passes. Browser responses are not cached, so a new visit or refresh loads the active revision.

## Scope

Reports are especially useful for:

- Browser credential-vault disclosure or deletion failures
- Same-origin enforcement bypasses
- Relay credential leakage, persistence, or cross-user exposure
- Unauthorized provider destinations or server-side request forgery
- Relay rate-limit bypasses
- Exposure of repository or deployment files through the Worker asset binding
- Content Security Policy bypasses and stored or reflected script injection
- Deployment integrity and Cloudflare Worker configuration
- Prompt-injection handling in optional AI review

Questions about X, OpenAI, or Anthropic's own platforms should be reported directly to that provider.

## Security boundary

The encrypted IndexedDB vault protects data at rest in the browser profile. It does not protect an unlocked, compromised browser or device. Browser scripts running under `app.signaldesk.run` can ask Web Crypto to decrypt vault records even though the AES-GCM key is non-extractable.

Provider credentials are decrypted only for a requested provider call, then sent over HTTPS to the SignalDesk relay. The relay can access those values while processing the request; it does not persist them. See [PRIVACY.md](PRIVACY.md) for the complete data flow and infrastructure limitations.
