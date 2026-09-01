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

const IMAGE_MIME_TYPES: Readonly<Record<string, string>> = {
  apng: "image/apng",
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp"
};

function imageExtension(path: string): string {
  const cleanPath = path.split(/[?#]/u, 1)[0] ?? path;
  const separator = cleanPath.lastIndexOf(".");
  return separator < 0 ? "" : cleanPath.slice(separator + 1).toLocaleLowerCase();
}

export function isSupportedImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.has(imageExtension(path));
}

export function imageMimeType(path: string): string {
  return IMAGE_MIME_TYPES[imageExtension(path)] ?? "application/octet-stream";
}

export const isSupportedCoverPath = isSupportedImagePath;
