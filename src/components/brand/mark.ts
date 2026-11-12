/**
 * Yala-Gam3ya mark — "The Circle" (اللمّة): family and friends around one
 * shared pot; the one in green is whose turn it is. Drawn on a 48×48 grid.
 * Static markup (no user input), shared by the header logo, favicon and
 * home-screen icons.
 */
export const MARK_NAVY = "#0f172a";

export const MARK_SHAPES = '<circle cx="24" cy="24" r="6" fill="#10b981"/><circle cx="24" cy="24" r="3.6" fill="none" stroke="#0f172a" stroke-width="1.2"/><path d="M27.6 12.4A3.6 3.6 0 0 0 20.4 12.4Z" fill="#10b981"/><circle cx="24" cy="6" r="2.6" fill="#10b981"/><path d="M35.85 21.32A3.6 3.6 0 0 0 32.25 15.08Z" fill="#d1fae5"/><circle cx="39.59" cy="15" r="2.6" fill="#d1fae5"/><path d="M32.25 32.92A3.6 3.6 0 0 0 35.85 26.68Z" fill="#d1fae5"/><circle cx="39.59" cy="33" r="2.6" fill="#d1fae5"/><path d="M20.4 35.6A3.6 3.6 0 0 0 27.6 35.6Z" fill="#d1fae5"/><circle cx="24" cy="42" r="2.6" fill="#d1fae5"/><path d="M12.15 26.68A3.6 3.6 0 0 0 15.75 32.92Z" fill="#d1fae5"/><circle cx="8.41" cy="33" r="2.6" fill="#d1fae5"/><path d="M15.75 15.08A3.6 3.6 0 0 0 12.15 21.32Z" fill="#d1fae5"/><circle cx="8.41" cy="15" r="2.6" fill="#d1fae5"/>';

/** Full standalone SVG (for icons). `rounded` = rounded-square tile; iOS masks its own corners, so it gets a square one. */
export function markSvg({ rounded = true }: { rounded?: boolean } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48"${rounded ? ' rx="12"' : ""} fill="${MARK_NAVY}"/>${MARK_SHAPES}</svg>`;
}
