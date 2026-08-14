# Daymark

Daymark is a local-first Obsidian journal built around dated Markdown notes. It adds useful Week, Month, and Year calendars to the sidebar and keeps Tally as a focused companion for period summaries.

Daymark has no runtime dependencies, accounts, analytics, or network requests. Journal notes remain ordinary Markdown inside the vault.

## Daymark calendar

Run **Daymark: Open Daymark** or select the Daymark ribbon icon.

The compact sidebar calendar provides:

- Week, Month, and Year views that retain the selected date;
- any explicit first weekday, or a locale default that shows the resolved day;
- optional tinting for any combination of weekdays;
- pale activity tiles for dates with daily notes;
- current-day and currently open-note highlighting;
- previous, next, and Today controls;
- click-to-open existing daily notes;
- confirmation before creating missing notes using an optional Markdown template.

Month and Week cells can use the first local image embedded in a daily note as that day's cover. Covers fill the date cell, while image-free notes use a pale accent tile. Highlighted weekdays use a separate neutral background; when the states overlap, the daily-note tile takes priority. Both Obsidian embeds such as `![[Shelf/Attachments/photo.jpg]]` and local Markdown image embeds are supported; remote images are ignored. Note covers can be disabled in settings. Month view also lets you scroll through nearby months with a gentle settling snap; the fixed header and totals follow the centered month without forcing a rerender. A faint fading rule marks each period boundary without repeating its title.

Week view presents seven compact, aligned agenda rows. Every row starts with a 36-pixel date tile: the first local image fills the tile when available, image-free notes use the accent tint, and empty dates remain plain. The row shows the weekday plus that note's words and checked items. Scroll to settle onto a nearby week; the header and footer follow it using the same gentle snap as Month view.

Year view is a compact activity overview rather than twelve full calendars. All twelve months appear as small month tiles whose marks show ordinary days, recurring weekdays, daily-note activity, today, and the selected date. Scroll and settle onto a nearby year using the same snap and fading boundary as Month and Week, or select a tile to open that month at full size. Individual note opening and creation remain in Month and Week views.

A small icon beside the period title cycles Week, Month, and Year without adding another toolbar row. The footer totals the displayed period and opens Tally in the matching mode.

The calendar follows the configured folder and Moment-style date format, including nested paths such as `YYYY/MM/YYYY-MM-DD`. Daymark does not depend on the Daily Notes or Calendar plugins.

Selecting an empty date opens a compact confirmation with the human-readable date and exact Markdown path. No file is written until **Create** is selected. When creating a note, Daymark supports these template variables:

```text
{{date}}
{{date:dddd, D MMMM YYYY}}
{{time}}
{{time:HH:mm}}
{{title}}
```

## Tally

Run **Daymark: Open Tally** to open the dedicated Tally sidebar view.

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

The Tally sidebar shows totals only. Selecting **Save** creates a Markdown report with period-based breakdowns: Year reports contain months, Month reports contain weeks, and Week reports contain linked days. The control changes to **Saved** when the report matches the live journal and returns to **Save** when it is stale.

An optional **Additional writing folder** adds one separate all-time Words section beneath the period totals. Tally reads Markdown files in that folder and its subfolders, applies the same prose exclusions, and updates the total live. The folder total is independent of Week, Month, and Year, and is not written into saved period reports. Generated `Tally — …` reports are excluded from this count.

The compact period button cycles through Week, Month, and Year views without opening a menu.

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
- **Show calendar totals:** show daily-note count, words, and checked items for the displayed week, month, or year.
- **Show Tally:** total journal words, checked items, and tagged values by week, month, or year.
- **Additional writing folder:** optionally show one recursive, all-time prose word total for another folder.

Use **Daymark: Rebuild index** only for manual recovery. **Daymark: Save current Tally period** jumps to and saves the current period in the last selected Tally mode.

## Installation

### Install a release manually

1. Download `manifest.json`, `main.js`, and `styles.css` from the [latest release](https://github.com/justgregb/obsidian-daymark/releases/latest).
2. Create this folder inside your vault if it does not already exist:

```text
<vault>/.obsidian/plugins/daymark/
```

3. Copy the three downloaded files into that folder.
4. Reload Obsidian, then enable **Daymark** under **Settings → Community plugins**.

### Build from source

Building Daymark requires Git and Node.js.

```sh
git clone https://github.com/justgregb/obsidian-daymark.git
cd obsidian-daymark
npm ci
npm run build
npm test
npm run lint
```

After the build succeeds, copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/daymark/`. Reload Obsidian, then enable **Daymark** under **Settings → Community plugins**.

## Privacy and safety

- All processing happens locally through Obsidian's Vault API.
- Daymark reads dated Markdown files beneath the configured journal folder and, when explicitly configured, Markdown files beneath the additional word-count folder.
- Selecting an existing date only opens the note.
- Selecting a missing date creates one Markdown file from the configured template; Daymark does not rewrite existing daily notes.
- Tally creates or updates only an explicitly saved generated report.
- Settings are stored through Obsidian's plugin data API.
- Daymark contains no analytics, telemetry, remote APIs, or network code.

## Compatibility

- Obsidian 1.4.10 or newer
- Desktop and mobile

## Release status

Version `0.1.0` is ready for its initial public release.

## License

MIT
