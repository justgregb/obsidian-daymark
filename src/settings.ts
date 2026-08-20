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
import {
  formatTagLabel,
  normalizeTallyLabel,
  resolveTallyMetricLabel,
  TALLY_METRICS
} from "./format";
import type DaymarkPlugin from "./main";
import type { TallyMetric, WeekStartSetting, Weekday } from "./types";
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

function createTallyLabelGroup(
  parent: HTMLElement,
  title: string,
  description: string
): HTMLElement {
  const group = parent.createDiv("daymark-tally-label-group");
  const heading = group.createDiv("daymark-tally-label-group-heading");
  heading.createDiv({ cls: "daymark-tally-label-group-title", text: title });
  heading.createDiv({ cls: "setting-item-description", text: description });
  return group.createDiv("daymark-tally-label-group-rows");
}

function commitOnBlurOrEnter(input: HTMLInputElement, commit: () => void): void {
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
  });
}

abstract class VaultPathSuggest extends AbstractInputSuggest<string> {
  constructor(app: App, input: HTMLInputElement) {
    super(app, input);
    this.limit = 50;
  }

  protected override getSuggestions(query: string): string[] {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return this.paths()
      .filter((path) => path.toLocaleLowerCase().includes(normalizedQuery))
      .sort((left, right) => left.localeCompare(right));
  }

  override renderSuggestion(value: string, element: HTMLElement): void {
    element.setText(value);
  }

  protected abstract paths(): string[];
}

class VaultFolderSuggest extends VaultPathSuggest {
  protected override paths(): string[] {
    return this.app.vault.getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder && file.path.length > 0)
      .map((folder) => folder.path);
  }
}

class VaultMarkdownSuggest extends VaultPathSuggest {
  protected override paths(): string[] {
    return this.app.vault.getMarkdownFiles()
      .map((file) => file.path);
  }
}

export class DaymarkSettingTab extends PluginSettingTab {
  private folderSuggest: VaultFolderSuggest | null = null;
  private additionalWordFolderSuggest: VaultFolderSuggest | null = null;
  private templateSuggest: VaultMarkdownSuggest | null = null;
  private tallyLabelsContainer: HTMLElement | null = null;
  private knownTagSignature = "";
  private unsubscribe: (() => void) | null = null;

  constructor(app: App, private readonly plugin: DaymarkPlugin) {
    super(app, plugin);
  }

  override display(): void {
    this.ensureChangeSubscription();
    this.folderSuggest?.close();
    this.folderSuggest = null;
    this.additionalWordFolderSuggest?.close();
    this.additionalWordFolderSuggest = null;
    this.templateSuggest?.close();
    this.templateSuggest = null;
    this.tallyLabelsContainer = null;

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
        commitOnBlurOrEnter(text.inputEl, commit);
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
        commitOnBlurOrEnter(text.inputEl, commit);
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
      commitOnBlurOrEnter(input, commit);
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
      const name = weekdayName(this.plugin.locale, weekday);
      const button = highlightControls.createEl("button", {
        cls: `daymark-weekday-button${active ? " is-active" : ""}`,
        text: weekdayName(this.plugin.locale, weekday, "narrow").toLocaleUpperCase(this.plugin.locale)
      });
      button.setAttr("aria-label", `Highlight ${name}`);
      button.setAttr("aria-pressed", String(active));
      button.setAttr("title", name);
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
      .setClass("daymark-setting-toggle")
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
      .setClass("daymark-setting-toggle")
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
      "See how your journal adds up over a week, month, or year. Tally shows daily notes, words, photos, untagged checked items, and tagged values such as 30 #pushups."
    );

