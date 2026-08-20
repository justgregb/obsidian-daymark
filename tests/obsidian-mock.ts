export { default as moment } from "moment";

export class TAbstractFile {
  constructor(readonly path = "") {}
}

export class TFile extends TAbstractFile {
  readonly basename: string;
  readonly extension: string;

  constructor(path = "") {
    super(path);
    const filename = path.slice(path.lastIndexOf("/") + 1);
    const dot = filename.lastIndexOf(".");
    this.basename = dot >= 0 ? filename.slice(0, dot) : filename;
    this.extension = dot >= 0 ? filename.slice(dot + 1) : "";
  }
}

export class TFolder extends TAbstractFile {
  constructor(path = "", readonly children: TAbstractFile[] = []) {
    super(path);
  }
}

export function normalizePath(value: string): string {
  return value.replace(/\\/gu, "/").replace(/\/{2,}/gu, "/");
}
