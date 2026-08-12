# Privacy

Daymark is entirely local. It makes no network requests and contains no analytics, telemetry, advertising, accounts, or remote services.

The plugin reads dated Markdown files under the configured journal folder. When an additional word-count folder is explicitly configured, it also reads Markdown files in that folder and its subfolders to calculate one all-time prose word total. Selecting an existing calendar date opens that note without changing it. Selecting a missing date creates one Markdown file at the configured path, optionally using the configured local template. Daymark does not rewrite, rename, or delete existing notes.

When the user explicitly selects Save in Tally, Daymark creates or updates one structured `Tally — <period>.md` report in the narrowest common folder containing that period's daily notes. It refuses to overwrite a same-named file that it does not recognize as generated output.

Calculated records and totals remain in memory and are discarded when the plugin unloads. Only settings—including the journal folder, optional additional word-count folder, filename date format, optional template path, and calendar preferences—are persisted through Obsidian's plugin data API.
