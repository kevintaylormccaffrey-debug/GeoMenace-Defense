# Changelog

All notable changes to GeoMenace Defense are documented here.

## [Unreleased]

## [2026-04-08] — Lore screen & rail deploy delay

### Added

- **Lore / transmission screen** before map and difficulty selection: full-screen black overlay with incoming-transmission text typed word-by-word, and a static “Press any button to continue” prompt at the bottom.
- **Rail gun deploy delay**: 0.5 seconds after placement before the first shot (later shots still use the normal fire interval).

### Changed

- **Menu music** does not play on the lore screen; it starts after continuing to map/difficulty selection.
- **Return to main menu** from a run goes directly to map/difficulty; the lore screen is not shown again in that flow.
- **Cache-bust** query parameters updated on `style.css` and `game.js` in `index.html`.

### Technical

- New markup: `#loreOverlay`, `#loreTransmissionText`; `#startOverlay` is hidden on first load until lore is dismissed.
- Styles added for `.lore-overlay`, `.lore-transmission`, `.lore-continue-hint`.
- Logic in `game.js`: lore typing animation, `stopMenuMusic` / `startLoreScreen`, dismiss handlers, `openStartScreen` clears lore state; rail `Tower` constructor sets initial `cooldown` to `0.5` for `typeId === "rail"`.
