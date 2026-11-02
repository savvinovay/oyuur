'use no memo';
// A drawn widget (draw/layers.ts) as react-native-android-widget components: everything in one frame, each
// layer placed by its margins in dp. Android only. No hooks: the library calls these as plain functions.
import { FlexWidget, ImageWidget, OverlapWidget, SvgWidget, TextWidget, type WidgetRepresentation } from 'react-native-android-widget';
import { Drawn, FONT, Layer } from './draw/layers';
import { TREE_PICS } from './trees.gen';

type Color = `#${string}`;

function LayerView({ l }: { l: Layer }) {
  switch (l.k) {
    case 'svg':
      return <SvgWidget svg={l.svg} style={{ width: 'match_parent', height: 'match_parent' }} />;
    case 'img':
      return (
        <ImageWidget
          image={TREE_PICS[l.key].src}
          imageWidth={l.w}
          imageHeight={l.h}
          style={{ marginLeft: l.x, marginTop: l.y, width: l.w, height: l.h }}
        />
      );
    case 'text':
      return (
        <TextWidget
          text={l.lines.join('\n')}
          maxLines={l.lines.length}
          allowFontScaling={false}
          style={{
            marginLeft: l.x,
            marginTop: l.y,
            width: l.w,
            height: l.lh * l.lines.length,
            fontSize: l.size,
            lineHeight: l.lh,
            fontFamily: FONT[l.weight],
            color: l.color as Color,
            textAlign: l.align ?? 'left',
            ...(l.tight ? { letterSpacing: -0.5 } : {}),
          }}
        />
      );
    case 'tap':
      return (
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: l.uri }}
          accessibilityLabel={l.label}
          style={{ marginLeft: l.x, marginTop: l.y, width: l.w, height: l.h }}
        />
      );
  }
}

export function WidgetView({ d }: { d: Drawn }) {
  return (
    <OverlapWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: d.uri }}
      accessibilityLabel={d.label}
      style={{ width: 'match_parent', height: 'match_parent', borderRadius: 28 }}
    >
      {d.layers.map((l, i) => (
        <LayerView key={i} l={l} />
      ))}
    </OverlapWidget>
  );
}

// Only with a real dark picture: the library builds `dark` whenever the key is there, and null would throw.
export const representation = (r: { light: Drawn; dark: Drawn | null }): WidgetRepresentation =>
  r.dark ? { light: <WidgetView d={r.light} />, dark: <WidgetView d={r.dark} /> } : <WidgetView d={r.light} />;
