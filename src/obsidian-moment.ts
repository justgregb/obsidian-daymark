import { moment as rawMoment } from "obsidian";

interface DaymarkMoment {
  date(): number;
  format(format?: string): string;
  isValid(): boolean;
  month(): number;
  year(): number;
}

interface DaymarkMomentFactory {
  (): DaymarkMoment;
  (input: Date | readonly number[]): DaymarkMoment;
  (input: string, format: string, strict: boolean): DaymarkMoment;
  locale(): string;
  localeData(): { firstDayOfWeek(): number };
}

export const daymarkMoment = rawMoment as unknown as DaymarkMomentFactory;
