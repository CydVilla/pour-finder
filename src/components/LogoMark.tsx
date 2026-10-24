/**
 * The app icon (src/app/icon.svg) as an inline mark, so the header carries the
 * same glyph as the home-screen icon and the browser tab rather than an emoji
 * that renders differently on every platform.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <rect width="64" height="64" rx="14" fill="#17130f" />
      <path d="M20 18h20l-2.2 30a4 4 0 0 1-4 3.6h-7.6a4 4 0 0 1-4-3.6z" fill="#f0a202" />
      <path d="M20 18h20l-.5 7H20.5z" fill="#fff8e7" />
      <path d="M41 24h3.5a6.5 6.5 0 0 1 0 13H40l.5-4h3.5a2.5 2.5 0 0 0 0-5H40.7z" fill="#f0a202" />
    </svg>
  );
}
