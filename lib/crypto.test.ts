import { describe, expect, it } from "vitest";
import {
  CryptoError,
  deriveKey,
  exportKey,
  fromBase64Url,
  fromUtf8,
  importKey,
  newKey,
  newSecret,
  open,
  openBlob,
  parseEnvelope,
  seal,
  sealBlob,
  toBase64Url,
  unwrapFromLink,
  utf8,
  wrapForLink,
} from "./crypto.ts";

const binding = { tripId: "trip-1", authorId: "member-a", epoch: 0 };

describe("base64url", () => {
  it("round-trips bytes without padding", () => {
    for (const n of [0, 1, 2, 3, 4, 31, 32, 33]) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 37) % 256);
      const text = toBase64Url(bytes);
      expect(text).not.toMatch(/[+/=]/);
      expect(fromBase64Url(text)).toEqual(bytes);
    }
  });

  it("refuses characters outside the alphabet", () => {
    expect(() => fromBase64Url("ab+c")).toThrow(CryptoError);
    expect(() => fromBase64Url("ab c")).toThrow(CryptoError);
  });
});

describe("keys", () => {
  it("export and import give the same key", async () => {
    const key = await newKey();
    const raw = await exportKey(key);
    expect(raw.length).toBe(32);
    const again = await importKey(raw);
    const envelope = await seal(key, binding, utf8("hi"));
    expect(fromUtf8(await open(again, binding, envelope))).toBe("hi");
  });

  it("refuses a key that is not 256 bits", async () => {
    await expect(importKey(new Uint8Array(16))).rejects.toThrow(CryptoError);
  });

  it("derives different keys for different purposes from one secret", async () => {
    const secret = newSecret();
    const a = await deriveKey(secret, "one");
    const b = await deriveKey(secret, "two");
    const blob = await sealBlob(a, "x", utf8("secret"));
    await expect(openBlob(b, "x", blob)).rejects.toThrow(CryptoError);
    expect(fromUtf8(await openBlob(a, "x", blob))).toBe("secret");
  });

  it("refuses a short secret", async () => {
    await expect(deriveKey(new Uint8Array(8), "x")).rejects.toThrow(CryptoError);
  });
});

describe("envelopes", () => {
  it("seal then open gives the plaintext back", async () => {
    const key = await newKey();
    const envelope = await seal(key, binding, utf8("who wins the argument"));
    expect(envelope.startsWith("v1.0.")).toBe(true);
    expect(fromUtf8(await open(key, binding, envelope))).toBe("who wins the argument");
  });

  it("never repeats an IV, so the same words seal differently", async () => {
    const key = await newKey();
    const a = await seal(key, binding, utf8("same"));
    const b = await seal(key, binding, utf8("same"));
    expect(a).not.toBe(b);
  });

  it("exposes the epoch to a reader without a key", async () => {
    const key = await newKey();
    const envelope = await seal(key, { ...binding, epoch: 7 }, utf8("x"));
    expect(parseEnvelope(envelope)).toEqual({ version: "v1", epoch: 7 });
  });

  it("refuses to open a row relabelled to another author", async () => {
    const key = await newKey();
    const envelope = await seal(key, binding, utf8("mine"));
    await expect(open(key, { ...binding, authorId: "member-b" }, envelope)).rejects.toThrow(
      CryptoError,
    );
  });

  it("refuses to open a row moved to another trip", async () => {
    const key = await newKey();
    const envelope = await seal(key, binding, utf8("mine"));
    await expect(open(key, { ...binding, tripId: "trip-2" }, envelope)).rejects.toThrow(
      CryptoError,
    );
  });

  it("refuses an epoch that does not match the row", async () => {
    const key = await newKey();
    const envelope = await seal(key, binding, utf8("mine"));
    await expect(open(key, { ...binding, epoch: 1 }, envelope)).rejects.toThrow("epoch mismatch");
  });

  it("refuses the wrong key", async () => {
    const envelope = await seal(await newKey(), binding, utf8("mine"));
    await expect(open(await newKey(), binding, envelope)).rejects.toThrow(CryptoError);
  });

  it("refuses a tampered ciphertext", async () => {
    const key = await newKey();
    const envelope = await seal(key, binding, utf8("mine"));
    const parts = envelope.split(".");
    const ct = parts[3]!;
    const flipped = (ct[0] === "A" ? "B" : "A") + ct.slice(1);
    await expect(
      open(key, binding, [parts[0], parts[1], parts[2], flipped].join(".")),
    ).rejects.toThrow(CryptoError);
  });

  it("refuses shapes that are not envelopes", () => {
    expect(() => parseEnvelope("v1.0.abc")).toThrow(CryptoError);
    expect(() => parseEnvelope("v2.0.a.b")).toThrow(CryptoError);
    expect(() => parseEnvelope("v1.-1.a.b")).toThrow(CryptoError);
    expect(() => parseEnvelope("v1.01.a.b")).toThrow(CryptoError);
    expect(() => parseEnvelope("v1.x.a.b")).toThrow(CryptoError);
  });

  it("refuses to seal with a bad epoch", async () => {
    const key = await newKey();
    await expect(seal(key, { ...binding, epoch: -1 }, utf8("x"))).rejects.toThrow(CryptoError);
    await expect(seal(key, { ...binding, epoch: 1.5 }, utf8("x"))).rejects.toThrow(CryptoError);
  });
});

describe("link wraps", () => {
  it("a secret opens what was wrapped for the same kind of link", async () => {
    const secret = newSecret();
    const raw = await exportKey(await newKey());
    const blob = await wrapForLink(secret, "invite", raw);
    expect(await unwrapFromLink(secret, "invite", blob)).toEqual(raw);
  });

  it("a secret does not open a wrap made for another kind of link", async () => {
    const secret = newSecret();
    const raw = await exportKey(await newKey());
    const blob = await wrapForLink(secret, "invite", raw);
    await expect(unwrapFromLink(secret, "rekey", blob)).rejects.toThrow(CryptoError);
    await expect(unwrapFromLink(secret, "recover", blob)).rejects.toThrow(CryptoError);
  });

  it("another secret does not open it", async () => {
    const raw = await exportKey(await newKey());
    const blob = await wrapForLink(newSecret(), "device", raw);
    await expect(unwrapFromLink(newSecret(), "device", blob)).rejects.toThrow(CryptoError);
  });

  it("refuses a blob with the wrong shape", async () => {
    await expect(unwrapFromLink(newSecret(), "invite", "v1.abc")).rejects.toThrow(CryptoError);
    await expect(unwrapFromLink(newSecret(), "invite", "v1.a.b.c")).rejects.toThrow(CryptoError);
  });
});
