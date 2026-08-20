# Changelog

## 0.2.4 — 2026-08-20

- Kept the calendar at a stable size when Tally is folded or unfolded, and updated only the footer so mobile cover images stay mounted instead of reloading.

## 0.2.3 — 2026-08-20

- Added a GitHub Actions release workflow that builds, validates, cryptographically attests, and publishes the three Obsidian release assets from each version tag.
- Limited journal and additional-writing rebuilds to their configured folders instead of enumerating every Markdown file in the vault.
- Moved Settings to Obsidian's searchable declarative API and raised the minimum supported Obsidian version to 1.13.0.
- Added a typed boundary around Obsidian's Moment export so strict source review no longer reports unsafe values, calls, assignments, arguments, or member access.
- Replaced partially supported CSS and `!important` overrides with equivalent grid gaps, accessible clipping, and higher-specificity scoped rules.

## 0.2.2 — 2026-08-20

- Added an optional Ko-fi support link through Obsidian's standard funding field and the README.

## 0.2.1 — 2026-08-20

- Kept the period switcher fixed across Week, Month, and Year by giving Daymark's actual scroll container a stable scrollbar gutter, including narrow and overflow-sensitive sidebar layouts.

## 0.2.0 — 2026-08-20

- Reduced Daymark's runtime and rendering overhead by minifying the generated stylesheet under a 128 KB release-asset budget, caching saved-report state and discovered hashtags, skipping inactive additional-folder scans, consolidating settings helpers and responsive rules, and removing repeated Calendar class-list allocations.
- Refined Daymark settings into quieter, more balanced cards with clearer Tally display-name groups, compact alias rows, polished date previews, native mobile toggle alignment, and a subtle divider before custom Tally counters.
- Made Tally avoid double-counting completed tagged lines under Checked items, added an always-visible local Photos total with report breakdowns, and made Daily notes, Words, Photos, and tagged labels configurable without changing journal content.
- Added configurable Tally labels discovered from completed tagged items, with normalized local settings, live sidebar sorting, saved-report aliases and stale detection, unused-label recovery, and responsive Settings controls.
- Removed Daymark's custom arrow, Home, and End navigation from Week, Month, and Year while keeping native controls and assignable Obsidian command shortcuts.
- Coalesced index and metadata refreshes into one animation-frame render and removed temporary date strings from active-file synchronization.
- Clarified Tally documentation around measurable counters such as distance, repetitions, sessions, and lessons.
- Made the selected or open day explicit beside its Year-view month label while retaining the compact activity-map layout.
- Built Year activity and monthly totals from one cached-period lookup instead of repeating date-index queries or allocating an intermediate object for every calendar square.
- Prepared Daymark for Obsidian review with atomic report updates, sidebar-state preservation across reloads, compatibility-safe leaf revealing, native settings headings, production minification, official lint checks, and complete runtime-asset verification.
- Preserved cached Week, Month, and Year totals across unrelated note edits; reduced full-index date discovery, Year activity allocations, date-comparison allocations, and additional-folder prose intermediates without changing results or UI behavior.
- Reduced repeated report grouping and Year-view activity passes, reused shared date formatting, and simplified report mode metadata without changing rendered reports or Calendar behavior.
- Redesigned saved Tally reports with a natural at-a-glance summary, coverage and checked progress, a linked writing highlight, chronological Days/Weeks/Months activity and Tally tables, and clear dashes instead of invented zeroes; added an invisible version marker while preserving explicit zero values, legacy report recognition, and overwrite protection.
- Reused bounded locale formatters, Unicode word segmenters, and immutable report descriptors across renders, index rebuilds, settings, report-state checks, and saves; additional-folder totals now update in constant time instead of being re-summed for every Tally render.
- Removed redundant collapsed-footer CSS while preserving the established Tally-left and Report-right layout.
- Fixed Report alignment in expanded Tally so the action reaches the right edge instead of being pulled toward the middle by its shared button styling.
- Swapped the unified Tally footer slots without introducing movement: Tally now stays on the left, while the right side changes from the compact period summary to Save or Report.
- Constrained every expanded Tally grid and row to a zero-minimum 100% track, so long labels ellipsize while right-aligned totals remain visible in narrow desktop and mobile sidebars.
- Unified expanded Tally into one native-style 32px metric ledger for Daily notes, Words, Checked items, and tagged totals; replaced the wrapped collapsed summary with full and narrow single-line variants.
- Constrained the shared Calendar stage to a zero-minimum responsive grid track, preventing its invisible height sizer from clipping Sunday and the rightmost date cells in narrow sidebars.
- Gave Week, Month, and Year one shared responsive Calendar stage so their different natural heights no longer move the unfolded Tally when cycling modes.
- Locked the Calendar header and period switcher to one invariant control height, preventing mode-dependent scrollbar changes from moving Calendar or unfolded Tally content vertically.
- Removed hover highlighting from read-only Tally totals so the rows no longer imply an unavailable action.
- Returned Year to a compact natural-height activity grid and removed the height-filling rules that could scatter month rows across the sidebar.
- Unified Calendar and Tally into one Daymark sidebar view with one shared Week, Month, or Year period, one header, and one navigation state.
- Fixed collapsed Tally on mobile by letting Month and Week keep their natural content height, so the disclosure remains directly beneath the calendar instead of dropping behind Obsidian's bottom interface.
- Matched Tally to the Calendar and Week design language: removed the redundant section icon, stacked the collapsed summary, renamed the report actions for clarity, matched metric-row rhythm, added quiet spacing before custom tallies, and reduced the additional-folder heading.
- Restored the quiet theme-native Save/Open control by preventing Obsidian's default raised-button style from overriding Daymark's scoped action styling.
- Replaced the separate Tally tab with a remembered whole-section disclosure: compact calendar totals when collapsed and a flat, source-free totals list when expanded.
- Moved Save/Open into the expanded Tally heading, kept detailed period breakdowns in generated Markdown, and added one natural outer scroll only when the combined view needs it.
- Made **Open Tally** reveal and expand Daymark, migrated saved legacy Tally leaves into the unified view, and retained the old view type only as a transition shim.
- Fixed Tally's title action by making the period title and Save/Open hover label one real button instead of overlapping sibling layers. Every click now resolves the live report state before saving, updating, or opening, with duplicate-submission protection.
- Added assignable **Open today’s note** and **Go to date** commands; date jumping only reveals the day and never creates a note automatically.
- Changed Calendar totals from a raw note count to period coverage, such as `12/31 days`.
- Changed current saved-report state from a disabled **Saved** label to an actionable **Open** control that reopens the generated Markdown report in a new tab.
- Added a versioned settings migration that preserves the old calendar-total preference while adopting its clearer internal name.
- Split Calendar summaries and the generated stylesheet into maintainable source modules; added a light/dark responsive fixture matrix for 285px, 320px, and normal-width sidebars.
- Matched Tally's overlaid Save/Saved action to the period-title width, kept a disabled Save affordance for empty periods, and preserved Calendar's exact title alignment; compacted Week years keep cross-month ranges readable.
- Restored Calendar's footer-aware leaf state so the footer stays flush with the pane edge, and limited size containment to Year view so Month and Week retain their fixed geometry.
- Added `Daymark: Quick Log`, an assignable command that appends one timestamped prose entry to today's daily note after explicit input and confirms before creating a missing note.
- Added three Year-view writing intensities relative to the busiest writing day in the displayed year, while preserving empty-note, selected-date, today, and recurring-day states.
- Added bounded revision-based caching for period aggregates, with automatic invalidation after create, modify, rename, delete, or full reindex operations.
- Reduced Calendar render work with constant-time date lookup, reused locale formatters, cached date comparisons, and a single Year activity pass.
- Removed stale footer state and layout code without changing the current interface.
- Distributed Year-view rows through the available leaf height so the final months sit naturally above the footer rather than leaving a large empty bottom area.
- Kept Month and Week at their normal readable geometry while retaining height-aware density in Year so all twelve months remain visible without scrolling.
- Removed nearby-period scrolling from Week, Month, and Year; Daymark now renders one period without an internal scrollbar and uses the existing previous/next controls for navigation.
- Separated the visible Week/Month period from the explicitly selected date, so previous/next navigation no longer manufactures or moves a day selection.
- Locked the outer Daymark leaf against scrolling so Week, Month, and Year share one stable header width without a second scrollbar.
- Made Calendar use the same fixed icon-slot header behavior and full-width view geometry as Tally; its four equal mode, previous, current, and next slots keep the switch stationary while preserving week-title space.
- Matched Calendar header layout to Tally, collapsed Today to an icon at narrow widths, and tightened cross-month week titles to prevent Week mode from shifting controls or clipping the period.
- Stabilized the Calendar mode switch across narrow-width breakpoints by keeping its header margins, gaps, and layout slots identical in Week, Month, and Year views.
- Corrected the adaptive Year breakpoint to account for sidebar padding so ordinary narrow sidebars show all twelve months in a four-by-three grid, and fixed Calendar header control columns so the view switch stays under the pointer.
- Compacted Year view to a four-column, three-row grid at ordinary sidebar widths while retaining three columns for narrow sidebars.
- Kept the selected/open date anchored to its real year while browsing other years, preventing false month and day highlights.
- Recovered the source for the installed Year calendar so future builds preserve the shipped behavior.
- Added a twelve-month Year overview with compact daily-note activity grids and a Week → Month → Year calendar mode cycle.

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
