# Daymark

Daymark is a calm, local-first journal for Obsidian. It keeps your dated Markdown notes close at hand with Week, Month, and Year calendars, quick capture, and simple Tally summaries—all in one sidebar.

There are no accounts, analytics, or network requests. Your journal stays in ordinary Markdown files inside your vault.

## Calendar

Open Daymark from the ribbon or run **Daymark: Open Daymark**.

- Switch between Week, Month, and Year.
- See which days already have notes, with optional image covers.
- Use the arrow buttons or **Today** to move around the calendar.
- Click a date to open its note. If it does not exist, Daymark asks before creating it.
- Choose the first day of the week and softly shade recurring days such as weekends.

Year view brings all twelve months together in a compact activity overview. Select a month to open it at full size.

Daymark follows your chosen journal folder and date format, including nested paths such as `YYYY/MM/YYYY-MM-DD`. It does not require Obsidian's Daily Notes plugin or another calendar plugin.

New notes can use a Markdown template with these variables:

```text
{{date}}
{{date:dddd, D MMMM YYYY}}
{{time}}
{{time:HH:mm}}
{{title}}
```

## Quick Log

Run **Daymark: Quick Log** to add a short, timestamped thought to today's note without changing views:

```markdown
`09:05` — A thought worth keeping
```

If today's note does not exist, Daymark asks before creating it. Quick Log, **Open today’s note**, and **Go to date** can all be assigned shortcuts in Obsidian.

## Tally

Tally unfolds beneath the calendar and follows the same Week, Month, or Year. It summarizes:

- Daily notes
- Words
- Checked items
- Numeric values attached to tags on checked lines

For example:

```markdown
- [x] 30 #pushups
- [x] Greek lesson #greek
```

This adds `30` to Pushups and `1` to Greek. Select **Save** to create a Markdown report with a useful period breakdown. Daymark will not overwrite an ordinary note that happens to share a report filename.

You can also choose one additional writing folder for a separate, all-time word count. It never changes journal totals or saved reports.

## Settings

You can choose your daily-note folder, template, date format, first weekday, recurring-day shading, note covers, calendar totals, Tally, and an optional additional writing folder.

Daymark counts journal prose while ignoring frontmatter, code, URLs, images, Markdown list lines, and formatting characters.

## Installation

### Install a release manually

1. Download `manifest.json`, `main.js`, and `styles.css` from the [latest release](https://github.com/justgregb/obsidian-daymark/releases/latest).
2. Create this folder inside your vault:

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

After the build succeeds, copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/daymark/`. Reload Obsidian, then enable Daymark.

## Privacy and safety

- Daymark works locally through Obsidian's vault APIs.
- It reads only the configured journal and optional additional writing folder.
- Calendar navigation never changes an existing note.
- A missing daily note is created only after confirmation.
- Quick Log appends only after you select **Add**.
- Tally writes a report only after you select **Save**.
- Daymark includes no analytics, telemetry, remote APIs, or network code.

## Compatibility

- Obsidian 1.4.10 or newer
- Desktop and mobile

## Release status

Version `0.1.0` is available as a manual GitHub release. Daymark has not yet been submitted to Obsidian's community plugin directory.

## License

MIT
