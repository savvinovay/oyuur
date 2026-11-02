// How one day card of the strip looks (spec 5.1, frame 24). "Today" is tied to the
// date, not to the status: after watering the status becomes 'done', and the card
// must keep its frame and its "today" label. A calm strip (looking back at a
// locked-in or dead tree) shows missed days quietly, without red.
import { DayKey } from '@/game/dates';
import { dayStatus, DayStatus, OpenHour, Tree } from '@/game/tree';

export type DayFace = 'card' | 'frozen' | 'danger' | 'muted';
export type DayFrame = 'water' | 'accent' | 'gold' | 'stage' | 'wait' | null;
export type DayMark = 'sprout' | 'drop' | 'snowflake' | 'tombstone' | 'close' | 'stageUp' | 'plaque' | 'clock' | null;

export interface DayLook {
  status: DayStatus;
  isToday: boolean;
  face: DayFace;
  frame: DayFrame;
  mark: DayMark;
  /** A day still to come: drawn faded. */
  future: boolean;
  /** Before planting: an empty faded card, only so the strip reaches both edges. */
  blank: boolean;
  /** Today waits for its watering hour (OYUUR-33): the clock and this hour instead of the drop. */
  hour: OpenHour | null;
}

/**
 * `stageDay` — the day the tree reaches its next stage, if it gets its own card. `calm` — no red.
 * `waitHour` — today can't be watered before this hour yet (null — it can).
 */
export function dayLook(tree: Tree, day: DayKey, today: DayKey, stageDay: DayKey | null = null, calm = false, waitHour: OpenHour | null = null): DayLook {
  const status = dayStatus(tree, day, today);
  const isToday = day === today;
  let face: DayFace = 'card';
  let frame: DayFrame = null;
  let mark: DayMark = null;
  switch (status) {
    case 'done': mark = 'sprout'; break;
    case 'frozen': face = 'frozen'; mark = 'snowflake'; break;
    case 'died': face = 'danger'; mark = 'tombstone'; break;
    case 'missed': face = 'danger'; mark = 'close'; break;
    case 'today': mark = 'drop'; break;
    default: break;
  }
  if (isToday && face === 'card') frame = status === 'done' ? 'accent' : status === 'today' ? 'water' : null;
  const hour = isToday && status === 'today' && waitHour !== null ? waitHour : null;
  if (hour !== null) {
    frame = 'wait';
    mark = 'clock';
  }
  const isStageDay = stageDay === day;
  if (isStageDay) {
    mark = 'stageUp';
    if (!isToday) frame = 'stage';
  }
  if (day === tree.completedOn) {
    mark = 'plaque';
    face = 'card';
    frame = 'gold';
  }
  if (calm && face === 'danger') face = 'muted';
  return { status, isToday, face, frame, mark, future: status === 'future' && !isStageDay, blank: status === 'beforePlanting', hour };
}
