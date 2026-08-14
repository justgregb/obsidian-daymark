# Daymark

Daymark is a local-first Obsidian journal built around dated Markdown notes. One sidebar view combines a useful Week, Month, and Year calendar with an unfolding Tally summary for the same period.

Daymark has no runtime dependencies, accounts, analytics, or network requests. Journal notes remain ordinary Markdown inside the vault.

## Daymark calendar

Run **Daymark: Open Daymark** or select the Daymark ribbon icon.

The compact sidebar calendar renders one period at a time without adding a Calendar scrollbar. Week, Month, and Year keep their natural readable geometry inside one shared responsive stage, so changing modes does not move the unfolded Tally beneath them. The stage is strictly constrained to the available sidebar width, including narrow mobile panes. A day is selected only through an intentional day/open-note action; changing periods does not invent a selection. It provides:

- Week, Month, and Year views that retain the explicitly selected date;
- previous and next controls for moving one period at a time without selecting a day;
- any explicit first weekday, or a locale default that shows the resolved day;
- optional tinting for any combination of weekdays;
- pale activity tiles for dates with daily notes;
- current-day and currently open-note highlighting;
- previous, next, and Today controls;
- click-to-open existing daily notes;
- confirmation before creating missing notes using an optional Markdown template.

Month and Week cells support arrow-key navigation without opening or creating notes. **Daymark: Go to date** reveals any chosen date in the current calendar view, while **Daymark: Open today’s note** opens today through the same safe creation confirmation used by the calendar. Both commands can be assigned shortcuts under **Settings → Hotkeys**.

Calendar cells can use the first local image embedded in a daily note as that day's cover. Covers fill the date cell, while image-free notes use a pale accent tile. Highlighted weekdays use a separate neutral background; when the states overlap, the daily-note tile takes priority. Both Obsidian embeds such as `![[Shelf/Attachments/photo.jpg]]` and local Markdown image embeds are supported; remote images are ignored. Note covers can be disabled in settings.

Week view presents seven compact, aligned agenda rows. Every row starts with a 36-pixel date tile: the first local image fills the tile when available, image-free notes use the accent tint, and empty dates remain plain. The row shows the weekday plus that note's words and checked items. Its footer totals the displayed week and can unfold Tally for that same week. The period arrows change the visible week without moving the selected date, and the fixed header slots keep the view switch stationary.

Year view shows one full year as twelve compact activity grids. It uses a natural four-by-three layout at ordinary sidebar widths and three columns in very narrow leaves, with the period footer immediately below the final row. Three accent intensities show each writing day's volume relative to the busiest day in that year; an empty daily note remains a quieter mark. Recurring-day shading, today, and the selected date remain distinct. Selecting a month returns to Month view without selecting an arbitrary day, and arrow keys move between months without changing the selected date. One small contextual icon beside the period title cycles Week → Month → Year without adding another toolbar row. The entire control row keeps one fixed height at every width, so changing modes or gaining a scrollbar cannot resize the switch beneath the pointer.

The calendar follows the configured folder and Moment-style date format, including nested paths such as `YYYY/MM/YYYY-MM-DD`. Daymark does not depend on the Daily Notes or Calendar plugins.

Selecting an empty date opens a compact confirmation with the human-readable date and exact Markdown path. No file is written until **Create** is selected. When creating a note, Daymark supports these template variables:

```text
{{date}}
{{date:dddd, D MMMM YYYY}}
{{time}}
{{time:HH:mm}}
{{title}}
```

## Quick Log

Run **Daymark: Quick Log** to capture a short thought without changing views. Entering text and selecting **Add** appends one timestamped prose line to today's daily note:

```markdown
`09:05` — A thought worth keeping
```

The timestamp is inline code, so Tally counts the entry's prose without counting the time as words. If today's daily note does not exist, Daymark shows the normal creation confirmation and applies the configured template before appending. Assign any keyboard shortcut under **Settings → Hotkeys** by searching for `Daymark: Quick Log`.

## Tally

Select **Tally** beneath the calendar, or run **Daymark: Open Tally**, to unfold totals inside the existing Daymark view. Calendar and Tally always share one Week, Month, or Year period, so there is no second sidebar tab or duplicated navigation.

Tally calculates live Week, Month, and Year totals for journal prose, checked items, and numeric values attached to tags on checked lines:

```markdown
- [x] Greek lesson #greek
- [x] 160 #pushups – (40x4), feeling strong
- [x] 5.5 #running
```

The example contributes three checked items, `1` to `#greek`, `160` to `#pushups`, and `5.5` to `#running`.

Numeric tallies follow these rules:

