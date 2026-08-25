"use client";

// The keyring on this phone. See docs/private-trips.md §4.1 and §4.8.3.
//
// IndexedDB holds the keyring key — non-extractable, so not even this page can
// read its bytes — and the keyring blob sealed under it. It also holds one
// derived key per passkey this phone has used: the passkey's PRF output makes
// the same key on every phone that passkey syncs to, so the keyring is backed
// up under each in `keyring_wraps` and restored from there after a sign-in.
//
// Storage can be missing (a private window, Safari after a week away, a
// browser told to block site data): every read is wrapped, and an empty or
// broken store is a keyless phone, not a crash.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { keyringWrapsAction, saveKeyringWrapAction } from "@/app/actions";
import { newKey } from "@/lib/crypto";
import {
  emptyKeyring,
  encodeKeyring,
  holdsKey,
  type Keyring,
  mergeKeyrings,
  openKeyring,
  prfKeyringKey,
  sealKeyring,
  tripCryptoKey,
} from "@/lib/keys";

const DB_NAME = "chiang-pai-keys";
const STORE = "keys";
const KK_ID = "kk";
const BLOB_ID = "keyring";
const PRF_IDS = "prf";
const prfId = (credentialId: string) => `prf:${credentialId}`;

// --- IndexedDB, the small part of it we need ----------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no storage"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("storage refused"));
    req.onblocked = () => reject(new Error("storage blocked"));
  });
}

