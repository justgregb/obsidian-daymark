# Privacy

Daymark is entirely local. It makes no network requests and contains no analytics, telemetry, advertising, accounts, or remote services.

The plugin reads dated Markdown files under the configured journal folder. When an additional word-count folder is explicitly configured, it also reads Markdown files in that folder and its subfolders to calculate one all-time prose word total. Selecting an existing calendar date or using Go to date performs no note write. Selecting a missing date—or opening today's note when it is missing—creates one Markdown file only after confirmation, optionally using the configured local template. Quick Log appends one timestamped line only after the user submits it. Daymark does not rewrite, rename, or delete existing notes.

When **Show note covers** is enabled, Daymark reads the first embedded local image used by each visible Month or Week date and creates a small temporary thumbnail in memory. Thumbnail files are never written to the vault or sent anywhere, and their temporary object URLs are released when the cache evicts them or the Daymark view closes.

When the user explicitly selects Save in Tally, Daymark creates or updates one structured `Tally — <period>.md` report in the narrowest common folder containing that period's daily notes. It refuses to overwrite a same-named file that it does not recognize as generated output. Open only reopens the matching generated report and does not change it.

While Margin layout is active, Daymark also reads local Markdown notes directly linked by dated daily notes to calculate writing-volume marks. It uses Obsidian's resolved links, reads each shared target through an in-memory cache, and updates affected dates when linked notes change. It does not follow links recursively or request external URLs. No linked note is modified, and these extra word counts are not added to Tally reports.

Calculated records, linked-word counts, and totals remain in memory and are discarded when the plugin unloads. Optional day names are user-authored labels keyed by calendar date. They are saved in local plugin data; naming a day never creates, renames, or edits a note.

Only settings—including the journal folder, optional additional word-count folder, filename date format, optional template path, and calendar preferences and day names—are persisted through Obsidian's plugin data API.

The active Margin Tally lens and summary-open preference are saved with the calendar's local Obsidian workspace view state. Summary and lens values use the existing in-memory Tally index, do not change parsing scope, and never write notes or reports. A report is still written only through Save.
