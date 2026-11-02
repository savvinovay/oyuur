// Feedback of the shop's events (spec 14.1): the shop's names are the cues themselves.
import { Cue, cue } from '@/ui/feedback';

export type ShopCue = Extract<Cue, 'buy' | 'unlock' | 'poor' | 'skinChange' | 'select' | 'tap'>;

export const shopCue = (name: ShopCue): void => cue(name);
