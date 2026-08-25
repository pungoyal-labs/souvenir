import { InboxPage } from "@/components/inbox-page";
import { Sealed } from "@/components/sealed";
import { requireTrip } from "@/lib/session";

export default async function InboxRoute({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  await requireTrip(tripId);
  return (
    <Sealed>
      <InboxPage />
    </Sealed>
  );
}