- Only `[x]` and `[X]` tasks count as complete.
- The first valid standalone number can appear before or after the task text.
- Integers and dot-decimals are supported.
- A tagged completed task containing no numeric value defaults to `1`.
- Comma-formatted and negative values are ignored.
- Every distinct tag on a numeric task receives the value.
- Tags are aggregated case-insensitively and displayed as natural-language labels.

Collapsed Tally keeps daily-note coverage, words, and checked progress on one responsive line, with deliberately shorter copy in very narrow panes. Expanded Tally presents Daily notes, Words, Checked items, and natural-language tagged totals through one compact, consistently aligned metric ledger. At narrow widths, labels shorten with an ellipsis before right-aligned totals are allowed to move or wrap. The quiet `TALLY` section label and chevron stay in the same left-hand slot in both states, while the right slot changes from the compact period summary to **Save** or **Report**. Very narrow panes hide only that action's text label and keep its icon in place. Its state is remembered; it starts expanded on desktop and collapsed on mobile until you choose otherwise. Saving creates a Markdown report with period-based breakdowns: Year reports contain months, Month reports contain weeks, and Week reports contain linked days. When that report matches the live journal, **Report** reopens it in a new tab; a stale report returns to **Save**. Empty periods keep a disabled save affordance. Detailed source breakdowns stay in the generated report rather than crowding the sidebar.

An optional **Additional writing folder** adds one compact all-time word total beneath the period tallies. Tally reads Markdown files in that folder and its subfolders, applies the same prose exclusions, and updates the total live. The folder total is independent of Week, Month, and Year, and is not written into saved period reports. Generated `Tally — …` reports are excluded from this count.

The calendar's compact period button cycles through Week, Month, and Year without opening a menu. When unfolded content exceeds the sidebar, Daymark uses one natural scroll surface for the complete Calendar and Tally view.

Saved reports retain the established `Tally — <period>.md` filename so existing reports remain compatible after the Daymark rename. Daymark refuses to overwrite a same-named file that it does not recognize as generated output.

## Word count

Daymark counts Unicode words in journal prose. It excludes frontmatter, fenced code, HTML comments, inline code, URLs, images, Markdown list and task lines, and formatting characters. Visible Markdown-link and wikilink labels remain countable.

## Settings

- **Daily notes folder:** root journal folder, default `Journal`.
- **Daily note template:** optional Markdown template used only for new notes.
- **File date format:** date-based filename and optional folder path, default `YYYY-MM-DD`.
- **Start week on:** locale default or any weekday from Sunday through Saturday.
- **Shade recurring days:** add a neutral background to recurring days such as weekends.
- **Show note covers:** show or hide local-image covers in calendar cells.
- **Show calendar totals:** show daily-note coverage, words, and checked items for the displayed week, month, or year.
- **Show Tally:** unfold journal words, checked items, and tagged values beneath the calendar for its current week, month, or year.
- **Additional writing folder:** optionally show one recursive, all-time prose word total for another folder.

Use **Daymark: Rebuild index** only for manual recovery. **Daymark: Save current Tally period** opens Daymark, keeps its current Week/Month/Year mode, jumps to the present period, and saves it. **Quick Log**, **Open today’s note**, and **Go to date** can each be assigned a shortcut in Obsidian's Hotkeys settings.

## Installation

Copy `manifest.json`, `main.js`, and `styles.css` into:

```text
<vault>/.obsidian/plugins/daymark/
```

Reload Obsidian, then enable **Daymark** under **Settings → Community plugins**.

### Build from source

```sh
npm install
npm run build
npm test
npm run lint
```

The shipped `styles.css` is generated from the smaller files under `styles/`; `npm run build` regenerates it automatically. For manual responsive QA, open `tests/visual/daymark-sidebar.html` to inspect the unified collapsed, expanded, empty, and long-title states at 285px, 320px, and normal sidebar widths in light and dark themes.

## Privacy and safety

- All processing happens locally through Obsidian's Vault API.
- Daymark reads dated Markdown files beneath the configured journal folder and, when explicitly configured, Markdown files beneath the additional word-count folder.
- Selecting an existing date only opens the note.
- Selecting a missing date creates one Markdown file from the configured template; Daymark does not rewrite existing daily notes.
- Quick Log appends one timestamped line only after you select Add; a missing daily note still requires confirmation.
- Tally creates or updates only an explicitly saved generated report.
- Settings are stored through Obsidian's plugin data API.
- Daymark contains no analytics, telemetry, remote APIs, or network code.

## Compatibility

- Obsidian 1.4.10 or newer
- Desktop and mobile

## Release status

Version `0.1.0` is a local beta. A public GitHub release and Obsidian community-directory submission remain outside this beta.

## License

MIT
