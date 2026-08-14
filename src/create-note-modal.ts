import { ButtonComponent, Modal, type App } from "obsidian";
import { toDate } from "./date";
import { dateTimeFormatter } from "./intl-cache";
import type { PlainDate } from "./types";

class CreateDailyNoteModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly date: PlainDate,
    private readonly path: string,
    private readonly locale: string,
    private readonly resolve: (confirmed: boolean) => void
  ) {
    super(app);
  }

  override onOpen(): void {
    this.modalEl.addClass("daymark-create-note-modal");
    this.titleEl.setText("Create daily note?");

    const dateLabel = dateTimeFormatter(this.locale, {
      dateStyle: "full",
      timeZone: "UTC"
    }).format(toDate(this.date));
    const prompt = this.contentEl.createEl("p", { cls: "daymark-create-note-prompt" });
    prompt.appendText("Create a new daily note for ");
    prompt.createEl("strong", { text: dateLabel });
    prompt.appendText("?");
    this.contentEl.createEl("code", {
      cls: "daymark-create-note-path",
      text: this.path
    });

    const actions = this.contentEl.createDiv("daymark-create-note-actions");
    new ButtonComponent(actions)
      .setButtonText("Cancel")
      .onClick(() => this.finish(false));
    const create = new ButtonComponent(actions)
      .setButtonText("Create")
      .setCta()
      .onClick(() => this.finish(true));
    window.setTimeout(() => create.buttonEl.focus(), 0);
  }

  override onClose(): void {
    this.contentEl.empty();
    if (this.settled) return;
    this.settled = true;
    this.resolve(false);
  }

  private finish(confirmed: boolean): void {
    if (this.settled) return;
    this.settled = true;
    this.resolve(confirmed);
    this.close();
  }
}

export function confirmDailyNoteCreation(
  app: App,
  date: PlainDate,
  path: string,
  locale: string
): Promise<boolean> {
  return new Promise((resolve) => {
    new CreateDailyNoteModal(app, date, path, locale, resolve).open();
  });
}
