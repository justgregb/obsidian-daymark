import {
  PluginSettingTab,
  type App,
  type Setting,
  type SettingDefinition,
  type SettingDefinitionItem,
  type TFile
} from "obsidian";
import { calendarWeekdays } from "./calendar-grid";
import {
  formatTagLabel,
  normalizeTallyLabel,
  resolveTallyMetricLabel,
  TALLY_METRICS
} from "./format";
import { dateTimeFormatter } from "./intl-cache";
import type DaymarkPlugin from "./main";
import {
  isValidObsidianDateFormat,
  previewObsidianDateFormat
} from "./obsidian-date";
import type { DaymarkSettings, TallyMetric, WeekStartSetting, Weekday } from "./types";
import { EXPLICIT_WEEK_STARTS } from "./week-start";

export function normalizeJournalFolder(value: string): string {
  return value.trim().replace(/\\/gu, "/").replace(/\/{2,}/gu, "/").replace(/^\/+|\/+$/gu, "");
}

export function normalizeAdditionalWordFolder(value: string): string {
  return normalizeJournalFolder(value);
}

export function normalizeTemplatePath(value: string): string {
  return normalizeJournalFolder(value);
}

function weekdayName(locale: string, weekday: Weekday, width: "long" | "narrow" = "long"): string {
  const sample = new Date(Date.UTC(2026, 0, 4 + weekday));
  return dateTimeFormatter(locale, { weekday: width, timeZone: "UTC" }).format(sample);
}

function commitOnBlurOrEnter(input: HTMLInputElement, commit: () => void): void {
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
  });
}

function weekStartOptions(plugin: DaymarkPlugin): Record<string, string> {
  const localeFirstDay = plugin.resolveLocaleWeekStart();
  const options: Record<string, string> = {
    locale: `Locale default (${weekdayName(plugin.locale, localeFirstDay)})`
  };
  for (const option of EXPLICIT_WEEK_STARTS) {
    options[option.value] = weekdayName(plugin.locale, option.weekday);
  }
  return options;
}

function isWeekStartSetting(value: unknown): value is WeekStartSetting {
  return value === "locale" || EXPLICIT_WEEK_STARTS.some((option) => option.value === value);
}

