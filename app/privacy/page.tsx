import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";

export const metadata: Metadata = { title: "Privacy" };

// Drafted against the DPDP Act 2023 (India) and the GDPR; a lawyer reads it before scale.
export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl">
      <p className="eyebrow">Privacy</p>
      <h1 className="display text-4xl font-extrabold uppercase tracking-wide">
        We cannot read your trip
      </h1>
      <p className="text-sm text-soft">Last updated 25 August 2026.</p>

      <Section title="The promise, precisely">
        A trip is readable only on the phones of the people on it. Every prediction, call, verdict,
        comment, reaction, page view, bill and amount is encrypted on your phone before it is sent,
        under a key the server never holds. What we store is the sealed record: we can order it and
        count it, we cannot read it — and neither can anyone with a copy of our database, a backup,
        or a legal demand for one.
      </Section>

      <Section title="Where the key lives">
        The trip's key is made on the phone that opens the trip. It reaches every other member
        inside the invite link — in the part of the address after <code>#</code>, which a browser
        never sends to any server — and is kept on that phone. A member who changes phones or loses
        one gets the key again from somebody on the trip, over a short-lived link; an organiser can
        confirm who is asking, but cannot hand out a key they do not hold, and we cannot either.
        There is no reset on our side, on purpose.
      </Section>

      <Section title="What we can see">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Your name and the lingo you chose</b> — so your friends know who called what and the
            app can talk to you the way you asked.
          </li>
          <li>
            <b>An email address</b>, only if you sign in with Google. We take the address and your
            name from Google and nothing else — not your picture, not your contacts.
          </li>
          <li>
            <b>Passkeys</b>: a credential id, a public key, and a counter. Nothing that identifies
            your device or its make. The private key never leaves your device.
          </li>
          <li>
            <b>A picture</b>, only if you upload one. Otherwise a monogram is drawn from your
            initials.
          </li>
          <li>
            <b>The shape of a trip</b>: that it exists, its name, destination, dates, currencies and
            cap; who is on it and with what role; and, for each sealed entry, who wrote it, when,
            and how large it is — not what it says.
          </li>
          <li>
            <b>Kept phrases</b>: a line from the interpreter that a member deliberately named and
            saved, with the language it is in. The phrasebook is the one piece of trip content still
            stored readable; sealing it, and the trip's name, is the next release.
          </li>
          <li>
            <b>A verdict card</b>, only when a member taps share on a resolved prediction: their
            phone publishes the question, the outcome, first names and pies as a public page for the
            group chat. Anyone on the trip can take it down.
          </li>
          <li>
            <b>Server logs</b> with request metadata, kept for a short period for security and
            debugging.
          </li>
        </ul>
      </Section>

      <Section title="What we do not keep">
        The interpreter keeps nothing: no audio, no transcript, no turn. A conversation lives in the
        browser tab and ends with it. Speech recognition happens on your device, through your
        browser's own recogniser; translation text is sent to a language-model provider for the
        duration of the request and is not retained by us. We run no third-party analytics, set no
        advertising cookies, and use only the cookies the app needs to sign you in.
      </Section>

      <Section title="The honest caveat">
        The server serves the code that runs on your phone and handles the key. A dishonest release
        could ship code that leaks it; no web app escapes this. Our answer is to make such a release
        detectable rather than ask you to trust us: the client source is being published, and
        releases will be signed so the code you run can be checked against it.
      </Section>

      <Section title="Who can see it">
        Members of a trip who hold its key see everything on that trip. Nobody outside it sees
        anything, with the one exception above: a verdict card a member chose to share. Providers
        who host the database process sealed records on our instructions only; language-model and
        voice providers see the text of a request and nothing that identifies you.
      </Section>

      <Section title="Lawful basis">
        Performing the service you asked for (the game, the bills, the interpreter); your consent
        for anything optional (a picture, a kept phrase, the lingo, a shared card); and our
        legitimate interest in keeping the service secure and the record honest.
      </Section>

      <Section title="How long">
        As long as you have an account. When you delete it, your name, email, picture, passkeys,
        kept phrases and shared cards are removed immediately. Your sealed entries stay in each
        trip's record, attributed to "Departed member", because the record is append-only and
        removing a call would change other members' numbers. That residue carries no identifier —
        and, being sealed, nothing we could read anyway.
      </Section>

      <Section title="Your rights">
        Access, correction, erasure (above), portability, and the right to complain to the Data
        Protection Board of India or your local supervisory authority. You can exercise every one of
        them from your{" "}
        <Link href={routes.account} className="text-felt hover:underline">
          account page
        </Link>{" "}
        or by writing to us; we answer within 30 days. Access to the content of a trip is something
        only its members can give — we hold nothing readable to hand over.
      </Section>

      <Section title="Children">
        The app is for people 18 and over. We do not knowingly hold data about anyone younger, and
        delete an account when we learn otherwise.
      </Section>

      <Section title="Where the data lives">
        On servers we operate, currently in India, with backups in the same region. Language model
        and voice providers may process requests outside India; we send them the text of a request
        and nothing that identifies you.
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="display text-xl font-bold uppercase tracking-wide">{title}</h2>
      <div className="mt-1 text-sm leading-relaxed">{children}</div>
    </section>
  );
}
