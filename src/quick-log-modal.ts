import { ButtonComponent, Modal, TextComponent, type App } from "obsidian";

class QuickLogModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly resolve: (value: string | null) => void
  ) {
    super(app);
  }

  override onOpen(): void {
    this.modalEl.addClass("daymark-quick-log-modal");
    this.titleEl.setText("Quick log");
    this.contentEl.createEl("p", {
      cls: "daymark-quick-log-description",
      text: "Capture a timestamped note into today."
    });

    const field = this.contentEl.createDiv("daymark-quick-log-field");
    const input = new TextComponent(field)
      .setPlaceholder("What do you want to remember?");
    input.inputEl.setAttr("aria-label", "Quick log entry");
    input.inputEl.setAttr("autocomplete", "off");

    const actions = this.contentEl.createDiv("daymark-quick-log-actions");
    new ButtonComponent(actions)
      .setButtonText("Cancel")
      .onClick(() => this.finish(null));
    const add = new ButtonComponent(actions)
      .setButtonText("Add")
      .setCta()
      .setDisabled(true)
      .onClick(() => this.finish(input.getValue()));

    input.onChange((value) => add.setDisabled(value.trim().length === 0));
    input.inputEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing || input.getValue().trim().length === 0) return;
      event.preventDefault();
      this.finish(input.getValue());
    });
    window.setTimeout(() => input.inputEl.focus(), 0);
  }

  override onClose(): void {
    this.contentEl.empty();
    if (this.settled) return;
    this.settled = true;
    this.resolve(null);
  }

  private finish(value: string | null): void {
    if (this.settled) return;
    const normalized = value?.trim() ?? null;
    if (normalized !== null && normalized.length === 0) return;
    this.settled = true;
    this.resolve(normalized);
    this.close();
  }
}

export function promptQuickLog(app: App): Promise<string | null> {
  return new Promise((resolve) => {
    new QuickLogModal(app, resolve).open();
  });
}
