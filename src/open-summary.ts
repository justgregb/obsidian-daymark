export interface OpenableLeaf<T> {
  openFile(file: T, options: { active: boolean }): Promise<void>;
}

export async function openInNewTab<T>(file: T, getTabLeaf: () => OpenableLeaf<T>): Promise<void> {
  await getTabLeaf().openFile(file, { active: true });
}
