// Uploaded profile pictures: what counts as a valid image, and which picture
// a member shows. Pure — the bytes themselves live in the `avatars` table and
// move through lib/data.ts.

/** Hard cap on stored avatar bytes; the client downscales well below this. */
export const MAX_AVATAR_BYTES = 512 * 1024;

export type AvatarImageType = "image/jpeg" | "image/png" | "image/webp";

/**
 * Identify an image by its magic bytes — the client's claimed MIME type is
 * never trusted, since these bytes are served back to every member's browser.
 */
export function sniffImageType(bytes: Uint8Array): AvatarImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  const ascii = (at: number, text: string) =>
    bytes.length >= at + text.length &&
    [...text].every((ch, i) => bytes[at + i] === ch.charCodeAt(0));
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, "PNG\r\n\x1a\n")) return "image/png";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  return null;
}

/**
 * The picture a member shows: their uploaded avatar when they have one,
 * otherwise whatever Google last sent. `avatarUpdatedAt` doubles as the
 * cache-buster so a re-upload is visible immediately.
 */
export function avatarSrc(member: {
  id: string;
  image: string | null;
  avatarUpdatedAt: Date | null;
}): string | null {
  if (member.avatarUpdatedAt) {
    return `/api/avatar/${member.id}?v=${member.avatarUpdatedAt.getTime()}`;
  }
  return member.image;
}
