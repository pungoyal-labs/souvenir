import { fmtPies, stampsWord } from "@/lib/pies";

/**
 * An amount with the stamp glyph — a tiny perforated frame in the text color,
 * sized to the surrounding font. Screen readers get the word instead.
 */
export function Pies({ c, sign }: { c: number; sign?: boolean }) {
  return (
    <>
      {fmtPies(c, { sign })}
      <svg
        viewBox="0 0 12 12"
        width="0.6em"
        height="0.6em"
        aria-hidden="true"
        className="ml-[0.14em] inline-block align-[-0.02em]"
      >
        <path fill="currentColor" fillRule="evenodd" d="M1 1h10v10H1Z M3.4 3.4v5.2h5.2V3.4Z" />
      </svg>
      <span className="sr-only"> {stampsWord(c)}</span>
    </>
  );
}
