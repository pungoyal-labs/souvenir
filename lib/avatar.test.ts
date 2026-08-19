import { describe, expect, it } from "vitest";
import { avatarSrc, sniffImageType } from "./avatar.ts";

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = Uint8Array.from([...toBytes("RIFF"), 0x24, 0x00, 0x00, 0x00, ...toBytes("WEBP")]);

function toBytes(text: string): number[] {
  return [...text].map((ch) => ch.charCodeAt(0));
}

describe("sniffImageType", () => {
  it("recognizes jpeg, png, and webp by their magic bytes", () => {
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(WEBP)).toBe("image/webp");
  });

  it("rejects anything else — the claimed MIME type is never consulted", () => {
    expect(sniffImageType(Uint8Array.from(toBytes("GIF89a")))).toBeNull();
    expect(sniffImageType(Uint8Array.from(toBytes("<svg xmlns=")))).toBeNull();
    expect(sniffImageType(Uint8Array.from([]))).toBeNull();
  });

  it("rejects truncated headers rather than reading past the end", () => {
    expect(sniffImageType(JPEG.slice(0, 2))).toBeNull();
    expect(sniffImageType(PNG.slice(0, 4))).toBeNull();
    expect(sniffImageType(WEBP.slice(0, 10))).toBeNull();
  });

  it("requires WEBP after RIFF — other RIFF containers are not images", () => {
    expect(
      sniffImageType(Uint8Array.from([...toBytes("RIFF"), 0, 0, 0, 0, ...toBytes("WAVE")])),
    ).toBeNull();
  });
});

describe("avatarSrc", () => {
  const base = { id: "m1", image: "https://lh3.example/photo.jpg", avatarUpdatedAt: null };

  it("falls back to the Google picture when nothing was uploaded", () => {
    expect(avatarSrc(base)).toBe("https://lh3.example/photo.jpg");
    expect(avatarSrc({ ...base, image: null })).toBeNull();
  });

  it("prefers the uploaded avatar and stamps it for cache-busting", () => {
    const at = new Date("2026-08-19T10:00:00Z");
    expect(avatarSrc({ ...base, avatarUpdatedAt: at })).toBe(`/api/avatar/m1?v=${at.getTime()}`);
  });

  it("changes the URL on re-upload so browsers refetch", () => {
    const first = avatarSrc({ ...base, avatarUpdatedAt: new Date(1_000) });
    const second = avatarSrc({ ...base, avatarUpdatedAt: new Date(2_000) });
    expect(first).not.toBe(second);
  });
});