export class DaymarkSettingTab extends PluginSettingTab {
  private knownTagSignature = "";
  private tagLoad: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(app: App, private readonly plugin: DaymarkPlugin) {
    super(app, plugin);
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    this.ensureChangeSubscription();
    const tallyVisible = (): boolean => this.plugin.settings.tallyEnabled;
    const journalItems: SettingDefinition[] = [
      {
        name: "Daily notes folder",
        desc: "The folder that contains your daily notes. Daymark also creates confirmed new notes here.",
        control: {
          type: "folder",
          key: "journalFolder",
          placeholder: "Journal",
          includeRoot: true
        }
      },
      {
        name: "Daily note template",
        desc: "Optional. Use this Markdown file whenever Daymark creates a new daily note.",
        control: {
          type: "file",
          key: "templatePath",
          placeholder: "Shelf/Templates/Daily Note Template.md",
          filter: (file: TFile) => file.extension.toLocaleLowerCase() === "md"
        }
      },
      {
        name: "File date format",
        desc: "Choose how dates appear in filenames and folders.",
        render: (setting) => this.renderDateFormatSetting(setting)
      }
    ];
    const calendarItems: SettingDefinition[] = [
      {
        name: "Start week on",
        desc: "Choose the first calendar column. Locale default follows Obsidian's language.",
        control: {
          type: "dropdown",
          key: "weekStart",
          defaultValue: "locale",
          options: weekStartOptions(this.plugin)
        }
      },
      {
        name: "Shade recurring days",
        desc: "Give weekdays such as weekends or days off a quiet background. Daily notes keep their own highlight.",
        render: (setting) => this.renderHighlightedWeekdays(setting)
      },
      {
        name: "Show note covers",
        desc: "Use the first local image in a daily note as that day's calendar cover.",
        control: { type: "toggle", key: "showCoverPhotos" }
      },
      {
        name: "Show calendar totals",
        desc: "Show daily notes, words, and checked items for the week or month on screen.",
        control: { type: "toggle", key: "showCalendarTotals" }
      }
    ];
    const tallyItems: SettingDefinition[] = [
      {
        name: "Show Tally",
        desc: "Let the calendar unfold into journal totals for the period on screen. A local Markdown report is created only when you save it.",
        control: { type: "toggle", key: "tallyEnabled" }
      },
      {
        name: "Additional writing folder",
        desc: "Optional. Pick one other folder to show its all-time word count below your journal totals. It stays separate and is never added to saved Tally reports.",
        visible: tallyVisible,
        control: {
          type: "folder",
          key: "additionalWordFolder",
          placeholder: "Desk/Longform",
          includeRoot: false
        }
      },
      {
        name: "Display names",
        desc: "Rename totals in Tally and saved reports. Leave a field blank to keep Daymark's name; your notes and hashtags stay unchanged.",
        visible: tallyVisible,
        render: (setting) => {
          setting.setClass("daymark-tally-labels-heading");
          this.ensureTallyTagsReady();
        }
      },
      {
        name: "Journal totals",
        desc: "The familiar totals shown whenever a period contains daily notes.",
        searchable: false,
        visible: tallyVisible,
        render: (setting) => {
          setting.setClass("daymark-tally-label-group-heading");
        }
      },
      ...TALLY_METRICS.map((metric): SettingDefinition => ({
        name: resolveTallyMetricLabel(metric, {}),
        aliases: ["Tally display name"],
        visible: tallyVisible,
        render: (setting) => this.renderMetricLabelSetting(setting, metric)
      })),
      {
        name: "Hashtag tallies",
        desc: "Found automatically in completed checked lines, such as 30 #pushups.",
        searchable: false,
        visible: tallyVisible,
        render: (setting) => {
          setting.setClass("daymark-tally-label-group-heading");
        }
      }
    ];

    const knownTags = this.plugin.index.isReady ? this.plugin.index.knownTags() : [];
    const known = new Set(knownTags);
    this.knownTagSignature = knownTags.join("\n");
    const tags = [...new Set([...knownTags, ...Object.keys(this.plugin.settings.tallyTagLabels)])]
      .sort((left, right) => left.localeCompare(right));
    if (tags.length === 0) {
      tallyItems.push({
        name: "No Tally hashtags found",
        desc: "Complete an item such as - [x] 5 #running, and its display name will appear here.",
        searchable: false,
        visible: tallyVisible
      });
    } else {
      for (const tag of tags) {
        tallyItems.push({
          name: `#${tag}`,
          desc: known.has(tag) ? undefined : "Not currently used in your daily notes.",
          aliases: [formatTagLabel(tag, this.plugin.locale), "Tally display name"],
          visible: tallyVisible,
          render: (setting) => this.renderTagLabelSetting(setting, tag, known.has(tag))
        });
      }
    }

    return [
      {
        name: "Daymark",
        desc: "Make Daymark yours. Choose where your daily notes live, how the calendar feels, and whether Tally summarizes them. Everything stays inside this vault.",
        searchable: false,
        render: (setting) => {
          setting.setClass("daymark-settings-intro");
        }
      },
      {
        type: "group",
        heading: "Your daily notes",
        cls: "daymark-settings-section",
        items: journalItems
      },
      {
        type: "group",
        heading: "Calendar",
        cls: "daymark-settings-section",
        items: calendarItems
      },
      {
        type: "group",
        heading: "Tally",
        cls: "daymark-settings-section",
        items: tallyItems
      }
    ];
  }

  override getControlValue(key: string): unknown {
    switch (key) {
      case "journalFolder": return this.plugin.settings.journalFolder;
      case "templatePath": return this.plugin.settings.templatePath;
      case "weekStart": return this.plugin.settings.weekStart;
      case "showCoverPhotos": return this.plugin.settings.showCoverPhotos;
      case "showCalendarTotals": return this.plugin.settings.showCalendarTotals;
      case "tallyEnabled": return this.plugin.settings.tallyEnabled;
      case "additionalWordFolder": return this.plugin.settings.additionalWordFolder;
      default: return undefined;
    }
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    let update: Partial<DaymarkSettings> | null = null;
    switch (key) {
      case "journalFolder":
        if (typeof value === "string") update = { journalFolder: normalizeJournalFolder(value) };
        break;
      case "templatePath":
        if (typeof value === "string") update = { templatePath: normalizeTemplatePath(value) };
        break;
      case "weekStart":
        if (isWeekStartSetting(value)) update = { weekStart: value };
        break;
      case "showCoverPhotos":
        if (typeof value === "boolean") update = { showCoverPhotos: value };
        break;
      case "showCalendarTotals":
        if (typeof value === "boolean") update = { showCalendarTotals: value };
        break;
      case "tallyEnabled":
        if (typeof value === "boolean") update = { tallyEnabled: value };
        break;
      case "additionalWordFolder":
        if (typeof value === "string") update = { additionalWordFolder: normalizeAdditionalWordFolder(value) };
        break;
    }
    if (!update) return;
    await this.plugin.updateSettings(update);
    if (key === "weekStart" || key === "tallyEnabled") this.update();
    else this.refreshDomState();
  }

