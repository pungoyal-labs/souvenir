"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { commentAction } from "@/app/actions";
import type { CommentView } from "@/lib/data";
import type { Member } from "@/lib/db/schema";
import { timeAgo } from "@/lib/format";
import { lingoOf } from "@/lib/lingo";
import { segmentBody } from "@/lib/mentions";
import { Avatar } from "./avatar";

/** The "@pre" the caret is completing, if it's in one. */
function mentionPrefix(text: string, caret: number): { start: number; query: string } | null {
  const match = /(?:^|[^\p{L}\p{N}])(@([\p{L}\p{N}]*))$/u.exec(text.slice(0, caret));
  if (!match) return null;
  return { start: caret - match[1].length, query: match[2] };
}

/**
 * One comment thread plus its composer — the same component under a
 * prediction and inside an expanded bill. Typing @ suggests members; a tagged
 * member finds it in their inbox.
 */
export function CommentsSection({
  target,
  comments,
  members,
  meId,
  lingo,
}: {
  target: { marketId?: string; billId?: string };
  comments: CommentView[];
  members: Member[];
  meId: string;
  lingo: string;
}) {
  const t = lingoOf(lingo);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [caret, setCaret] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [pendingCaret, setPendingCaret] = useState<number | null>(null);

  // Restore focus and caret after a suggestion rewrites the body.
  useEffect(() => {
    if (pendingCaret === null) return;
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(pendingCaret, pendingCaret);
    }
    setPendingCaret(null);
  }, [pendingCaret]);

  const prefix = mentionPrefix(body, caret);
  const suggestions = prefix
    ? members
        .filter((m) =>
          m.name
            .toLowerCase()
            .split(/\s+/)
            .some((word) => word.startsWith(prefix.query.toLowerCase())),
        )
        .slice(0, 5)
    : [];

  const insertMention = (member: Member) => {
    if (!prefix) return;
    const next = `${body.slice(0, prefix.start)}@${member.name} ${body.slice(caret)}`;
    const position = prefix.start + member.name.length + 2;
    setBody(next);
    setCaret(position);
    setPendingCaret(position);
  };

  const post = () =>
    startTransition(async () => {
      setError(null);
      const res = await commentAction(target, body);
      if (!res.ok) setError(res.error ?? t.oops);
      else {
        setBody("");
        setCaret(0);
        router.refresh();
      }
    });

  return (
    <div>
      {comments.length === 0 ? (
        <p className="text-sm text-soft">{t.commentsEmpty}</p>
      ) : (
        <ul className="grid gap-3">
          {comments.map((comment) => (
            <li key={comment.id} className="flex items-start gap-2.5">
              <span className="mt-0.5">
                <Avatar member={comment.author} size={24} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-soft">
                  <span className="font-semibold text-ink">
                    {comment.author.id === meId ? "You" : comment.author.name}
                  </span>{" "}
                  · {timeAgo(comment.at)}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {segmentBody(comment.body, comment.mentions).map((segment, i) =>
                    segment.memberId ? (
                      <span
                        // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional by construction
                        key={i}
                        className={`font-semibold ${
                          segment.memberId === meId ? "text-gold" : "text-felt"
                        }`}
                      >
                        {segment.text}
                      </span>
                    ) : (
                      // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional by construction
                      <Fragment key={i}>{segment.text}</Fragment>
                    ),
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <textarea
          ref={textareaRef}
          value={body}
          rows={2}
          maxLength={1000}
          placeholder={t.commentPlaceholder}
          onChange={(e) => {
            setBody(e.target.value);
            setCaret(e.target.selectionStart);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-felt"
        />
        {suggestions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {suggestions.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => insertMention(member)}
                className="flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-xs font-semibold hover:bg-paper"
              >
                <Avatar member={member} size={16} />
                {member.name}
              </button>
            ))}
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            disabled={pending || body.trim().length === 0}
            onClick={post}
            className="rounded-md border border-line px-3 py-1.5 text-sm font-semibold hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
          >
            Post
          </button>
          {error && <p className="text-sm font-semibold text-no-deep">{error}</p>}
          {pending && <p className="text-sm text-soft">{t.recording}</p>}
        </div>
      </div>
    </div>
  );
}
