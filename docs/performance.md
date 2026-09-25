# Performance and release checks

## Runtime limits

- The production bundle has no runtime dependency beyond Obsidian, and no network, Node, or Electron API use.
- The Margin timeline retains nearby months and at most one offscreen name editor. Folded months use a measured buffer so compressed gaps still fill the viewport.
- Scroll frames use cached row geometry and binary search. Row measurements happen after content or size changes, not on ordinary scroll frames.
- Normal date updates look up only affected dates. An active Tally lens also considers loaded rows in affected months because their bar scale may change. Empty updates and updates after disposal return immediately.
- Unchanged rows, resize subscriptions, and linked-title arrays are retained. Repeated linked metadata does not reread note content or redraw dates.
- Coil shapes are capped at 256, monthly lens entries at 12, and each formatter cache at 32. Expanded folds and links store only user-toggled dates for the lifetime of the view.
- Daily and linked rebuild reads use at most eight workers. Cancellation prevents new queued reads; stale in-flight results cannot repopulate disposed indexes.
- Tally content and report controls are constructed on demand. Document listeners are present only while its panel is open. Hidden linked titles and folded date controls are created when revealed.
- Runtime assets, including the manifest, must fit the existing 192 KiB release budget.

These are bounded-work and lifecycle guarantees, not frame-rate promises for every vault or device.

## Repeatable checks

```sh
npm ci
npm run build
npm run lint
npm test
npm run benchmark
node scripts/build-margin-fixture.mjs
```

Serve the repository locally and open `tests/visual/daymark-margin.html`. The default page compares 200px, 285px, and 320px in light and dark themes. Parameters `mobile=1`, `large=1`, `locale=de`, and `quiet=1` exercise touch rules, larger text, locale sizing, and long folded gaps. The fixture uses synthetic data and does not access a vault. Its Today control mirrors production navigation without opening or creating a note.

The test suite covers scroll anchoring, resize subscription reuse, no per-scroll geometry reads, unchanged-row reuse, linked-list and fold layout changes, midnight rollover, preserved drafts, listener cleanup, index races, metadata reuse, creation confirmation, and report overwrite protection.

## Local benchmark reference

Measured on 2026-09-25 with Node 26.10.0 and Vitest 3.2.7. Values are means in milliseconds. These synthetic tests exclude vault disk I/O, Obsidian startup, rendering, and mobile execution; compare repeated runs on the same machine before drawing conclusions.

| Operation | 100 notes | 1,000 notes | 5,000 notes |
| --- | ---: | ---: | ---: |
| Parse and store rebuild | 0.876 | 9.069 | 44.114 |
| Incremental refresh and year aggregation | 0.0088 | 0.1363 | 0.1230 |
| Prioritize a Sync batch | 0.0029 | 0.0307 | 0.1511 |

Unchanged metadata with 100 linked notes averaged 0.0068 ms. Calculating one selected Margin metric across 30 days and 100 tags averaged 0.0043 ms; constructing every metric and selecting one averaged 0.2248 ms. These describe existing optimizations, not a newly measured speedup from the final sweep.

## Packaging

`npm run build` regenerates the CSS and production bundle, then runs `check:release`. Release checks validate the asset budget, public-copy synchronization, matching package/manifest/lockfile versions, compatibility mapping, plugin identity, and mobile support. Tests exercise rejection of mismatched release metadata.

An installed plugin needs only `main.js`, `manifest.json`, and `styles.css`. Never distribute `data.json`, vault notes, caches, local test outputs, or `node_modules`. Keep source archives separate from installation assets. Do not claim local artifacts have GitHub attestations: the existing tagged-release workflow generates those when a release is published.
