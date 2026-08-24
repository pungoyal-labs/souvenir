"use client";

// The keyring on this phone. See docs/private-trips.md §4.1.
//
// Two things live in IndexedDB, and only here: the keyring key — generated
// non-extractable, so not even this page can read its bytes — and the keyring
// blob sealed under it. Everything a page needs (the key for a trip's current
// epoch, whether this phone holds one at all) comes through the context below.
// `onSave`, when a page passes one, is how the blob also reaches the server's
// `keyrings` row in Phase 1; this component never talks to the network itself.
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
import { newKey } from "@/lib/crypto";
import {
  emptyKeyring,
  holdsKey,
  type Keyring,
  openKeyring,
  sealKeyring,
  tripCryptoKey,
} from "@/lib/keys";

const DB_NAME = "chiang-pai-keys";
const STORE = "keys";
const KK_ID = "kk";
const BLOB_ID = "keyring";

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

export function KeyringProvider({
  children,
  onSave,
}: {
  children: React.ReactNode;
  /** Phase 1: the server action that stores the blob in `keyrings`. */
  onSave?: (blob: string) => Promise<void>;
}) {
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
        if (cancelled) return;
        dbRef.current = db;
        kkRef.current = kk;
        setKeyring(kr);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(
    async (next: (current: Keyring) => Keyring) => {
      const kr = next(keyringRef.current);
      setKeyring(kr);
      const kk = kkRef.current;
      const db = dbRef.current;
      if (!kk || !db) return;
      const blob = await sealKeyring(kk, kr);
      await idbPut(db, BLOB_ID, blob);
      if (onSave) await onSave(blob);
    },
    [onSave],
  );

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
