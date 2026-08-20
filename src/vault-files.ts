import { normalizePath, TFile, TFolder, type Vault } from "obsidian";

function normalizedFolderPath(value: string): string {
  return normalizePath(value.trim()).replace(/^\/+|\/+$/gu, "");
}

function collectMarkdownFiles(folder: TFolder, files: TFile[]): void {
  for (const child of folder.children) {
    if (child instanceof TFile) {
      if (child.extension.toLocaleLowerCase() === "md") files.push(child);
    } else if (child instanceof TFolder) {
      collectMarkdownFiles(child, files);
    }
  }
}

export function markdownFilesInFolder(vault: Vault, folderPath: string): TFile[] {
  const normalized = normalizedFolderPath(folderPath);
  const folder = normalized.length > 0 ? vault.getFolderByPath(normalized) : vault.getRoot();
  if (!folder) return [];
  const files: TFile[] = [];
  collectMarkdownFiles(folder, files);
  return files;
}
