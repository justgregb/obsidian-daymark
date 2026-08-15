import {
  AbstractInputSuggest,
  PluginSettingTab,
  Setting,
  TFolder,
  normalizePath,
  type App
} from "obsidian";
import { calendarWeekdays } from "./calendar-grid";
import {
  isValidObsidianDateFormat,
  previewObsidianDateFormat
} from "./obsidian-date";
import { dateTimeFormatter } from "./intl-cache";
import type DaymarkPlugin from "./main";
import type { WeekStartSetting, Weekday } from "./types";
import { EXPLICIT_WEEK_STARTS } from "./week-start";

export function normalizeJournalFolder(value: string): string {
  return normalizePath(value.trim()).replace(/^\/+|\/+$/gu, "");
}

export function normalizeAdditionalWordFolder(value: string): string {
  return normalizeJournalFolder(value);
}

export function normalizeTemplatePath(value: string): string {
  return normalizePath(value.trim()).replace(/^\/+|\/+$/gu, "");
}

function weekdayName(locale: string, weekday: Weekday, width: "long" | "narrow" = "long"): string {
  const sample = new Date(Date.UTC(2026, 0, 4 + weekday));
  return dateTimeFormatter(locale, { weekday: width, timeZone: "UTC" }).format(sample);
}

function createSettingsSection(
  parent: HTMLElement,
  title: string,
  description: string
): HTMLElement {
  const section = parent.createDiv("daymark-settings-section");
  new Setting(section)
    .setName(title)
    .setHeading()
    .setClass("daymark-settings-section-title");
  section.createEl("p", {
    cls: "setting-item-description daymark-settings-section-description",
    text: description
  });
  return section.createDiv("daymark-settings-card");
}

class VaultFolderSuggest extends AbstractInputSuggest<string> {
  constructor(app: App, input: HTMLInputElement) {
    super(app, input);
    this.limit = 50;
  }

  protected override getSuggestions(query: string): string[] {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return this.app.vault.getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder && file.path.length > 0)
      .map((folder) => folder.path)
      .filter((path) => path.toLocaleLowerCase().includes(normalizedQuery))
      .sort((left, right) => left.localeCompare(right));
  }

  override renderSuggestion(value: string, element: HTMLElement): void {
    element.setText(value);
  }
}

class VaultMarkdownSuggest extends AbstractInputSuggest<string> {
  constructor(app: App, input: HTMLInputElement) {
    super(app, input);
    this.limit = 50;
  }

  protected override getSuggestions(query: string): string[] {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return this.app.vault.getMarkdownFiles()
      .map((file) => file.path)
      .filter((path) => path.toLocaleLowerCase().includes(normalizedQuery))
      .sort((left, right) => left.localeCompare(right));
  }

  override renderSuggestion(value: string, element: HTMLElement): void {
    element.setText(value);
  }
}

export class DaymarkSettingTab extends PluginSettingTab {
  private folderSuggest: VaultFolderSuggest | null = null;
  private additionalWordFolderSuggest: VaultFolderSuggest | null = null;
  private templateSuggest: VaultMarkdownSuggest | null = null;

  constructor(app: App, private readonly plugin: DaymarkPlugin) {
    super(app, plugin);
  }

