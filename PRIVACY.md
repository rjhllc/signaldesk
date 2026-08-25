# SignalDesk Privacy

**Last updated: August 25, 2026**

SignalDesk is a local-first desktop application. RJH LLC does not operate a SignalDesk account system, analytics service, advertising service, crash-reporting service, or data-collection endpoint.

## Data SignalDesk stores locally

SignalDesk stores only the information needed to operate on the current computer:

- X API and optional LLM credentials, encrypted for the current operating-system account by Electron's `safeStorage` API.
- Saved search definitions, including the query, selected filters, toggles, sort order, and optional AI instruction, encrypted in SignalDesk's local application-data folder.
- Application update state and normal installed application files.

The exact folder appears in **Credentials → Local app data** inside the packaged application. Select **Open data folder** to open it directly.

Default locations are:

| Platform | Local data folder |
|---|---|
| Windows | `%APPDATA%\\SignalDesk` |
| macOS | `~/Library/Application Support/SignalDesk` |
| Linux | `$XDG_CONFIG_HOME/SignalDesk`, or `~/.config/SignalDesk` when `XDG_CONFIG_HOME` is unset |


Search results are held in application memory while SignalDesk is running. CSV exports are written only when the user explicitly downloads them.

Uninstalling may preserve the local application-data directory so credentials and saved searches survive an update or reinstall. Users can remove SignalDesk's local application data through their operating system when permanent deletion is required.

## Data sent to third parties

SignalDesk communicates only with services required for features the user invokes:

### X

When the user runs a search, SignalDesk sends the generated query and required request parameters directly to the configured official X API endpoint. X returns posts and public author metadata used to render the report.

### Configured LLM provider

AI review is optional and is available only after an X search returns posts. When the user creates an AI tab or follows up on one, SignalDesk sends the original search-result posts, relevant public author metadata, the original search topic, and the cumulative review-instruction conversation directly to the selected OpenAI or Anthropic endpoint. A follow-up reconsiders those existing posts; it does not run another X search.

SignalDesk never sends the X Bearer Token to an AI provider or an AI provider key to X.

### GitHub Releases

Packaged Windows builds periodically check the public SignalDesk GitHub release feed for software updates. GitHub receives normal network request metadata such as the requesting IP address and user agent. Update requests do not include credentials, saved searches, search queries, or results. SignalDesk asks before downloading an update and before restarting to install it.

## Data RJH LLC receives

RJH LLC does not receive SignalDesk credentials, saved searches, queries, posts, AI instructions, exports, or application usage events through the software. There is no SignalDesk telemetry pipeline.

If a user voluntarily sends a support email, issue report, or diagnostic file, RJH LLC receives only the information that user chooses to provide through that separate channel.

## Network and application security

- The packaged backend listens only on an ephemeral loopback address.
- The desktop renderer uses context isolation, sandboxing, disabled Node.js integration, and a restrictive Content Security Policy.
- External navigation is blocked inside the application and HTTPS links open in the system browser.
- Release packaging rejects credentials, environment files, private keys, and unexpected application files.
- User secrets are never included in Windows installers or release artifacts.

## Third-party terms

Use of X, an LLM provider, and GitHub is subject to those providers' privacy policies and terms. SignalDesk does not control their processing of requests sent directly to them.

## Contact

Privacy and security questions may be submitted through the private SignalDesk source repository or the public release repository's security reporting channel. Do not include API keys, bearer tokens, saved credential files, or confidential search results in a public issue.
