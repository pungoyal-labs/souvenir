// Gmail ignores dots in the local part: j.doe@gmail.com and jdoe@gmail.com
// are the same mailbox and the same Google account, which returns exactly one
// spelling in its ID token. Everything that keys off an address — the members
// table, a Google sign-in — stores and looks up this canonical form, so an
// address typed either way matches the account that signs in. Plus-tags are
// deliberately left alone: they are routing, not identity,
// and a member who signs in with one is a different Google account.

const DOTLESS_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/** Lowercase, trim, and drop the dots Gmail ignores. */
export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!DOTLESS_DOMAINS.has(domain)) return email;
  return `${local.replaceAll(".", "")}@${domain}`;
}
