# SignalDesk Alpha 1

Focused X.com research with saved searches, post-search AI review, and precise control over supported X API filters.

## Download

Choose one installer:

- **Windows:** `SignalDesk-Setup-Windows-x64.exe`
- **macOS:** `SignalDesk-macOS-universal.dmg`
- **Linux:** `SignalDesk-Linux-amd64.deb`

Open the file and install SignalDesk like any other desktop application. Every installer includes its required local backend and runtime.

## Alpha 1 highlights

### Complete application icon set

SignalDesk now packages the same violet signal-bars icon at every required Linux desktop size, in the macOS application bundle, and in the Windows executable and installer.

### Anthropic provider naming

The AI provider is now labeled **Anthropic** throughout SignalDesk. Anthropic model IDs remain unchanged so API requests continue to use the provider's official identifiers.


### Original and AI tabs

AI review happens only after X returns results. Original posts remain untouched while every AI review or conversational follow-up opens a separate, closable tab. Each view supports the same local sort controls; **Ctrl+Z** or **Cmd+Z** restores the most recently closed AI tab with its conversation and draft.

### OpenAI and Anthropic

Choose OpenAI or Anthropic, enter the provider API key, and select a current model. OpenAI defaults to GPT-5.6 Sol; Anthropic defaults to Fable 5.

### Persistent saved searches

Saved searches are encrypted in SignalDesk's local application-data folder. They survive field resets, application updates, and reinstalls that preserve local app data.

### Clear fields

The top-bar **Clear fields** button restores the search form to its defaults without deleting credentials or saved searches.

### Visible local storage

The Credentials window shows the exact local application-data folder and can open it directly.

## Privacy

SignalDesk has no analytics, advertising, telemetry, crash reporting, hosted account, or SignalDesk-operated data collection endpoint.

- Search queries go directly to X.
- Optional AI review data goes only to the selected provider when requested.
- Credentials and saved searches remain encrypted on the local computer.
- Automatic updater files are kept in a separate machine-readable repository so this release page contains only the three installers above.
