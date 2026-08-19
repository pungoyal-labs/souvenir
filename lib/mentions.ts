// Mention parsing for comments: "@" followed by a member's full name or first
// name, case-insensitive, longest match wins. Mentions are resolved against
// the member list at write time and stored as comment_mentions rows (like
// bill_entries snapshot their split), so a later rename never rewrites who
// was tagged. Pure data in, pure data out — lib/data.ts does the I/O.

export interface Mentionable {
  id: string;
  name: string;
}

/** One "@…" occurrence in a body and every member it could mean. */
interface MentionMatch {
  start: number;
  end: number;
  memberIds: string[];
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
}

/** The spellings that summon a member: full name, and first name if shorter. */
function candidatesOf(member: Mentionable): string[] {
  const name = member.name.trim();
  if (!name) return [];
  const first = name.split(/\s+/)[0];
  return first.length < name.length ? [name, first] : [name];
}

function scan(body: string, members: Mentionable[]): MentionMatch[] {
  const matches: MentionMatch[] = [];
  const lower = body.toLowerCase();
  for (let i = 0; i < body.length; i++) {
    // "@" glued to a word (an email address, mid-token noise) is not a mention.
    if (body[i] !== "@" || isWordChar(body[i - 1])) continue;
    let bestLength = 0;
    let memberIds: string[] = [];
    for (const member of members) {
      for (const candidate of candidatesOf(member)) {
        if (candidate.length < bestLength) continue;
        if (lower.slice(i + 1, i + 1 + candidate.length) !== candidate.toLowerCase()) continue;
        if (isWordChar(body[i + 1 + candidate.length])) continue;
        if (candidate.length > bestLength) {
          bestLength = candidate.length;
          memberIds = [member.id];
        } else if (!memberIds.includes(member.id)) {
          // A shared first name tags everyone it could mean — better a spare
          // notification than a missed one.
          memberIds.push(member.id);
        }
      }
    }
    if (bestLength > 0) {
      matches.push({ start: i, end: i + 1 + bestLength, memberIds });
      i += bestLength;
    }
  }
  return matches;
}

/** Ids of every member the body tags, in order of first appearance. */
export function parseMentions(body: string, members: Mentionable[]): string[] {
  const seen = new Set<string>();
  for (const match of scan(body, members)) {
    for (const id of match.memberIds) seen.add(id);
  }
  return [...seen];
}

export interface BodySegment {
  text: string;
  /** Set when this segment is a mention of that member. */
  memberId?: string;
}

/**
 * Split a body into plain and mention segments for rendering, re-matching
 * only against the members actually stored as tagged on the comment.
 */
export function segmentBody(body: string, mentioned: Mentionable[]): BodySegment[] {
  const segments: BodySegment[] = [];
  let cursor = 0;
  for (const match of scan(body, mentioned)) {
    if (match.start > cursor) segments.push({ text: body.slice(cursor, match.start) });
    segments.push({ text: body.slice(match.start, match.end), memberId: match.memberIds[0] });
    cursor = match.end;
  }
  if (cursor < body.length) segments.push({ text: body.slice(cursor) });
  return segments;
}