function idbGet<T>(db: IDBDatabase, id: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, id: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- passkeys -------------------------------------------------------------------

/** After a ceremony that returned a PRF result: keep the key it derives, for this credential. */
export async function rememberPrf(credentialId: string, prf: ArrayBuffer): Promise<void> {
  try {
    const db = await openDb();
    const key = await prfKeyringKey(new Uint8Array(prf));
    await idbPut(db, prfId(credentialId), key);
    const ids = (await idbGet<string[]>(db, PRF_IDS)) ?? [];
    if (!ids.includes(credentialId)) await idbPut(db, PRF_IDS, [...ids, credentialId]);
  } catch {
    // No storage: nothing to back up into, and nothing to restore from.
  }
}

async function prfKeys(db: IDBDatabase): Promise<Map<string, CryptoKey>> {
  const out = new Map<string, CryptoKey>();
  for (const id of (await idbGet<string[]>(db, PRF_IDS)) ?? []) {
    const key = await idbGet<CryptoKey>(db, prfId(id));
    if (key) out.set(id, key);
  }
  return out;
}

const same = (a: Keyring, b: Keyring) => encodeKeyring(a).join() === encodeKeyring(b).join();

/** The keyring under every passkey key this phone holds, to the server. Best effort. */
async function backUp(db: IDBDatabase, kr: Keyring, skip?: Set<string>): Promise<void> {
  for (const [id, key] of await prfKeys(db)) {
    if (skip?.has(id)) continue;
    try {
      await saveKeyringWrapAction(id, await sealKeyring(key, kr));
    } catch {
      // Offline, or a credential since dropped: the next change tries again.
    }
  }
}

/**
 * Whatever this member's passkeys backed up that this phone can open, merged
 * into what it holds. Returns the merged keyring and which backups already match it.
 */
async function restore(db: IDBDatabase, local: Keyring) {
  const keys = await prfKeys(db);
  if (keys.size === 0) return { keyring: local, current: new Set<string>() };
  let merged = local;
  const opened = new Map<string, Keyring>();
  try {
    const res = await keyringWrapsAction();
    for (const wrap of res.wraps ?? []) {
      const key = keys.get(wrap.credentialId);
      if (!key) continue;
      try {
        const kr = await openKeyring(key, wrap.blob);
        opened.set(wrap.credentialId, kr);
        merged = mergeKeyrings(merged, kr);
      } catch {
        // Sealed by a passkey key this phone does not derive the same way: not ours to open.
      }
    }
  } catch {
    // Offline: the local keyring is what there is.
  }
  const current = new Set([...opened].filter(([, kr]) => same(kr, merged)).map(([id]) => id));
  return { keyring: merged, current };
}

// --- the context --------------------------------------------------------------

export type KeyringStatus =
  /** Still opening storage. Pages show nothing sealed yet. */
  | "loading"
  /** A keyring is open on this phone (it may still hold no key for a given trip). */
  | "ready"
  /** Storage is unavailable here; nothing can be kept between visits. */
  | "unavailable";

export interface KeyringContextValue {
  status: KeyringStatus;
  keyring: Keyring;
  /** Replace the keyring, seal it, persist it, and hand the blob to `onSave` if there is one. */
  update(next: (current: Keyring) => Keyring): Promise<void>;
  /** True when this phone can read the trip at the epoch the server says it is on. */
  holds(tripId: string, epoch: number | null): boolean;
}

const KeyringContext = createContext<KeyringContextValue | null>(null);

export function KeyringProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<KeyringStatus>("loading");
  const [keyring, setKeyring] = useState<Keyring>(emptyKeyring);
  const kkRef = useRef<CryptoKey | null>(null);
  const dbRef = useRef<IDBDatabase | null>(null);
  const keyringRef = useRef(keyring);
  keyringRef.current = keyring;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await openDb();
        let kk = await idbGet<CryptoKey>(db, KK_ID);
        if (!kk) {
          kk = await newKey(false);
          await idbPut(db, KK_ID, kk);
        }
        let kr = emptyKeyring();
        const blob = await idbGet<string>(db, BLOB_ID);
        if (blob) {
          try {
            kr = await openKeyring(kk, blob);
          } catch {
            // A blob this key cannot open is a keyless phone, not a broken one.
            kr = emptyKeyring();
          }
        }
        const restored = await restore(db, kr);
        if (cancelled) return;
        dbRef.current = db;
        kkRef.current = kk;
        setKeyring(restored.keyring);
        setStatus("ready");
        if (!same(restored.keyring, kr))
          await idbPut(db, BLOB_ID, await sealKeyring(kk, restored.keyring));
        if (Object.keys(restored.keyring.trips).length > 0) {
          void backUp(db, restored.keyring, restored.current);
        }
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(async (next: (current: Keyring) => Keyring) => {
    const kr = next(keyringRef.current);
    setKeyring(kr);
    const kk = kkRef.current;
    const db = dbRef.current;
    if (!kk || !db) return;
    await idbPut(db, BLOB_ID, await sealKeyring(kk, kr));
    void backUp(db, kr);
  }, []);

  const value = useMemo<KeyringContextValue>(
    () => ({
      status,
      keyring,
      update,
      holds: (tripId, epoch) => epoch !== null && holdsKey(keyring, tripId, epoch),
    }),
    [status, keyring, update],
  );

  return <KeyringContext.Provider value={value}>{children}</KeyringContext.Provider>;
}

export function useKeyring(): KeyringContextValue {
  const ctx = useContext(KeyringContext);
  if (!ctx) throw new Error("useKeyring needs a KeyringProvider above it");
  return ctx;
}

/**
 * The key for one trip at one epoch: `undefined` while storage is opening,
 * `null` when this phone does not hold it (show *Get the key*), a CryptoKey
 * when it does.
 */
export function useTripKey(tripId: string, epoch: number | null): CryptoKey | null | undefined {
  const { status, keyring } = useKeyring();
  const [key, setKey] = useState<CryptoKey | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    if (status === "loading") {
      setKey(undefined);
      return;
    }
    if (epoch === null) {
      setKey(null);
      return;
    }
    tripCryptoKey(keyring, tripId, epoch).then((k) => {
      if (!cancelled) setKey(k);
    });
    return () => {
      cancelled = true;
    };
  }, [status, keyring, tripId, epoch]);
  return key;
}
