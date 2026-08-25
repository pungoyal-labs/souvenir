import Link from "next/link";
import { redirect } from "next/navigation";
import { TripsList } from "@/components/trips-list";
import { EmptyState } from "@/components/ui";
import { listTrips } from "@/lib/data";
import { lingoOf } from "@/lib/lingo";
import { routes } from "@/lib/routes";
import { requireMember } from "@/lib/session";

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const me = await requireMember();
  const t = lingoOf(me.lingo);
  const { all } = await searchParams;
  const trips = await listTrips(me.id);
  // One trip is no choice — unless they asked for the list.
  if (trips.length === 1 && all == null) redirect(routes.trip(trips[0].trip.id));

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Your trips</p>
          <h1 className="display text-4xl font-extrabold uppercase tracking-wide">
            {t.tripsTitle}
          </h1>
          <p className="mt-1 text-sm text-soft">{t.tripsSub}</p>
        </div>
        <Link
          href={routes.newTrip}
          className="display rounded-md bg-felt px-4 py-2 text-lg font-bold uppercase text-white hover:bg-felt-deep"
        >
          + New trip
        </Link>
      </div>

      {trips.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={t.tripsEmptyTitle} sub={t.tripsEmptySub} />
        </div>
      ) : (
        <TripsList trips={trips} sealedName={t.sealedTripName} />
      )}
    </div>
  );
}
