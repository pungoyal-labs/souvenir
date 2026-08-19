import { Bills } from "@/components/bills";
import { billsOverview, listMembers } from "@/lib/data";
import { lingoOf } from "@/lib/lingo";
import { requireMember } from "@/lib/session";

export default async function BillsPage() {
  const me = await requireMember();
  const t = lingoOf(me.lingo);
  const [{ bills, balances }, members] = await Promise.all([billsOverview(), listMembers()]);

  return (
    <div className="mx-auto max-w-2xl">
      <p className="eyebrow">Split bills</p>
      <h1 className="display text-4xl font-extrabold uppercase tracking-wide">{t.billsTitle}</h1>
      <p className="mt-1 text-sm text-soft">{t.billsSub}</p>
      <Bills members={members} meId={me.id} lingo={me.lingo} bills={bills} balances={balances} />
    </div>
  );
}
