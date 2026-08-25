// A member's keyring, and the links that carry keys between people.
// See docs/private-trips.md §2–§4.
//
// The keyring is one JSON object per member holding every trip key they have
// ever been handed, by trip and by epoch, plus the secrets of links they
// minted (so the members page can show a link again). It travels as a blob
// under the member's keyring key — to IndexedDB on the phone, and to the
// `keyrings` table, which sees only its size.
//
// A link's secret rides in the URL fragment, which the browser never sends.
// The server stores what the link carries wrapped under that secret, so the
// row is worthless without the link and the link is worthless without a seat.

import {
  CryptoError,
  deriveKey,
  fromBase64Url,
  fromUtf8,
  importKey,
  type LinkPurpose,
  newSecret,
  openBlob,
  sealBlob,
  toBase64Url,
  unwrapFromLink,
  utf8,
  wrapForLink,
} from "./crypto.ts";

export const KEYRING_VERSION = 1;

/** Which purpose a keyring blob is sealed for — never the same as any link's. */
const KEYRING_PURPOSE = "keyring";

export interface Keyring {
  v: typeof KEYRING_VERSION;
  /** tripId → epoch (as a string key) → raw AES key, base64url. */
  trips: Record<string, Record<string, string>>;
  /** invite / rekey / device link code → its secret, base64url. */
  links: Record<string, string>;
  /** The member's long-term key, once Phase 3 gives them one. */
  mk?: JsonWebKey;
}

export class KeyringError extends Error {}

export function emptyKeyring(): Keyring {
  return { v: KEYRING_VERSION, trips: {}, links: {} };
}

/** Everything both keyrings hold. Where both name the same key, the second wins. */
export function mergeKeyrings(a: Keyring, b: Keyring): Keyring {
  const trips: Keyring["trips"] = {};
  for (const kr of [a, b]) {
    for (const [tripId, epochs] of Object.entries(kr.trips)) {
      trips[tripId] = { ...trips[tripId], ...epochs };
    }
  }
  const merged: Keyring = { v: KEYRING_VERSION, trips, links: { ...a.links, ...b.links } };
  const mk = b.mk ?? a.mk;
  if (mk) merged.mk = mk;
  return merged;
}

// --- trip keys ----------------------------------------------------------------

/** A copy of the keyring with one more trip key in it. Never mutates. */
export function withTripKey(kr: Keyring, tripId: string, epoch: number, raw: Uint8Array): Keyring {
  if (!Number.isInteger(epoch) || epoch < 0) throw new KeyringError("bad epoch");
  if (raw.length !== 32) throw new KeyringError("trip key is not 256 bits");
  return {
    ...kr,
    trips: {
      ...kr.trips,
      [tripId]: { ...(kr.trips[tripId] ?? {}), [String(epoch)]: toBase64Url(raw) },
    },
  };
}

export function withoutTrip(kr: Keyring, tripId: string): Keyring {
  const { [tripId]: _dropped, ...trips } = kr.trips;
  return { ...kr, trips };
}

/** The raw key for one epoch of a trip, or null if this keyring never had it. */
export function tripKeyOf(kr: Keyring, tripId: string, epoch: number): Uint8Array | null {
  const raw = kr.trips[tripId]?.[String(epoch)];
  return raw ? fromBase64Url(raw) : null;
}

/** The newest epoch this keyring holds for a trip, or null if none. */
export function latestEpoch(kr: Keyring, tripId: string): number | null {
  const epochs = Object.keys(kr.trips[tripId] ?? {}).map(Number);
  return epochs.length ? Math.max(...epochs) : null;
}

/** True when the keyring can read the trip at the epoch the server says it is on. */
export function holdsKey(kr: Keyring, tripId: string, epoch: number): boolean {
  return tripKeyOf(kr, tripId, epoch) !== null;
}

/** The CryptoKey for an epoch, ready to seal and open. */
export async function tripCryptoKey(kr: Keyring, tripId: string, epoch: number) {
  const raw = tripKeyOf(kr, tripId, epoch);
  return raw ? importKey(raw) : null;
}

// --- link secrets -------------------------------------------------------------

export function withLinkSecret(kr: Keyring, code: string, secret: Uint8Array): Keyring {
  if (secret.length !== 32) throw new KeyringError("link secret is not 256 bits");
  return { ...kr, links: { ...kr.links, [code]: toBase64Url(secret) } };
}

export function withoutLink(kr: Keyring, code: string): Keyring {
  const { [code]: _dropped, ...links } = kr.links;
  return { ...kr, links };
}

export function linkSecretOf(kr: Keyring, code: string): Uint8Array | null {
  const s = kr.links[code];
  return s ? fromBase64Url(s) : null;
}

// --- the blob -----------------------------------------------------------------

/** Validate a parsed keyring: shape only, so a bad blob fails loudly, not later. */
export function parseKeyring(value: unknown): Keyring {
  if (typeof value !== "object" || value === null) throw new KeyringError("not a keyring");
  const kr = value as Record<string, unknown>;
  if (kr.v !== KEYRING_VERSION) throw new KeyringError("unknown keyring version");
  if (!isStringMapOfMaps(kr.trips)) throw new KeyringError("bad trips");
  if (!isStringMap(kr.links)) throw new KeyringError("bad links");
  const out: Keyring = { v: KEYRING_VERSION, trips: kr.trips, links: kr.links };
  if (kr.mk !== undefined) {
    if (typeof kr.mk !== "object" || kr.mk === null) throw new KeyringError("bad mk");
    out.mk = kr.mk as JsonWebKey;
  }
  return out;
}

