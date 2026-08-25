"use client";

// The trip on this phone (docs/private-trips.md §4.5–§4.6): the layout hands
// in the sealed rows, this opens them with the keyring's key and replays them
// with lib/replay; a write is sealed here, posted, and applied without waiting
// for the next poll. Nothing decrypted leaves except through useTrip().

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ActionResult } from "@/app/actions";
import { open, seal, unwrapFromMember } from "@/lib/crypto";
import type { EventRow } from "@/lib/db/schema";
import { decodeEvent, type EventPayload, encodeEvent, type OpenEvent } from "@/lib/events";
import { type Keyring, memberPublicKey, openName, tripCryptoKey, withTripKey } from "@/lib/keys";
import { type Lingo, lingoOf } from "@/lib/lingo";
import { type ReplayConfig, replayTrip, type TripState } from "@/lib/replay";
import { type Person, peopleOf, type RosterMember } from "@/lib/views";
import { useKeyring, useTripKey } from "./keyring";

const POLL_MS = 15_000;

export interface TripStoreActions {
  append(tripId: string, envelope: string): Promise<ActionResult & { id?: number; at?: Date }>;
  since(tripId: string, afterId: number): Promise<ActionResult & { rows?: EventRow[] }>;
  grant(tripId: string): Promise<ActionResult & { grant?: { id: string; wrapped: string } | null }>;
  takeGrant(id: string): Promise<ActionResult>;
}

export interface TripStoreValue {
  tripId: string;
  epoch: number | null;
  /** The trip's name: `undefined` while the key is loading, `null` when this phone cannot read it. */
  name: string | null | undefined;
  me: RosterMember;
  lingo: string;
  t: Lingo;
  roster: RosterMember[];
  /** The roster plus anyone the log names who has since left. */
  people: Map<string, Person>;
  /** `undefined` while the key is loading; `null` when this phone has no key. */
  state: TripState | null | undefined;
  /** True once every row has been tried. */
  ready: boolean;
  sealed: number;
  /** Rows that would not open on this phone. */
  unreadable: number;
  append(payload: EventPayload): Promise<ActionResult>;
  refresh(): Promise<void>;
  seenAt: Date | null;
  markSeen(): void;
}

const TripStoreContext = createContext<TripStoreValue | null>(null);

/**
 * The key for each epoch a row may carry: the current one as given, earlier
 * ones from what the keyring kept, and the current one again for an epoch it
 * never had (so the row fails to open and is counted, not skipped).
 */
function epochKeys(keyring: Keyring, tripId: string, epoch: number | null, current: CryptoKey) {
  const cache = new Map<number, Promise<CryptoKey>>();
  return (e: number): Promise<CryptoKey> => {
    if (e === epoch) return Promise.resolve(current);
    let key = cache.get(e);
    if (!key) {
      key = tripCryptoKey(keyring, tripId, e).then((k) => k ?? current);
      cache.set(e, key);
    }
    return key;
  };
}

