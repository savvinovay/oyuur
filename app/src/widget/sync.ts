// The web and iPhone have no widgets (спец Т8): nothing to save or redraw. Android — sync.android.ts.
import type { WidgetSnapshot } from './snapshot';

export function syncWidgets(_snap: WidgetSnapshot, _stamp = ''): void {}
