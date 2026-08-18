import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { InviteForm } from "@/components/invite-form";
import { Pies } from "@/components/pies";
import { isFounder, listInvites, listMembers, netOf } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { lingoOf } from "@/lib/lingo";
import { requireMember } from "@/lib/session";

export default async function MembersPage() {
  const me = await requireMember();
  const t = lingoOf(me.lingo);
  const all = await listMembers();
  const invites = await listInvites();
  const balances = await Promise.all(all.map((m) => netOf(m.id)));
  const joinedEmails = new Set(all.map((m) => m.email));
  const pending = invites.filter((i) => !joinedEmails.has(i.email));

  return (
    <div className="mx-auto max-w-2xl">
      <p className="eyebrow">Members</p>
      <h1 className="display text-4xl font-extrabold uppercase tracking-wide">{t.membersTitle}</h1>
      <p className="mt-1 text-sm text-soft">{t.membersSub}</p>

      <ul className="mt-5 card list">
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
            <span className="mono ml-auto font-bold">
              <Pies c={balances[i]} sign />
            </span>
          </li>
        ))}
      </ul>

      {pending.length > 0 && (
        <section className="mt-6">
          <h2 className="display text-lg font-bold uppercase tracking-wide text-soft">
            Invited, not yet at the table
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
            They sign in with the Google account for this email and can bet straight away.
          </p>
          <div className="mt-2">
            <InviteForm />
          </div>
        </section>
      )}
    </div>
  );
}
