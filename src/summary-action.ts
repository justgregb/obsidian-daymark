import type { SavedSummaryState } from "./saved-summary";

export type SummaryActionIntent = "none" | "save" | "open";

export interface SummaryActionPresentation {
  intent: SummaryActionIntent;
  label: "Save" | "Report";
  icon: "save" | "file-text";
  disabled: boolean;
  ariaLabel: string;
}

export function summaryActionPresentation(
  noteCount: number,
  state: SavedSummaryState = "save"
): SummaryActionPresentation {
  if (noteCount === 0) {
    return {
      intent: "none",
      label: "Save",
      icon: "save",
      disabled: true,
      ariaLabel: "Save unavailable: no daily notes in this period"
    };
  }
  if (state === "saved") {
    return {
      intent: "open",
      label: "Report",
      icon: "file-text",
      disabled: false,
      ariaLabel: "Open the saved Tally report for this period"
    };
  }
  return {
    intent: "save",
    label: "Save",
    icon: "save",
    disabled: false,
    ariaLabel: state === "update" ? "Save changes to this period" : "Save this period"
  };
}
