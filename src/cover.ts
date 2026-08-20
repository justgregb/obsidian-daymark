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

export function isSupportedImagePath(path: string): boolean {
  const cleanPath = path.split(/[?#]/u, 1)[0] ?? path;
  const separator = cleanPath.lastIndexOf(".");
  if (separator < 0) return false;
  return IMAGE_EXTENSIONS.has(cleanPath.slice(separator + 1).toLocaleLowerCase());
}

export const isSupportedCoverPath = isSupportedImagePath;
