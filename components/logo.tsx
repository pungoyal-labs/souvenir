/**
 * The Chiang Pai mark: π (the unit) on card-table felt. One crossbar (the
 * pool) splitting into two legs — YES ultramarine and NO burnt orange.
 * Kept in sync with app/icon.svg, the favicon.
 */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Chiang Pai"
      className={className}
    >
      <rect width="64" height="64" rx="14" fill="#143024" />
      <path d="M22 21v29" stroke="#9db9e8" strokeWidth="6.5" strokeLinecap="round" fill="none" />
      <path
        d="M42 21v23q0 6.5 6.5 5.5"
        stroke="#eda06d"
        strokeWidth="6.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M11.5 23q20.5-6.5 41 0"
        stroke="#f1eee4"
        strokeWidth="6.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
