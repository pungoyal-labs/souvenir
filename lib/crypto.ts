// The sealing primitives for private trips: what turns a member's words into
// something the server stores but cannot read. See docs/private-trips.md.
//
// WebCrypto only — `globalThis.crypto.subtle` is the same object in every
// target browser and in Node, so this file runs unchanged on a phone and under
// vitest, and there is no library to audit. Three shapes come out of it:
//
//   envelope   v1.<epoch>.<iv>.<ct>   one event on a trip, under the trip key
//   blob       v1.<iv>.<ct>           bytes under any key: a keyring, a wrap
//   link wrap  a blob under a key derived from a link's secret
//
// Everything is AES-256-GCM with a fresh 96-bit IV and additional data that
// names what the ciphertext is *for*. The additional data is what makes a row
// that has been moved or relabelled fail to open instead of quietly reading as
// somebody else's — an envelope carries the trip, the author and the epoch;
// a wrap carries which kind of link it rode in on.

const ALG = "AES-GCM";
const KEY_BITS = 256;
const IV_BYTES = 12;
const SECRET_BYTES = 32;
const VERSION = "v1";

const subtle = globalThis.crypto.subtle;

/** Anything a ciphertext can refuse to do: a tampered row, a wrong key, bad shape. */
export class CryptoError extends Error {}

// --- bytes --------------------------------------------------------------------

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

export function fromUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

/** URL-safe base64 without padding — fits in a fragment, a column, a QR. */
export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new CryptoError("not base64url");
  const b64 = text.replaceAll("-", "+").replaceAll("_", "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  let bin: string;
  try {
    bin = atob(padded);
  } catch {
    throw new CryptoError("not base64url");
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// WebCrypto wants a BufferSource whose buffer is an ArrayBuffer, and a
// Uint8Array over a SharedArrayBuffer (or a subarray) would not do. Copying is
// cheap at these sizes and removes the question.
function buf(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

// --- keys ---------------------------------------------------------------------

/**
 * A fresh AES-256-GCM key. Extractable, because a trip key has to be put into
 * a keyring and a keyring has to be put into a wrap; what keeps it private is
 * that it only ever leaves this process under another key.
 */
export function newKey(extractable = true): Promise<CryptoKey> {
  return subtle.generateKey({ name: ALG, length: KEY_BITS }, extractable, ["encrypt", "decrypt"]);
}

export async function exportKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await subtle.exportKey("raw", key));
}

export function importKey(raw: Uint8Array, extractable = true): Promise<CryptoKey> {
  if (raw.length !== KEY_BITS / 8) return Promise.reject(new CryptoError("key is not 256 bits"));
  return subtle.importKey("raw", buf(raw), { name: ALG }, extractable, ["encrypt", "decrypt"]);
}

/** 256 random bits: a link secret, or the seed of anything else. */
export function newSecret(): Uint8Array {
  return randomBytes(SECRET_BYTES);
}

/**
 * Derive a wrap key from a secret and a purpose. The purpose is what stops a
 * secret minted for one kind of link from opening what another kind carries:
 * HKDF's `info` differs, so the keys differ.
 */
export async function deriveKey(secret: Uint8Array, purpose: string): Promise<CryptoKey> {
  if (secret.length !== SECRET_BYTES) throw new CryptoError("secret is not 256 bits");
  const ikm = await subtle.importKey("raw", buf(secret), "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new ArrayBuffer(0), info: buf(utf8(purpose)) },
    ikm,
    { name: ALG, length: KEY_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

// --- blobs --------------------------------------------------------------------

async function encrypt(key: CryptoKey, aad: string, plain: Uint8Array): Promise<string[]> {
  const iv = randomBytes(IV_BYTES);
  const ct = await subtle.encrypt(
    { name: ALG, iv: buf(iv), additionalData: buf(utf8(aad)) },
    key,
    buf(plain),
  );
  return [toBase64Url(iv), toBase64Url(new Uint8Array(ct))];
}

async function decrypt(key: CryptoKey, aad: string, ivB: string, ctB: string) {
  const iv = fromBase64Url(ivB);
  if (iv.length !== IV_BYTES) throw new CryptoError("bad iv");
  try {
    const plain = await subtle.decrypt(
      { name: ALG, iv: buf(iv), additionalData: buf(utf8(aad)) },
      key,
      buf(fromBase64Url(ctB)),
    );
    return new Uint8Array(plain);
  } catch (err) {
    if (err instanceof CryptoError) throw err;
    throw new CryptoError("would not open");
  }
}

/** Bytes under a key, bound to a purpose. `v1.<iv>.<ct>`. */
export async function sealBlob(key: CryptoKey, purpose: string, plain: Uint8Array) {
  return [VERSION, ...(await encrypt(key, purpose, plain))].join(".");
}

export async function openBlob(key: CryptoKey, purpose: string, blob: string) {
  const parts = blob.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) throw new CryptoError("not a blob");
  return decrypt(key, purpose, parts[1]!, parts[2]!);
}

// --- link wraps ---------------------------------------------------------------

/** Which kind of link a wrap rode in on; the wrong kind will not open it. */
export type LinkPurpose = "invite" | "rekey" | "recover" | "device" | "preview";

export async function wrapForLink(secret: Uint8Array, purpose: LinkPurpose, plain: Uint8Array) {
  return sealBlob(await deriveKey(secret, `link:${purpose}`), purpose, plain);
}

export async function unwrapFromLink(secret: Uint8Array, purpose: LinkPurpose, blob: string) {
  return openBlob(await deriveKey(secret, `link:${purpose}`), purpose, blob);
}

// --- envelopes ----------------------------------------------------------------

/** What an envelope is bound to: the row's own plaintext columns. */
export interface EnvelopeBinding {
  tripId: string;
  authorId: string;
  epoch: number;
}

function bindingAad({ tripId, authorId, epoch }: EnvelopeBinding): string {
  return `${tripId}|${authorId}|${epoch}`;
}

/** The parts of an envelope the server can read: its shape, and which key epoch it needs. */
export interface EnvelopeHeader {
  version: string;
  epoch: number;
}

export function parseEnvelope(envelope: string): EnvelopeHeader {
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new CryptoError("not an envelope");
  const epoch = Number(parts[1]);
  if (!Number.isInteger(epoch) || epoch < 0 || String(epoch) !== parts[1]) {
    throw new CryptoError("bad epoch");
  }
  return { version: parts[0], epoch };
}

/** One event, under the trip key for `binding.epoch`. `v1.<epoch>.<iv>.<ct>`. */
export async function seal(key: CryptoKey, binding: EnvelopeBinding, plain: Uint8Array) {
  if (!Number.isInteger(binding.epoch) || binding.epoch < 0) throw new CryptoError("bad epoch");
  return [VERSION, String(binding.epoch), ...(await encrypt(key, bindingAad(binding), plain))].join(
    ".",
  );
}

/**
 * Open an envelope with the key for the epoch it names. The caller passes the
 * row's trip, author and epoch; if any of them is not what the writer sealed
 * against, the row has been moved and this throws.
 */
export async function open(key: CryptoKey, binding: EnvelopeBinding, envelope: string) {
  const header = parseEnvelope(envelope);
  if (header.epoch !== binding.epoch) throw new CryptoError("epoch mismatch");
  const parts = envelope.split(".");
  return decrypt(key, bindingAad(binding), parts[2]!, parts[3]!);
}
