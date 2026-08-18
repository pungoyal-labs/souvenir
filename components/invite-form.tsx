"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { inviteAction } from "@/app/actions";

export function InviteForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = () =>
    startTransition(async () => {
      setMessage(null);
      const res = await inviteAction(email);
      if (!res.ok) {
        setMessage({ ok: false, text: res.error ?? "Couldn't invite." });
      } else {
        setMessage({ ok: true, text: `${email.trim()} can now sign in.` });
        setEmail("");
        router.refresh();
      }
    });

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="friend@gmail.com"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={pending || !email.trim()}
          onClick={submit}
          className="rounded-md bg-felt px-4 py-2 text-sm font-semibold text-white hover:bg-felt-deep disabled:opacity-40"
        >
          {pending ? "Inviting…" : "Invite"}
        </button>
      </div>
      {message && (
        <p className={`mt-2 text-sm font-semibold ${message.ok ? "text-felt" : "text-no-deep"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
