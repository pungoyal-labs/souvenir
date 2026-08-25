"use client";

// The keyring on this phone (docs/private-trips.md §4.1, §4.8.3). IndexedDB
// holds a non-extractable keyring key, the keyring blob sealed under it, and
// one key per passkey used here, derived from the passkey's PRF output — the
// same on every phone that passkey syncs to, so the keyring is backed up under
// each in `keyring_wraps` and restored from there after a sign-in.
//
// Storage can be missing (a private window, Safari after a week away): an
// empty or broken store is a keyless phone, not a crash.

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
import { newKey, newMemberKey } from "@/lib/crypto";
import {
  emptyKeyring,
  encodeKeyring,
  type Keyring,
  mergeKeyrings,
  openKeyring,
  prfKeyringKey,
  sealKeyring,
  tripCryptoKey,
  withMemberKey,
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

// The store and its key, opened once per page: a second concurrent open (dev
// StrictMode) would otherwise mint a second keyring key over the first.
let store: Promise<{ db: IDBDatabase; kk: CryptoKey }> | null = null;
function openStore() {
  store ??= (async () => {
    const db = await openDb();
    let kk = await idbGet<CryptoKey>(db, KK_ID);
    if (!kk) {
      kk = await newKey(false);
      await idbPut(db, KK_ID, kk);
    }
    return { db, kk };
  })();
  return store;
}

// --- passkeys -------------------------------------------------------------------

/** After a ceremony: keep the key this credential's PRF output derives, if it gave one. */
export async function rememberPrf(credential: PublicKeyCredential): Promise<void> {
  const results = credential.getClientExtensionResults() as {
    prf?: { results?: { first?: ArrayBuffer } };
  };
  const prf = results.prf?.results?.first;
  if (!prf) return;
  try {
    const { db } = await openStore();
    await idbPut(db, prfId(credential.id), await prfKeyringKey(new Uint8Array(prf)));
    const ids = (await idbGet<string[]>(db, PRF_IDS)) ?? [];
    if (!ids.includes(credential.id)) await idbPut(db, PRF_IDS, [...ids, credential.id]);
  } catch {
    // No storage: nothing to back up into, and nothing to restore from.
  }
}

type PrfKeys = Map<string, CryptoKey>;

async function prfKeys(db: IDBDatabase): Promise<PrfKeys> {
  const out: PrfKeys = new Map();
  for (const id of (await idbGet<string[]>(db, PRF_IDS)) ?? []) {
    const key = await idbGet<CryptoKey>(db, prfId(id));
    if (key) out.set(id, key);
  }
  return out;
}

const same = (a: Keyring, b: Keyring) => encodeKeyring(a).join() === encodeKeyring(b).join();

/** The keyring sealed under each passkey key, to the server. Best effort. */
async function backUp(kr: Keyring, keys: PrfKeys): Promise<void> {
  for (const [id, key] of keys) {
    try {
      await saveKeyringWrapAction(id, await sealKeyring(key, kr));
    } catch {
      // Offline, or a credential since dropped: the next change tries again.
    }
  }
}

/**
 * Whatever this member's passkeys backed up that this phone can open, merged
 * into what it holds; `stale` is the passkey keys whose backup no longer matches.
 */
async function restore(
  local: Keyring,
  keys: PrfKeys,
): Promise<{ keyring: Keyring; stale: PrfKeys }> {
  let merged = local;
  const opened = new Map<string, Keyring>();
  if (keys.size > 0) {
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
          // Sealed by a passkey key this phone does not derive the same way: not ours.
        }
      }
    } catch {
      // Offline: the local keyring is what there is.
    }
  }
  const stale: PrfKeys = new Map();
  for (const [id, key] of keys) {
    const backup = opened.get(id);
    if (!backup || !same(backup, merged)) stale.set(id, key);
  }
  return { keyring: merged, stale };
}

// --- the context --------------------------------------------------------------

export type KeyringStatus =
  /** Storage is still opening; nothing is known yet. */
  | "loading"
  /** A keyring is open on this phone (it may still hold no key for a given trip). */
  | "ready"
  /** Storage is unavailable here; nothing can be kept between visits. */
  | "unavailable";

export interface KeyringContextValue {
  status: KeyringStatus;
  keyring: Keyring;
  /** Replace the keyring, seal it, persist it, and back it up. */
  update(next: (current: Keyring) => Keyring): Promise<void>;
}

const KeyringContext = createContext<KeyringContextValue | null>(null);

/**
 * `signedIn` gates the server round trips: the actions redirect a signed-out
 * caller to /signin, which from a join or card page would be a bounce.
 */
export function KeyringProvider({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<KeyringStatus>("loading");
  const [keyring, setKeyring] = useState<Keyring>(emptyKeyring);
  const keyringRef = useRef(keyring);
  keyringRef.current = keyring;
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { db, kk } = await openStore();
        let kr = emptyKeyring();
        const blob = await idbGet<string>(db, BLOB_ID);
        if (blob) {
          try {
            kr = await openKeyring(kk, blob);
          } catch {
            // A blob this key cannot open is a keyless phone, not a broken one.
          }
        }
        const keys = await prfKeys(db);
        let { keyring: next, stale } = signedIn
          ? await restore(kr, keys)
          : { keyring: kr, stale: keys };
        // A member key, once: the public half goes into every trip's log with the next hello.
        if (!next.mk) next = withMemberKey(next, (await newMemberKey()).privateKey);
        if (cancelled) return;
        setKeyring(next);
        setStatus("ready");
        if (!same(next, kr)) await idbPut(db, BLOB_ID, await sealKeyring(kk, next));
        if (signedIn && Object.keys(next.trips).length > 0) void backUp(next, stale);
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const update = useCallback(async (next: (current: Keyring) => Keyring) => {
    const kr = next(keyringRef.current);
    setKeyring(kr);
    let db: IDBDatabase;
    let kk: CryptoKey;
    try {
      ({ db, kk } = await openStore());
    } catch {
      return;
    }
    await idbPut(db, BLOB_ID, await sealKeyring(kk, kr));
    if (signedInRef.current) void backUp(kr, await prfKeys(db));
  }, []);

  const value = useMemo<KeyringContextValue>(
    () => ({ status, keyring, update }),
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
    if (status === "loading") return setKey(undefined);
    if (epoch === null) return setKey(null);
    let cancelled = false;
    tripCryptoKey(keyring, tripId, epoch).then((k) => !cancelled && setKey(k));
    return () => {
      cancelled = true;
    };
  }, [status, keyring, tripId, epoch]);
  return key;
}