    new Setting(tallySettings)
      .setName("Show Tally")
      .setDesc("Let the calendar unfold into journal totals for the period on screen. A local Markdown report is created only when you save it.")
      .setClass("daymark-setting-toggle")
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
          commitOnBlurOrEnter(text.inputEl, commit);
          this.additionalWordFolderSuggest = new VaultFolderSuggest(this.app, text.inputEl)
            .onSelect((value) => {
              pendingValue = value;
              text.setValue(value);
              void this.plugin.updateSettings({ additionalWordFolder: normalizeAdditionalWordFolder(value) });
            });
        });

      const tallyLabels = tallySettings.createDiv("daymark-tally-labels");
      new Setting(tallyLabels)
        .setName("Display names")
        .setDesc("Rename totals in Tally and saved reports. Leave a field blank to keep Daymark's name; your notes and hashtags stay unchanged.")
        .setClass("daymark-tally-labels-heading");
      this.tallyLabelsContainer = tallyLabels.createDiv("daymark-tally-labels-rows");
      this.renderTallyLabels();
    }

  }

  private ensureChangeSubscription(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.plugin.subscribe(() => {
      if (!this.tallyLabelsContainer || !this.plugin.index.isReady) return;
      const signature = this.plugin.index.knownTags().join("\n");
      if (signature === this.knownTagSignature) return;
      this.renderTallyLabels();
    });
  }

  private renderTallyLabels(): void {
    const container = this.tallyLabelsContainer;
    if (!container) return;
    container.empty();
    const coreRows = createTallyLabelGroup(
      container,
      "Journal totals",
      "The familiar totals shown whenever a period contains daily notes."
    );
    for (const metric of TALLY_METRICS) this.createMetricLabelSetting(coreRows, metric);
    const tagRows = createTallyLabelGroup(
      container,
      "Hashtag tallies",
      "Found automatically in completed checked lines, such as 30 #pushups."
    );

    if (!this.plugin.index.isReady) {
      this.knownTagSignature = "";
      tagRows.createEl("p", {
        cls: "setting-item-description daymark-tally-labels-status",
        text: "Finding Tally hashtags…"
      });
      void this.plugin.index.ensureReady().then(() => {
        if (container.isConnected && this.tallyLabelsContainer === container) this.renderTallyLabels();
      }).catch((error: unknown) => {
        console.error("Daymark could not find Tally hashtags.", error);
        if (!container.isConnected || this.tallyLabelsContainer !== container) return;
        tagRows.empty();
        tagRows.createEl("p", {
          cls: "setting-item-description daymark-tally-labels-status",
          text: "Daymark could not read Tally hashtags. Try rebuilding the index."
        });
      });
      return;
    }

    const knownTags = this.plugin.index.knownTags();
    const known = new Set(knownTags);
    this.knownTagSignature = knownTags.join("\n");
    const tags = new Set([...knownTags, ...Object.keys(this.plugin.settings.tallyTagLabels)]);
    const sortedTags = [...tags].sort((left, right) => left.localeCompare(right));
    if (sortedTags.length === 0) {
      tagRows.createEl("p", {
        cls: "setting-item-description daymark-tally-labels-status",
        text: "No Tally hashtags found yet. Complete an item such as - [x] 5 #running, and it will appear here."
      });
      return;
    }

    for (const tag of sortedTags) {
      const currentLabel = this.plugin.settings.tallyTagLabels[tag] ?? "";
      const setting = new Setting(tagRows)
        .setName(`#${tag}`)
        .setClass("daymark-tally-label-row");
      if (!known.has(tag)) setting.setDesc("Not currently used in your daily notes.");
      this.addDisplayNameInput(
        setting,
        currentLabel,
        formatTagLabel(tag, this.plugin.locale),
        `Display label for #${tag}`,
        async (label) => {
          const tallyTagLabels = { ...this.plugin.settings.tallyTagLabels };
          if (label.length > 0) tallyTagLabels[tag] = label;
          else delete tallyTagLabels[tag];
          await this.plugin.updateSettings({ tallyTagLabels });
          if (!known.has(tag) && label.length === 0) this.renderTallyLabels();
        }
      );
    }
  }

  private createMetricLabelSetting(container: HTMLElement, metric: TallyMetric): void {
    const fallback = resolveTallyMetricLabel(metric, {});
    const currentLabel = this.plugin.settings.tallyMetricLabels[metric] ?? "";
    const setting = new Setting(container)
      .setName(fallback)
      .setClass("daymark-tally-label-core-row");
    this.addDisplayNameInput(setting, currentLabel, fallback, `Display label for ${fallback}`, async (label) => {
      const tallyMetricLabels = { ...this.plugin.settings.tallyMetricLabels };
      if (label.length > 0) tallyMetricLabels[metric] = label;
      else delete tallyMetricLabels[metric];
      await this.plugin.updateSettings({ tallyMetricLabels });
    });
  }

  private addDisplayNameInput(
    setting: Setting,
    currentLabel: string,
    fallback: string,
    ariaLabel: string,
    save: (label: string) => Promise<void>
  ): void {
    setting.addText((text) => {
      let pendingValue = currentLabel;
      let savedLabel = currentLabel;
      const commit = (): void => {
        const label = normalizeTallyLabel(pendingValue);
        text.setValue(label);
        if (label === savedLabel) return;
        void save(label).then(() => {
          savedLabel = label;
        });
      };
      text.setPlaceholder(fallback)
        .setValue(currentLabel)
        .onChange((value) => {
          pendingValue = value;
        });
      text.inputEl.maxLength = 80;
      text.inputEl.setAttribute("aria-label", ariaLabel);
      commitOnBlurOrEnter(text.inputEl, commit);
    });
  }

  override hide(): void {
    this.folderSuggest?.close();
    this.folderSuggest = null;
    this.additionalWordFolderSuggest?.close();
    this.additionalWordFolderSuggest = null;
    this.templateSuggest?.close();
    this.templateSuggest = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.tallyLabelsContainer = null;
    this.knownTagSignature = "";
  }
}