  private renderDateFormatSetting(setting: Setting): void {
    setting.setName("File date format");
    const description = createFragment((fragment) => {
      fragment.appendText("Choose how dates appear in filenames and folders. See the ");
      fragment.createEl("a", {
        text: "format guide",
        href: "https://momentjs.com/docs/#/displaying/format/"
      });
      fragment.appendText(".");
    });
    setting.setDesc(description);
    const preview = setting.descEl.createDiv("daymark-setting-preview");
    const renderState = (format: string): boolean => {
      const valid = isValidObsidianDateFormat(format);
      setting.descEl.toggleClass("daymark-setting-error", !valid);
      preview.empty();
      preview.appendText(valid ? "Today would be saved as: " : "Add a year, month, and day: ");
      preview.createSpan({
        cls: valid ? "daymark-setting-preview-value" : "daymark-setting-preview-invalid",
        text: format.length > 0 ? previewObsidianDateFormat(format) : "Empty"
      });
      return valid;
    };
    setting.addText((text) => {
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
          const valid = renderState(dateFormat);
          input.toggleClass("daymark-setting-invalid", !valid);
          input.setCustomValidity(valid ? "" : "Include a year, month, and day in the format.");
        });
      input.setAttribute("aria-label", "File date format");
      commitOnBlurOrEnter(input, commit);
      renderState(this.plugin.settings.dateFormat);
    });
  }

  private renderHighlightedWeekdays(setting: Setting): void {
    setting.setClass("daymark-highlight-days-setting");
    const controls = setting.controlEl.createDiv("daymark-weekday-toggles");
    for (const weekday of calendarWeekdays(this.plugin.resolveWeekStart())) {
      const active = this.plugin.settings.highlightedWeekdays.includes(weekday);
      const name = weekdayName(this.plugin.locale, weekday);
      const button = controls.createEl("button", {
        cls: `daymark-weekday-button${active ? " is-active" : ""}`,
        text: weekdayName(this.plugin.locale, weekday, "narrow").toLocaleUpperCase(this.plugin.locale)
      });
      button.setAttr("aria-label", `Highlight ${name}`);
      button.setAttr("aria-pressed", String(active));
      button.setAttr("title", name);
      button.addEventListener("click", () => {
        const selected = new Set(this.plugin.settings.highlightedWeekdays);
        if (selected.has(weekday)) selected.delete(weekday);
        else selected.add(weekday);
        void this.plugin.updateSettings({
          highlightedWeekdays: [...selected].sort((left, right) => left - right)
        }).then(() => this.update());
      });
    }
  }

  private renderMetricLabelSetting(setting: Setting, metric: TallyMetric): void {
    const fallback = resolveTallyMetricLabel(metric, {});
    const current = this.plugin.settings.tallyMetricLabels[metric] ?? "";
    setting.setClass("daymark-tally-label-core-row");
    this.addDisplayNameInput(setting, current, fallback, `Display label for ${fallback}`, async (label) => {
      const tallyMetricLabels = { ...this.plugin.settings.tallyMetricLabels };
      if (label.length > 0) tallyMetricLabels[metric] = label;
      else delete tallyMetricLabels[metric];
      await this.plugin.updateSettings({ tallyMetricLabels });
    });
  }

  private renderTagLabelSetting(setting: Setting, tag: string, known: boolean): void {
    const current = this.plugin.settings.tallyTagLabels[tag] ?? "";
    setting.setClass("daymark-tally-label-row");
    this.addDisplayNameInput(
      setting,
      current,
      formatTagLabel(tag, this.plugin.locale),
      `Display label for #${tag}`,
      async (label) => {
        const tallyTagLabels = { ...this.plugin.settings.tallyTagLabels };
        if (label.length > 0) tallyTagLabels[tag] = label;
        else delete tallyTagLabels[tag];
        await this.plugin.updateSettings({ tallyTagLabels });
        if (!known && label.length === 0) this.update();
      }
    );
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

  private ensureChangeSubscription(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.plugin.subscribe(() => {
      if (!this.plugin.index.isReady) return;
      const signature = this.plugin.index.knownTags().join("\n");
      if (signature === this.knownTagSignature) return;
      this.knownTagSignature = signature;
      this.update();
    });
  }

  private ensureTallyTagsReady(): void {
    if (this.plugin.index.isReady || this.tagLoad) return;
    this.tagLoad = this.plugin.index.ensureReady()
      .then(() => {
        this.knownTagSignature = this.plugin.index.knownTags().join("\n");
        this.update();
      })
      .catch((error: unknown) => {
        console.error("Daymark could not find Tally hashtags.", error);
      })
      .finally(() => {
        this.tagLoad = null;
      });
  }

  override hide(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.knownTagSignature = "";
  }
}
