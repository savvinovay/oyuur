// The browser preview of a drawn widget (design/oyuur-39 snapshots, the picker's live preview on the web
// is not needed): the same layers as on the phone, as absolutely placed HTML. Pure string building.
import { Drawn, FONT } from './layers';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** `picUrl(key)` — where the tree picture lies relative to the page. */
export function toHtml(d: Drawn, picUrl: (key: string) => string): string {
  const parts = d.layers.map((l) => {
    switch (l.k) {
      case 'svg':
        return `<div style="position:absolute;left:0;top:0">${l.svg}</div>`;
      case 'img':
        return `<img src="${picUrl(l.key)}" style="position:absolute;left:${l.x}px;top:${l.y}px;width:${l.w}px;height:${l.h}px">`;
      case 'text':
        return `<div style="position:absolute;left:${l.x}px;top:${l.y}px;width:${l.w}px;font-family:${FONT[l.weight]},Nunito;font-weight:${l.weight};font-size:${l.size}px;line-height:${l.lh}px;color:${l.color};text-align:${l.align ?? 'left'};white-space:pre;${l.tight ? 'letter-spacing:-.5px;font-variant-numeric:tabular-nums;' : ''}">${l.lines.map(esc).join('\n')}</div>`;
      case 'tap':
        return '';
    }
  });
  return `<div class="wg" title="${esc(d.uri)}" style="position:relative;width:${d.W}px;height:${d.H}px;overflow:hidden;border-radius:28px">${parts.join('')}</div>`;
}
