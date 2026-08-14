import { ButtonComponent, Modal, type App } from "obsidian";
import { parseIsoDate, toIsoDate } from "./date";
import type { PlainDate } from "./types";

class GoToDateModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly initialDate: PlainDate,
    private readonly resolve: (date: PlainDate | null) => void
  ) {
    super(app);
  }

  override onOpen(): void {
    this.modalEl.addClass("daymark-go-to-date-modal");
    this.titleEl.setText("Go to date");
    this.contentEl.createEl("p", {
      cls: "daymark-go-to-date-description",
      text: "Choose a day to reveal in Daymark. No note will be created."
    });

    const field = this.contentEl.createDiv("daymark-go-to-date-field");
    const input = field.createEl("input", { type: "date" });
    input.value = toIsoDate(this.initialDate);
    input.setAttr("aria-label", "Date to show in Daymark");

    const actions = this.contentEl.createDiv("daymark-go-to-date-actions");
    new ButtonComponent(actions)
      .setButtonText("Cancel")
      .onClick(() => this.finish(null));
    const go = new ButtonComponent(actions)
      .setButtonText("Go")
      .setCta()
      .onClick(() => this.finish(parseIsoDate(input.value)));

    const updateValidity = (): void => {
      go.setDisabled(parseIsoDate(input.value) === null);
    };
    input.addEventListener("input", updateValidity);
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      const date = parseIsoDate(input.value);
      if (!date) return;
      event.preventDefault();
      this.finish(date);
    });
    updateValidity();
    window.setTimeout(() => input.focus(), 0);
  }

  override onClose(): void {
    this.contentEl.empty();
    if (this.settled) return;
    this.settled = true;
    this.resolve(null);
  }

  private finish(date: PlainDate | null): void {
    if (this.settled) return;
    this.settled = true;
    this.resolve(date);
    this.close();
  }
}

export function promptForDate(app: App, initialDate: PlainDate): Promise<PlainDate | null> {
  return new Promise((resolve) => {
    new GoToDateModal(app, initialDate, resolve).open();
  });
}
