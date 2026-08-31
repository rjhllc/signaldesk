# Changelog

All notable changes to SignalDesk are documented here.

## Unreleased — 2026-08-31

### Changed

- Made SignalDesk web-app-only and removed download-oriented messaging from the marketing site.
- Replaced the previous time ranges with 15 minutes, 1 hour, 4 hours, 12 hours, and 1 day.
- Set 1 hour as the default time range.
- Updated the application and X API documentation for the new recent-search windows.
- Simplified the marketing message to “filter the slop” with a direct description of clarified and curated X searches and filters.
- Replaced the liquid-glass, desaturated hero overlay and static dot grid with a clean full-color hero and a viewport-wide magnetic line field for mouse and touch input.
- Centered the hero at every viewport size, locked mobile to a non-scrolling viewport, and restored GitHub navigation with opaque mobile button backgrounds.

### Fixed

- Send an exact `start_time` for every selected search window.
- Enforce the selected boundary after retrieval in both the local server and Cloudflare Worker runtimes, preventing older posts or posts without a valid `created_at` timestamp from appearing in results.

### Removed

- Removed the downloadable `v0.1.0-alpha.1` GitHub release and its tag because SignalDesk is distributed only as a hosted web application.
