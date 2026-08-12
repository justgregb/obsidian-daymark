export { default as moment } from "moment";

export function normalizePath(value: string): string {
  return value.replace(/\\/gu, "/").replace(/\/{2,}/gu, "/");
}
