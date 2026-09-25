import { bench, describe } from "vitest";
import type { App } from "obsidian";
import { LinkedWritingIndex } from "../src/linked-writing-index";
import { fakeFile } from "../tests/obsidian-fakes";

for (const count of [1, 12, 100]) {
  const source = fakeFile("Journal/2026-09-25.md");
  const targets = Array.from({ length: count }, (_, index) => fakeFile(`Desk/Note ${count - index}.md`));
  const files = new Map(targets.map(file => [file.path, file]));
  const app = {
    vault: { getAbstractFileByPath: (path: string) => files.get(path) },
    metadataCache: { resolvedLinks: { [source.path]: Object.fromEntries(targets.map(file => [file.path, 1])) } }
  } as unknown as App;
  const index = new LinkedWritingIndex(app, () => "en", () => 100);
  await index.rebuild([source]);
  describe(`${count} linked notes, unchanged resolved metadata`, () => {
    bench("refresh linked metadata", async () => { await index.refreshSource(source); }, { time: 400, warmupTime: 100 });
  });
}
