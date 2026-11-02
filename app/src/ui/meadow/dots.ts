// Which habit dots fit on top of the main screen (see HabitDots).

/** Touch area of one dot: 44 px wide while the row has room, never under 20. */
const SLOT_MAX = 44;
const SLOT_MIN = 20;
/** At most this many dots are shown at once. */
const MAX_VISIBLE = 7;

/** Which dots are shown, how wide each one's touch area is, and how big each dot is. */
export function dotWindow(count: number, active: number, width: number) {
  const visible = Math.max(1, Math.min(count, MAX_VISIBLE, Math.floor(width / SLOT_MIN)));
  const slot = Math.min(SLOT_MAX, Math.floor(width / visible));
  const start = Math.min(Math.max(active - Math.floor(visible / 2), 0), count - visible);
  const end = start + visible;
  const size = (i: number) => {
    // The outermost dot on a side that hides more habits is small, the next one smaller than full.
    if (start > 0 && i === start) return 0.5;
    if (end < count && i === end - 1) return 0.5;
    if (start > 0 && i === start + 1 && visible > 4) return 0.75;
    if (end < count && i === end - 2 && visible > 4) return 0.75;
    return 1;
  };
  return { start, end, slot, size };
}
