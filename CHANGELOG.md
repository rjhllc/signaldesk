# Changelog

All notable changes to SignalDesk are documented here.

## 2026-08-31

### Added

- Added a viewport-wide particle conveyor to visualize filtering: a dense field moves into the light wheel and disappears at its edge.
- Added a five-dot curated output stream on the black side of the wheel with a soft 1.8-second glow pulse.

### Changed

- Made SignalDesk web-app-only and removed download-oriented messaging from the marketing site.
- Replaced the previous search windows with 15 minutes, 1 hour, 4 hours, 12 hours, and 1 day; 1 hour is now the default.
- Updated the application and X API documentation for the new recent-search windows.
- Simplified the marketing headline to “filter the slop” and the description to “clarified and curated X searches and filters.”
- Reworked the marketing hero with a full-color light ring, solid black filter interior, restored GitHub navigation, opaque mobile navigation controls, and a fixed non-scrolling mobile viewport.
- Synchronized input and output particles at 10 pixels per second with the same 42% baseline opacity.
- Moved particle rendering to the display’s native refresh rate, allowing 60 FPS on 60 Hz displays and 120 FPS on 120 Hz displays.
- Optimized the conveyor by pre-rendering the dense input field once, moving one cached bitmap, batching the five output dots, and capping device-pixel ratio at 1.5.
- Disabled continuous particle and ring animation when reduced motion is requested.
- Refined headline weight, character spacing, and word spacing; increased desktop separation from the light ring and introduced a balanced two-line mobile headline with a constrained description.
- Updated the GitHub repository About link from the retired release page to `https://signaldesk.run`.
- Replaced the GitHub README banner with the current black particle conveyor, full-color light ring, five-dot output, and “filter the slop” copy.

### Fixed

- Send an exact `start_time` for every selected search window.
- Enforce the selected boundary after retrieval in both the local server and Cloudflare Worker runtimes, preventing older posts or posts without a valid `created_at` timestamp from appearing in results.
- Made the wheel interior and clearance band fully opaque and erased the same circular region from the input canvas, preventing particles from appearing beneath or beyond the filter.
- Layered the curated output separately above the opaque filter so only the five intended output dots remain visible on the right.

### Removed

- Removed the downloadable `v0.1.0-alpha.1` GitHub release and its tag because SignalDesk is distributed only as a hosted web application.
- Removed the liquid-glass overlay, desaturated hero treatment, static dot grid, and pointer-driven magnetic wave renderer.