  override display(): void {
    this.folderSuggest?.close();
    this.folderSuggest = null;
    this.additionalWordFolderSuggest?.close();
    this.additionalWordFolderSuggest = null;
    this.templateSuggest?.close();
    this.templateSuggest = null;

    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("p", {
      cls: "setting-item-description daymark-settings-intro",
      text: "Make Daymark yours. Choose where your daily notes live, how the calendar feels, and whether Tally summarizes them. Everything stays inside this vault."
    });

    const journalSettings = createSettingsSection(
      containerEl,
      "Your daily notes",
      "Connect Daymark to your journal and choose how new daily notes are created."
    );

    new Setting(journalSettings)
      .setName("Daily notes folder")
      .setDesc("The folder that contains your daily notes. Daymark also creates confirmed new notes here.")
      .addText((text) => {
        let pendingValue = this.plugin.settings.journalFolder;
        const commit = (): void => {
          const journalFolder = normalizeJournalFolder(pendingValue);
          if (journalFolder !== this.plugin.settings.journalFolder) {
            void this.plugin.updateSettings({ journalFolder });
          }
        };
        text.setPlaceholder("Journal")
          .setValue(this.plugin.settings.journalFolder)
          .onChange((value) => {
            pendingValue = value;
          });
        text.inputEl.setAttribute("aria-label", "Daily notes folder");
        text.inputEl.addEventListener("blur", commit);
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") text.inputEl.blur();
        });
        this.folderSuggest = new VaultFolderSuggest(this.app, text.inputEl)
          .onSelect((value) => {
            pendingValue = value;
            text.setValue(value);
            void this.plugin.updateSettings({ journalFolder: normalizeJournalFolder(value) });
          });
      });

    new Setting(journalSettings)
      .setName("Daily note template")
      .setDesc("Optional. Use this Markdown file whenever Daymark creates a new daily note.")
      .addText((text) => {
        let pendingValue = this.plugin.settings.templatePath;
        const commit = (): void => {
          const templatePath = normalizeTemplatePath(pendingValue);
          if (templatePath !== this.plugin.settings.templatePath) {
            void this.plugin.updateSettings({ templatePath });
          }
        };
        text.setPlaceholder("Shelf/Templates/Daily Note Template.md")
          .setValue(this.plugin.settings.templatePath)
          .onChange((value) => {
            pendingValue = value;
          });
        text.inputEl.setAttribute("aria-label", "Daily note template");
        text.inputEl.addEventListener("blur", commit);
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") text.inputEl.blur();
        });
        this.templateSuggest = new VaultMarkdownSuggest(this.app, text.inputEl)
          .onSelect((value) => {
            pendingValue = value;
            text.setValue(value);
            void this.plugin.updateSettings({ templatePath: normalizeTemplatePath(value) });
          });
      });

    const formatSetting = new Setting(journalSettings)
      .setName("File date format");
    const description = formatSetting.descEl;
    description.appendText("Choose how dates appear in filenames and folders. See the ");
    description.createEl("a", {
      text: "format guide",
      href: "https://momentjs.com/docs/#/displaying/format/"
    });
    description.appendText(".");
    const preview = description.createDiv("daymark-setting-preview");

    const renderFormatState = (format: string): boolean => {
      const valid = isValidObsidianDateFormat(format);
      formatSetting.descEl.toggleClass("daymark-setting-error", !valid);
      preview.empty();
      preview.appendText(valid ? "Today would be saved as: " : "Add a year, month, and day: ");
      preview.createSpan({
        cls: valid ? "daymark-setting-preview-value" : "daymark-setting-preview-invalid",
        text: format.length > 0 ? previewObsidianDateFormat(format) : "Empty"
      });
      return valid;
    };

    formatSetting.addText((text) => {
      const input = text.inputEl;
      let pendingValue = this.plugin.settings.dateFormat;
      const commit = (): void => {
        const dateFormat = pendingValue.trim();
        if (isValidObsidianDateFormat(dateFormat) && dateFormat !== this.plugin.settings.dateFormat) {
          void this.plugin.updateSettings({ dateFormat });
        }
      };
      text.setPlaceholder("YYYY-MM-DD")
        .setValue(this.plugin.settings.dateFormat)
        .onChange((value) => {
          const dateFormat = value.trim();
          pendingValue = value;
          const valid = renderFormatState(dateFormat);
          input.toggleClass("daymark-setting-invalid", !valid);
          input.setCustomValidity(valid ? "" : "Include a year, month, and day in the format.");
        });
      input.setAttribute("aria-label", "File date format");
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") input.blur();
      });
      renderFormatState(this.plugin.settings.dateFormat);
    });

    const calendarSettings = createSettingsSection(
      containerEl,
      "Calendar",
      "Set up the calendar around the way your week actually works."
    );

    new Setting(calendarSettings)
      .setName("Start week on")
      .setDesc("Choose the first calendar column. Locale default follows Obsidian's language.")
      .addDropdown((dropdown) => {
        const localeFirstDay = this.plugin.resolveLocaleWeekStart();
        dropdown.addOption("locale", `Locale default (${weekdayName(this.plugin.locale, localeFirstDay)})`);
        for (const option of EXPLICIT_WEEK_STARTS) {
          dropdown.addOption(option.value, weekdayName(this.plugin.locale, option.weekday));
        }
        dropdown.setValue(this.plugin.settings.weekStart)
          .onChange((value) => {
            void this.plugin.updateSettings({ weekStart: value as WeekStartSetting }).then(() => this.display());
          });
      });

    const highlights = new Setting(calendarSettings)
      .setName("Shade recurring days")
      .setDesc("Give weekdays such as weekends or days off a quiet background. Daily notes keep their own highlight.")
      .setClass("daymark-highlight-days-setting");
    const highlightControls = highlights.controlEl.createDiv("daymark-weekday-toggles");
    for (const weekday of calendarWeekdays(this.plugin.resolveWeekStart())) {
      const active = this.plugin.settings.highlightedWeekdays.includes(weekday);
      const button = highlightControls.createEl("button", {
        cls: `daymark-weekday-button${active ? " is-active" : ""}`,
        text: weekdayName(this.plugin.locale, weekday, "narrow").toLocaleUpperCase(this.plugin.locale)
      });
      button.setAttr("aria-label", `Highlight ${weekdayName(this.plugin.locale, weekday)}`);
      button.setAttr("aria-pressed", String(active));
      button.setAttr("title", weekdayName(this.plugin.locale, weekday));
      button.addEventListener("click", () => {
        const selected = new Set(this.plugin.settings.highlightedWeekdays);
        const enabled = !selected.has(weekday);
        if (enabled) selected.add(weekday);
        else selected.delete(weekday);
        button.toggleClass("is-active", enabled);
        button.setAttr("aria-pressed", String(enabled));
        void this.plugin.updateSettings({ highlightedWeekdays: [...selected].sort((left, right) => left - right) });
      });
    }

    new Setting(calendarSettings)
      .setName("Show note covers")
      .setDesc("Use the first local image in a daily note as that day's calendar cover.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showCoverPhotos)
          .onChange((value) => {
            void this.plugin.updateSettings({ showCoverPhotos: value });
          });
      });

    new Setting(calendarSettings)
      .setName("Show calendar totals")
      .setDesc("Show daily notes, words, and checked items for the week or month on screen.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showCalendarTotals)
          .onChange((value) => {
            void this.plugin.updateSettings({ showCalendarTotals: value });
          });
      });

    const tallySettings = createSettingsSection(
      containerEl,
      "Tally",
      "See how your journal adds up over a week, month, or year. Tally shows daily notes, words, checked items, and tagged values such as 30 #pushups."
    );

    new Setting(tallySettings)
      .setName("Show Tally")
      .setDesc("Let the calendar unfold into journal totals for the period on screen. A local Markdown report is created only when you save it.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.tallyEnabled)
          .onChange((value) => {
            void this.plugin.updateSettings({ tallyEnabled: value }).then(() => this.display());
          });
      });

    if (this.plugin.settings.tallyEnabled) {
      new Setting(tallySettings)
        .setName("Additional writing folder")
        .setDesc("Optional. Pick one other folder to show its all-time word count below your journal totals. It stays separate and is never added to saved Tally reports.")
        .addText((text) => {
          let pendingValue = this.plugin.settings.additionalWordFolder;
          const commit = (): void => {
            const additionalWordFolder = normalizeAdditionalWordFolder(pendingValue);
            if (additionalWordFolder !== this.plugin.settings.additionalWordFolder) {
              void this.plugin.updateSettings({ additionalWordFolder });
            }
          };
          text.setPlaceholder("Desk/Longform")
            .setValue(this.plugin.settings.additionalWordFolder)
            .onChange((value) => {
              pendingValue = value;
            });
          text.inputEl.setAttribute("aria-label", "Additional writing folder");
          text.inputEl.addEventListener("blur", commit);
          text.inputEl.addEventListener("keydown", (event) => {
            if (event.key === "Enter") text.inputEl.blur();
          });
          this.additionalWordFolderSuggest = new VaultFolderSuggest(this.app, text.inputEl)
            .onSelect((value) => {
              pendingValue = value;
              text.setValue(value);
              void this.plugin.updateSettings({ additionalWordFolder: normalizeAdditionalWordFolder(value) });
            });
        });
    }

  }

  override hide(): void {
    this.folderSuggest?.close();
    this.folderSuggest = null;
    this.additionalWordFolderSuggest?.close();
    this.additionalWordFolderSuggest = null;
    this.templateSuggest?.close();
    this.templateSuggest = null;
  }
}
