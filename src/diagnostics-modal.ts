import { ButtonComponent, Modal, type App } from "obsidian";

export class DiagnosticsModal extends Modal {
  constructor(
    app: App,
    private readonly report: string
  ) {
    super(app);
  }

  override onOpen(): void {
    this.modalEl.addClass("daymark-diagnostics-modal");
    this.titleEl.setText("Daymark diagnostics");
    this.contentEl.createEl("p", {
      cls: "daymark-diagnostics-description",
      text: "Local counts and timings for troubleshooting. Note names, paths, and contents are excluded."
    });

    const output = this.contentEl.createEl("textarea", {
      cls: "daymark-diagnostics-output"
    });
    output.value = this.report;
    output.readOnly = true;
    output.rows = 14;
    output.setAttr("aria-label", "Daymark diagnostics report");
    output.spellcheck = false;

    const actions = this.contentEl.createDiv("daymark-diagnostics-actions");
    const close = new ButtonComponent(actions)
      .setButtonText("Close")
      .setCta()
      .onClick(() => this.close());
    window.setTimeout(() => close.buttonEl.focus(), 0);
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
