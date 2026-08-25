import { Sealed } from "@/components/sealed";
import { TripHome } from "@/components/trip-home";
import { requireTrip } from "@/lib/session";
import { placeOf, tripToday } from "@/lib/trips";

export default async function TripHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { tripId } = await params;
  const { trip } = await requireTrip(tripId);
  const { view } = await searchParams;
  return (
    <Sealed>
      <TripHome
        showSettled={view === "settled"}
        starterTrip={{
          name: trip.name,
          destination: trip.destination,
          homeCurrency: trip.homeCurrency,
          foreignCurrency: trip.foreignCurrency,
          startsOn: trip.startsOn,
          endsOn: trip.endsOn,
          place: placeOf(trip),
          today: tripToday(trip),
        }}
      />
    </Sealed>
  );
}
