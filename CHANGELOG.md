# Changelog

## Unreleased

- Added a compact Year activity overview with twelve month tiles, full-year totals, month drill-down, and direct Year handoff to Tally.
- Added gentle proximity snapping and faint fading separators between nearby Week, Month, and Year periods without duplicate headings or forced rerenders, and unified Calendar's compact mode control with Tally's Week → Month → Year cycle.

## 0.1.0 — 2026-08-12

- Prepared the source, documentation, privacy statement, license, and minified runtime artifacts for the initial public release.
- Updated generated-report writes and the settings heading to follow current Obsidian plugin API guidance.
- Rewrote Daymark's settings in warmer, clearer language, hid the additional folder until Tally is enabled, and improved the form layout at narrow widths.
- Added one optional recursive folder-wide word counter, shown as a separate all-time Tally section and excluded from saved period reports.
- Matched Tally's totals list to the weekly agenda with compact rounded rows, stronger labels, and quieter right-aligned values.
- Enlarged the uppercase period headings, removed the awkward top inset in both views, raised footer readability, gave Tally the same typographic language, and replaced circular toolbar hovers with softly squared controls.
- Added container-aware Month, Week, and Tally layouts, independent body scrolling, compact narrow-width controls, and bounded wide-view grids.
- Standardized locale-aware abbreviated month names across Daymark, Tally, breakdowns, and generated reports.
- Renamed checkbox totals to Checked items in both the live view and generated reports, and compacted Tally period titles to prevent header truncation without shrinking controls.
- Moved Tally's save state into a compact header icon and restored the Daily notes label.
- Removed Tally's current-period title marker and changed its mode control to cycle Week → Month → Year in place.
- Restored Notes as the first Tally metric, returned the header to one aligned row, and strictly constrained the bottom action bar to 44px.
- Simplified Tally to 36px total rows, hid empty checkbox totals, removed row separators, and grounded Save in a 44px bottom action bar.
- Kept the action label as Save when an existing report needs refreshing instead of switching to Update.
- Replaced Tally's day-oriented Today label with a compact, mode-aware current week/month/year action.
- Replaced Tally's heavy segmented tabs with a calendar-style header and native period menu, and reserved scrollbar space to prevent mode-switch alignment shifts.
- Removed the calendar footer's mismatched background and unified Tally's switcher, period title, metrics, and actions with the calendar typography and control scale.
- Anchored calendar totals to a fixed bottom bar, aligned the totals and Tally action, and added daily-note counts to Month totals.
- Removed visual hover tooltips from weekly rows while retaining accessible labels, and tightened the calendar footer into a flush bottom bar.
- Balanced weekly rows with right-aligned word and checkbox totals, unified Month/Week title typography, and standardized standalone controls with larger pill-shaped hover targets.
- Kept the Month/Week switch in a fixed header position so it remains under the pointer when the view changes.
- Renamed the overall plugin from Tally to Daymark while retaining Tally reports and syntax.
- Added a compact sidebar month calendar with note activity, active-note highlighting, and click-to-open or create.
- Refined the calendar to match Obsidian's familiar Daily Notes layout with a left-aligned month, persistent Today control, note dots, and accent-filled selection.
- Matched the established Calendar plugin's compact header, weekday, date-cell, and dot-row geometry.
- Added Day One-style date-cell covers using each daily note's first local image embed.
- Replaced note dots with quiet accent tiles and removed intrusive day tooltips.
- Added an optional selected-day stats row with a persistent, visible Tally button beneath the calendar.
- Anchored the calendar footer to the bottom of the sidebar and added a setting to disable Tally independently of Daymark.
- Softened and separated daily-note tiles, added an optional cover-photo setting, improved selected-day checkbox status, and grouped settings by feature.
- Added a compact confirmation before creating a missing daily note, including its date and exact local Markdown path.
- Redesigned settings as compact feature cards, expanded first-day-of-week choices to all seven days, and added configurable weekday highlights.
- Separated note activity from recurring weekday highlights with activity dots and rewrote settings copy around concrete behavior.
- Replaced alignment-shifting note dots with stronger date numerals and replaced crowded weekday switches with compact day buttons.
- Restored pale accent tiles for existing notes and changed recurring weekday highlights to a separate neutral background.
- Added a saved Month/Week calendar switch and a seven-row weekly agenda with aligned cover tiles, per-day activity, week totals, and period-aware Tally navigation.
- Compacted weekly agenda rows and moved the Month/Week control into a single contextual icon beside the period title to reduce layout movement.
- Added optional local daily-note templates with nested Moment-style date paths and standard date, time, and title variables.
- Added a compact right-sidebar view with Week, Month, and Year periods.
- Added local prose-word, completed-checkbox, and tagged numeric totals.
- Added numberless tagged-task value `1`, flexible number placement, multiple tags, and natural-language labels.
- Kept the sidebar totals-only and moved hierarchical month, week, and linked-day breakdowns into saved Markdown summaries.
- Added daily-note coverage, Save/Saved/Update report state, period-first report sections, and a `Tally: Save current period` command.
- Added live incremental indexing limited to dated Markdown notes under the configured journal folder.
- Added Daily Notes-style folder suggestions, custom date paths, locale-aware week starts, and manual recovery through `Daymark: Rebuild index`.
- Added explicit Markdown summary saving with structure-aware placement, overwrite protection, immediate new-tab opening, and no duplicate in-note title.
- Added responsive, theme-native styling, accessible controls, local-only processing, and mobile compatibility.
