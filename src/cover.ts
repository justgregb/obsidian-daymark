const IMAGE_EXTENSIONS = new Set([
  "apng",
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp"
]);

export function isSupportedCoverPath(path: string): boolean {
  const separator = path.lastIndexOf(".");
  if (separator < 0) return false;
  return IMAGE_EXTENSIONS.has(path.slice(separator + 1).toLocaleLowerCase());
}
