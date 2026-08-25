import { MarketPage } from "@/components/market-page";
import { Sealed } from "@/components/sealed";
import { publishedCards } from "@/lib/data";
import { requireTrip } from "@/lib/session";

export default async function PredictionPage({
  params,
}: {
  params: Promise<{ tripId: string; id: string }>;
}) {
  const { tripId, id } = await params;
  const { trip } = await requireTrip(tripId);
  const published = await publishedCards(tripId);
  return (
    <Sealed>
      <MarketPage
        marketId={id}
        maxStakePies={trip.maxStakePies}
        tripName={trip.name}
        published={published.has(id)}
      />
    </Sealed>
  );
}
