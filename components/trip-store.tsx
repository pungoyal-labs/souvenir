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
import { open, seal } from "@/lib/crypto";
import type { EventRow } from "@/lib/db/schema";
import { decodeEvent, type EventPayload, encodeEvent, type OpenEvent } from "@/lib/events";
import { type Lingo, lingoOf } from "@/lib/lingo";
import { type ReplayConfig, replayTrip, type TripState } from "@/lib/replay";
import { type Person, peopleOf, type RosterMember } from "@/lib/views";
import { useTripKey } from "./keyring";

const POLL_MS = 15_000;

export interface TripStoreActions {
  append(tripId: string, envelope: string): Promise<ActionResult & { id?: number; at?: Date }>;
  since(tripId: string, afterId: number): Promise<ActionResult & { rows?: EventRow[] }>;
}

export interface TripStoreValue {
  tripId: string;
  epoch: number | null;
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

export function TripStoreProvider({
  tripId,
  epoch,
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
  const [rows, setRows] = useState<EventRow[]>(initial);
  // Every row tried so far: the event, or null for one that would not open.
  const [opened, setOpened] = useState<Map<number, OpenEvent | null>>(new Map());
  const [seenAt, setSeenAt] = useState<Date | null>(initialSeenAt);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    (async () => {
      const next = new Map(opened);
      let changed = false;
      for (const row of rows) {
        if (next.has(row.id)) continue;
        changed = true;
        try {
          const bytes = await open(
            key,
            { tripId: row.tripId, authorId: row.authorId, epoch: row.epoch },
            row.body,
          );
          next.set(row.id, {
            id: row.id,
            at: new Date(row.at),
            authorId: row.authorId,
            epoch: row.epoch,
            payload: decodeEvent(bytes),
          });
        } catch (err) {
          next.set(row.id, null);
          const reason = err instanceof Error ? err.message : String(err);
          console.warn(`event ${row.id} would not open on this phone: ${reason}`);
        }
      }
      if (!cancelled && changed) setOpened(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [key, rows, opened]);

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

  // A phone that can read says so, once — never under a key that opens nothing.
  const helloed = useRef(false);
  useEffect(() => {
    if (!state || !ready || helloed.current || state.hellos.has(me.id)) return;
    if (rows.length > 0 && unreadable === rows.length) return;
    helloed.current = true;
    void append({ t: "member.hello" });
  }, [state, ready, rows.length, unreadable, me.id, append]);

  const t = useMemo(() => lingoOf(lingo), [lingo]);
  const value = useMemo<TripStoreValue>(
    () => ({
      tripId,
      epoch,
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
      markSeen: () => setSeenAt(new Date()),
    }),
    [
      tripId,
      epoch,
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
