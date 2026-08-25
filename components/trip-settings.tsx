"use client";

import { TripForm } from "./trip-form";
import { useOpenTrip } from "./trip-store";

/** The settings page under the gate: the name is the store's, the rest the server's. */
export function TripSettings({
  trip,
  sub,
}: {
  trip: Omit<Parameters<typeof TripForm>[0]["initial"] & object, "name" | "epoch">;
  sub: string;
}) {
  const { name, epoch, t } = useOpenTrip();
  return (
    <>
      <h1 className="display text-4xl font-extrabold uppercase tracking-wide">
        {name ?? t.sealedTripName}
      </h1>
      <p className="mt-1 text-sm text-soft">{sub}</p>
      <div className="mt-5">
        <TripForm initial={{ ...trip, name: name ?? "", epoch }} />
      </div>
    </>
  );
}