async function openRow(row: EventRow, key: CryptoKey): Promise<OpenEvent> {
  const bytes = await open(
    key,
    { tripId: row.tripId, authorId: row.authorId, epoch: row.epoch },
    row.body,
  );
  return {
    id: row.id,
    at: new Date(row.at),
    authorId: row.authorId,
    epoch: row.epoch,
    payload: decodeEvent(bytes),
  };
}

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function TripStoreProvider({
  tripId,
  epoch,
  nameEnc,
  config,
  me,
  lingo,
  roster,
  initial,
  seenAt: initialSeenAt,
  actions,
  children,
}: {
  tripId: string;
  epoch: number | null;
  nameEnc: string | null;
  config: Omit<ReplayConfig, "tripId">;
  me: RosterMember;
  lingo: string;
  roster: RosterMember[];
  initial: EventRow[];
  seenAt: Date | null;
  actions: TripStoreActions;
  children: React.ReactNode;
}) {
  const key = useTripKey(tripId, epoch);
  const keyring = useKeyring();
  const [rows, setRows] = useState<EventRow[]>(initial);
  // Every row tried so far: the event, or null for one that would not open.
  const [opened, setOpened] = useState<Map<number, OpenEvent | null>>(new Map());
  const [seenAt, setSeenAt] = useState<Date | null>(initialSeenAt);
  const [name, setName] = useState<string | null | undefined>(undefined);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    if (key === undefined) return;
    if (!key || !nameEnc) return setName(null);
    let cancelled = false;
    openName(key, tripId, nameEnc).then(
      (n) => !cancelled && setName(n),
      () => !cancelled && setName(null),
    );
    return () => {
      cancelled = true;
    };
  }, [key, nameEnc, tripId]);

  useEffect(() => {
    if (!key) return;
    const pending = rows.filter((r) => !opened.has(r.id));
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const keyFor = epochKeys(keyring.keyring, tripId, epoch, key);
      const tried = new Map<number, OpenEvent | null>();
      for (const row of pending) {
        try {
          tried.set(row.id, await openRow(row, await keyFor(row.epoch)));
        } catch (err) {
          tried.set(row.id, null);
          console.warn(`event ${row.id} would not open on this phone: ${reason(err)}`);
        }
      }
      if (!cancelled) setOpened((current) => new Map([...current, ...tried]));
    })();
    return () => {
      cancelled = true;
    };
  }, [key, rows, opened, keyring.keyring, tripId, epoch]);

  const refresh = useCallback(async () => {
    const last = rowsRef.current[rowsRef.current.length - 1]?.id ?? 0;
    const res = await actions.since(tripId, last);
    const fresh = res.rows;
    if (!res.ok || !fresh?.length) return;
    setRows((current) => {
      const have = new Set(current.map((r) => r.id));
      const add = fresh.filter((r) => !have.has(r.id));
      return add.length ? [...current, ...add] : current;
    });
  }, [actions, tripId]);

  // Poll while the tab is visible; catch up the moment it becomes visible again.
  useEffect(() => {
    if (!key) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return stop();
      void refresh();
      timer ??= setInterval(() => void refresh(), POLL_MS);
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key, refresh]);

  const append = useCallback(
    async (payload: EventPayload): Promise<ActionResult> => {
      if (!key || epoch === null)
        return { ok: false, error: "This phone has no key for the trip." };
      const envelope = await seal(key, { tripId, authorId: me.id, epoch }, encodeEvent(payload));
      const res = await actions.append(tripId, envelope);
      if (!res.ok || res.id === undefined || res.at === undefined) {
        return { ok: false, error: res.error };
      }
      const row: EventRow = {
        id: res.id,
        at: new Date(res.at),
        tripId,
        authorId: me.id,
        epoch,
        body: envelope,
      };
      setRows((current) => (current.some((r) => r.id === row.id) ? current : [...current, row]));
      void refresh();
      return { ok: true };
    },
    [actions, epoch, key, me.id, refresh, tripId],
  );

  const events = useMemo(
    () =>
      rows
        .map((r) => opened.get(r.id))
        .filter((e): e is OpenEvent => e != null)
        .sort((a, b) => a.id - b.id),
    [rows, opened],
  );

  const state = useMemo<TripState | null | undefined>(
    () => (key ? replayTrip({ tripId, ...config }, events) : key),
    [key, tripId, config, events],
  );

  const people = useMemo(
    () => (state ? peopleOf(roster, state) : new Map<string, Person>(roster.map((m) => [m.id, m]))),
    [roster, state],
  );

  const ready = !!key && rows.every((r) => opened.has(r.id));
  const unreadable = useMemo(() => [...opened.values()].filter((e) => e === null).length, [opened]);
  // The same test <Sealed> makes: a key that opens nothing is the wrong key.
  const readable = !!state && ready && (rows.length === 0 || unreadable < rows.length);

  // A phone that can read says so, once per epoch and with its member key. The
  // ref is set before the post, so a second run (StrictMode) cannot repeat it.
  const helloed = useRef<number | null>(null);
  useEffect(() => {
    if (!readable || !state || epoch === null || helloed.current === epoch) return;
    const hello = state.hellos.get(me.id);
    const mkPub = memberPublicKey(keyring.keyring);
    if (hello && hello.epoch === epoch && (hello.mkPub || !mkPub)) return;
    helloed.current = epoch;
    void append({ t: "member.hello", ...(mkPub ? { mkPub } : {}) });
  }, [readable, state, me.id, append, epoch, keyring.keyring]);

  // The key was rotated and this phone has the one before: the grant wrapped to its member key.
  const granted = useRef<number | null>(null);
  useEffect(() => {
    if (key !== null || epoch === null || keyring.status !== "ready" || granted.current === epoch)
      return;
    const mk = keyring.keyring.mk;
    if (!mk) return;
    granted.current = epoch;
    (async () => {
      const res = await actions.grant(tripId);
      if (!res.ok || !res.grant) return;
      try {
        const raw = await unwrapFromMember(mk, res.grant.wrapped);
        await keyring.update((kr) => withTripKey(kr, tripId, epoch, raw));
        void actions.takeGrant(res.grant.id);
      } catch (err) {
        console.warn(`the key grant would not open: ${reason(err)}`);
      }
    })();
  }, [key, epoch, keyring, actions, tripId]);

  const t = useMemo(() => lingoOf(lingo), [lingo]);
  const markSeen = useCallback(() => setSeenAt(new Date()), []);
  const value = useMemo<TripStoreValue>(
    () => ({
      tripId,
      epoch,
      name,
      me,
      lingo,
      t,
      roster,
      people,
      state,
      ready,
      sealed: rows.length,
      unreadable,
      append,
      refresh,
      seenAt,
      markSeen,
    }),
    [
      tripId,
      epoch,
      name,
      me,
      lingo,
      t,
      roster,
      people,
      state,
      ready,
      rows.length,
      unreadable,
      append,
      refresh,
      seenAt,
      markSeen,
    ],
  );

  return <TripStoreContext.Provider value={value}>{children}</TripStoreContext.Provider>;
}

export function useTrip(): TripStoreValue {
  const ctx = useContext(TripStoreContext);
  if (!ctx) throw new Error("useTrip needs a TripStoreProvider above it");
  return ctx;
}

/** The store under a <Sealed> gate, where the trip is open. */
export function useOpenTrip(): TripStoreValue & { state: TripState } {
  const trip = useTrip();
  if (!trip.state) throw new Error("useOpenTrip needs a <Sealed> gate above it");
  return trip as TripStoreValue & { state: TripState };
}
