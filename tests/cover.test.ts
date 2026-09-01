import { describe, expect, it } from "vitest";
import { imageMimeType, isSupportedCoverPath } from "../src/cover";

describe("daily-note covers", () => {
  it("accepts common local image formats case-insensitively", () => {
    expect(isSupportedCoverPath("Shelf/Attachments/day.jpg")).toBe(true);
    expect(isSupportedCoverPath("Shelf/Attachments/day.WEBP")).toBe(true);
    expect(isSupportedCoverPath("Shelf/Attachments/day.heic")).toBe(true);
  });

  it("rejects non-image attachments and extensionless paths", () => {
    expect(isSupportedCoverPath("Shelf/Attachments/day.pdf")).toBe(false);
    expect(isSupportedCoverPath("Shelf/Attachments/day")).toBe(false);
  });

  it("provides decoder-friendly MIME types", () => {
    expect(imageMimeType("Shelf/Attachments/day.JPG")).toBe("image/jpeg");
    expect(imageMimeType("Shelf/Attachments/day.svg")).toBe("image/svg+xml");
    expect(imageMimeType("Shelf/Attachments/day.unknown")).toBe("application/octet-stream");
  });
});
