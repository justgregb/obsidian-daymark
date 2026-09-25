import { afterEach, describe, expect, it, vi } from "vitest";
import DaymarkPlugin from "../src/main";

vi.mock("obsidian", async original => ({
  ...await original<Record<string, unknown>>(),
  Plugin: class {}, ItemView: class {}, Modal: class {}, PluginSettingTab: class {}
}));

afterEach(() => vi.unstubAllGlobals());

describe("plugin lifecycle", () => {
  it("disposes both indexes and cancels timers and queued work on unload", async () => {
    const plugin = new DaymarkPlugin({} as never, {} as never);
    const daily = vi.fn(), additional = vi.fn(), clearTimeout = vi.fn();
    plugin.index = { dispose: daily } as never;
    plugin.additionalWordIndex = { dispose: additional } as never;
    vi.stubGlobal("window", { clearTimeout });
    const listener = vi.fn(); plugin.subscribe(listener);
    const internal = plugin as unknown as {
      syncBatchTimer: number; rebuildTimer: number; additionalWordRebuildTimer: number;
      pendingFileOperations: Map<string, unknown>;
      processFileBatch: (operations: unknown[]) => Promise<void>;
      emitChange: (change: { full: boolean }) => void;
    };
    internal.syncBatchTimer = 1; internal.rebuildTimer = 2; internal.additionalWordRebuildTimer = 3;
    internal.pendingFileOperations.set("queued.md", {});
    plugin.onunload();
    await internal.processFileBatch([{}]); // No workspace/index access after unload.
    internal.emitChange({ full: true });
    expect(daily).toHaveBeenCalledOnce(); expect(additional).toHaveBeenCalledOnce();
    expect(clearTimeout.mock.calls).toEqual([[1], [2], [3]]);
    expect(internal.pendingFileOperations.size).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });
  it("does not register views if unloaded while settings are loading", async () => {
    const plugin = new DaymarkPlugin({} as never, {} as never);
    let release!: () => void;
    const internal = plugin as unknown as { loadSettings: () => Promise<void> };
    internal.loadSettings = () => new Promise<void>(resolve => { release = resolve; });
    const register = vi.fn(); plugin.registerView = register;
    const pending = plugin.onload();
    plugin.onunload(); release(); await pending;
    expect(register).not.toHaveBeenCalled();
  });
});
