import { Bills } from "@/components/bills";
import { Sealed } from "@/components/sealed";
import { lingoOf } from "@/lib/lingo";
import { requireTrip } from "@/lib/session";
import { currencyName, isDomestic, tripCurrencies } from "@/lib/trips";

export default async function BillsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { me, trip } = await requireTrip(tripId);
  const t = lingoOf(me.lingo);
  const currencies = tripCurrencies(trip);

  return (
    <div className="mx-auto max-w-2xl">
      <p className="eyebrow">Split bills</p>
      <h1 className="display text-4xl font-extrabold uppercase tracking-wide">{t.billsTitle}</h1>
      <p className="mt-1 text-sm text-soft">
        {t.billsSub}{" "}
        <span className="text-soft">
          {isDomestic(trip)
            ? `Everything in ${currencyName(currencies[0])}.`
            : `${currencyName(currencies[0])} there, ${currencyName(currencies[1])} at home — each settles on its own.`}
        </span>
      </p>
      <Sealed>
        <Bills currencies={currencies} />
      </Sealed>
    </div>
  );
}
