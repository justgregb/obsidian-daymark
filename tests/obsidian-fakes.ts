import { TFile, TFolder, type TAbstractFile } from "obsidian";

export function fakeFile(path: string): TFile {
  const file = new TFile();
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const dot = filename.lastIndexOf(".");
  Object.assign(file, {
    path,
    basename: dot >= 0 ? filename.slice(0, dot) : filename,
    extension: dot >= 0 ? filename.slice(dot + 1) : ""
  });
  return file;
}

export function fakeFolder(path: string, children: TAbstractFile[] = []): TFolder {
  const folder = new TFolder();
  Object.assign(folder, { path, children });
  return folder;
}
