// A drawn widget as plain data: two SVG layers (the scene behind the trees, the signs and the panel in
// front), tree pictures and words, each in dp from the top-left corner. render.tsx turns it into
// react-native-android-widget components; the browser preview (scripts) into HTML. Pure data, no React.

export type Weight = 800 | 900;

export type Layer =
  | { k: 'svg'; svg: string }
  | { k: 'img'; key: string; x: number; y: number; w: number; h: number }
  | {
      k: 'text';
      x: number;
      y: number;
      w: number;
      /** One line per entry. */
      lines: string[];
      size: number;
      /** Line height, dp. */
      lh: number;
      weight: Weight;
      color: string;
      align?: 'left' | 'center' | 'right';
      /** Numbers: tight, tabular (спец 2.0). */
      tight?: boolean;
    }
  /** A place that opens its own link (4×2: each tree; the header). */
  | { k: 'tap'; x: number; y: number; w: number; h: number; uri: string; label: string };

export interface Drawn {
  W: number;
  H: number;
  layers: Layer[];
  /** Where a tap on the widget leads (oyuur://…). */
  uri: string;
  /** For screen readers. */
  label: string;
}

export const FONT: Record<Weight, string> = { 800: 'Nunito_800ExtraBold', 900: 'Nunito_900Black' };
