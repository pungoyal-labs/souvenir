import { notFound } from "next/navigation";
import { Sealed } from "@/components/sealed";
import { TripSettings } from "@/components/trip-settings";
import { isOrganiser } from "@/lib/data";
import { requireTrip } from "@/lib/session";
import { currencyName, placeOf, tripCurrencies } from "@/lib/trips";

export default async function TripSettingsPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const ctx = await requireTrip(tripId);
  if (!isOrganiser(ctx)) notFound();
  const { trip } = ctx;
  return (
    <div className="mx-auto max-w-2xl">
      <p className="eyebrow">Trip settings</p>
      <Sealed>
        <TripSettings
          trip={{
            id: trip.id,
            destination: trip.destination,
            homeLanguage: trip.homeLanguage,
            homeCurrency: trip.homeCurrency,
            startsOn: trip.startsOn,
            endsOn: trip.endsOn,
            maxStakePies: trip.maxStakePies,
          }}
          sub={`${placeOf(trip)} · ${tripCurrencies(trip).map(currencyName).join(" and ")}. Where a trip goes and what it spends are set when it opens; the rest can change.`}
        />
      </Sealed>
    </div>
  );
}
