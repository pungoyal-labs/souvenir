import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { InviteForm } from "@/components/invite-form";
import { isFounder, listInvites, listMembers, netOf } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { requireMember } from "@/lib/session";
import { fmtUnits } from "@/lib/units";

export default async function MembersPage() {
  const me = await requireMember();
  const all = await listMembers();
  const invites = await listInvites();
  const balances = await Promise.all(all.map((m) => netOf(m.id)));
  const joinedEmails = new Set(all.map((m) => m.email));
  const pending = invites.filter((i) => !joinedEmails.has(i.email));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="display text-4xl font-extrabold uppercase tracking-wide">The group</h1>
      <p className="mt-1 text-sm text-soft">One private table. Everyone sees everything.</p>

      <ul className="mt-5 divide-y divide-line rounded-lg border border-line bg-surface">
        {all.map((m, i) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={m.name} image={m.image} size={34} />
            <div className="min-w-0">
              <Link href={`/member/${m.id}`} className="font-semibold hover:underline">
                {m.name}
                {m.id === me.id && <span className="font-normal text-soft"> (you)</span>}
              </Link>
              <p className="truncate text-xs text-soft">
                {m.email} · joined {fmtDate(m.joinedAt)}
              </p>
            </div>
            <span className="mono ml-auto font-bold">{fmtUnits(balances[i], { sign: true })}u</span>
          </li>
        ))}
      </ul>

      {pending.length > 0 && (
        <section className="mt-6">
          <h2 className="display text-lg font-bold uppercase tracking-wide text-soft">
            Invited, not yet in
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-soft">
            {pending.map((i) => (
              <li key={i.email}>{i.email}</li>
            ))}
          </ul>
        </section>
      )}

      {isFounder(me) && (
        <section className="mt-6">
          <h2 className="display text-lg font-bold uppercase tracking-wide text-soft">
            Invite a friend
          </h2>
          <p className="text-xs text-soft">
            They sign in with the Google account for this email and start betting straight away.
          </p>
          <div className="mt-2">
            <InviteForm />
          </div>
        </section>
      )}
    </div>
  );
}