function isStringMap(v: unknown): v is Record<string, string> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.values(v).every((x) => typeof x === "string")
  );
}

function isStringMapOfMaps(v: unknown): v is Record<string, Record<string, string>> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.values(v).every((inner) => isStringMap(inner))
  );
}

export function encodeKeyring(kr: Keyring): Uint8Array {
  return utf8(JSON.stringify(kr));
}

export function decodeKeyring(bytes: Uint8Array): Keyring {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromUtf8(bytes));
  } catch {
    throw new KeyringError("not a keyring");
  }
  return parseKeyring(parsed);
}

/** The keyring under the keyring key: what goes to IndexedDB and to `keyrings`. */
export function sealKeyring(kk: CryptoKey, kr: Keyring): Promise<string> {
  return sealBlob(kk, KEYRING_PURPOSE, encodeKeyring(kr));
}

export async function openKeyring(kk: CryptoKey, blob: string): Promise<Keyring> {
  return decodeKeyring(await openBlob(kk, KEYRING_PURPOSE, blob));
}

// --- links --------------------------------------------------------------------

/** What a link's fragment holds: a fresh secret, encoded for a URL. */
export function newLinkSecret(): Uint8Array {
  return newSecret();
}

/** `https://…/join/CODE` → `https://…/join/CODE#<secret>`. */
export function linkWithSecret(url: string, secret: Uint8Array): string {
  if (secret.length !== 32) throw new KeyringError("link secret is not 256 bits");
  return `${url}#${toBase64Url(secret)}`;
}

/**
 * The secret out of `location.hash` (with or without its `#`), or null when
 * the link arrived bare — copied without its fragment, or minted before this
 * existed. Null is a keyless seat, not an error.
 */
export function secretFromFragment(hash: string): Uint8Array | null {
  const text = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!text) return null;
  try {
    const bytes = fromBase64Url(text);
    return bytes.length === 32 ? bytes : null;
  } catch (err) {
    if (err instanceof CryptoError) return null;
    throw err;
  }
}

/** A trip key, wrapped for a link of one kind. The column value. */
export async function wrapTripKey(secret: Uint8Array, purpose: LinkPurpose, raw: Uint8Array) {
  if (raw.length !== 32) throw new KeyringError("trip key is not 256 bits");
  return wrapForLink(secret, purpose, raw);
}

export async function unwrapTripKey(secret: Uint8Array, purpose: LinkPurpose, blob: string) {
  const raw = await unwrapFromLink(secret, purpose, blob);
  if (raw.length !== 32) throw new KeyringError("trip key is not 256 bits");
  return raw;
}

/** A whole keyring, wrapped for a device link: how a member's other phone gets everything. */
export function wrapKeyringForDevice(secret: Uint8Array, kr: Keyring): Promise<string> {
  return wrapForLink(secret, "device", encodeKeyring(kr));
}

export async function unwrapKeyringFromDevice(secret: Uint8Array, blob: string) {
  return decodeKeyring(await unwrapFromLink(secret, "device", blob));
}

/** The join page's peek at the table, wrapped for the link that carries it. */
export interface InvitePreview {
  name: string;
  names: string[];
  questions: string[];
}

export function wrapPreview(secret: Uint8Array, preview: InvitePreview): Promise<string> {
  return wrapForLink(secret, "preview", utf8(JSON.stringify(preview)));
}

export async function unwrapPreview(secret: Uint8Array, blob: string): Promise<InvitePreview> {
  const parsed: unknown = JSON.parse(fromUtf8(await unwrapFromLink(secret, "preview", blob)));
  if (typeof parsed !== "object" || parsed === null) throw new KeyringError("bad preview");
  const p = parsed as Record<string, unknown>;
  if (typeof p.name !== "string" || !isStringList(p.names) || !isStringList(p.questions)) {
    throw new KeyringError("bad preview");
  }
  return { name: p.name, names: p.names, questions: p.questions };
}

function isStringList(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

// --- the trip's name ------------------------------------------------------------

/** The name is sealed under the trip key on its own, so a trips list can show it without the log. */
export function sealName(tk: CryptoKey, tripId: string, name: string): Promise<string> {
  return sealBlob(tk, `name:${tripId}`, utf8(name));
}

export async function openName(tk: CryptoKey, tripId: string, blob: string): Promise<string> {
  return fromUtf8(await openBlob(tk, `name:${tripId}`, blob));
}

// --- passkey backup -------------------------------------------------------------

/** What every passkey's PRF is evaluated on; the authenticator's own secret makes the output its own. */
export const PRF_SALT = utf8("chiang-pai keyring v1");

/** The key a passkey's PRF output opens this member's keyring backup with. */
export function prfKeyringKey(prf: Uint8Array): Promise<CryptoKey> {
  return deriveKey(prf, "keyring:prf");
}
