import { ItemView, type ViewStateResult } from "obsidian";
import type { LegacyTallyState } from "./legacy-tally-state";

export const LEGACY_TALLY_VIEW_TYPE = "tally-journal-view";

export class LegacyTallyView extends ItemView {
  private state: LegacyTallyState = {};

  getViewType(): string {
    return LEGACY_TALLY_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Tally";
  }

  override getIcon(): string {
    return "list-checks";
  }

  override getState(): Record<string, unknown> {
    return { ...this.state };
  }

  override async setState(state: LegacyTallyState, result: ViewStateResult): Promise<void> {
    this.state = state;
    await super.setState(state, result);
  }

  override async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.createEl("p", { text: "Moving Tally into Daymark…" });
  }
}
