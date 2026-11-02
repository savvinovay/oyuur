// Android: the app saves the widget snapshot and redraws every placed widget at once (спец 5.3, Т3).
// `requestWidgetUpdate` works only while the app runs — enough, every change happens in the app; the
// widgets also redraw themselves every 30 minutes from the saved snapshot.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { composeWidget, configKey, parseConfig, WIDGET_NAMES } from './compose';
import { representation } from './render';
import { SNAPSHOT_KEY, WidgetSnapshot } from './snapshot';

let last = '';

/** `stamp` — what else should redraw an unchanged snapshot (the game day and the hour). */
export function syncWidgets(snap: WidgetSnapshot, stamp = ''): void {
  const raw = JSON.stringify(snap);
  const key = raw + stamp;
  if (key === last) return;
  AsyncStorage.setItem(SNAPSHOT_KEY, raw)
    .then(async () => {
      // Remembered only once saved: a failed save is tried again with the next change or minute.
      last = key;
      for (const name of WIDGET_NAMES) {
        await requestWidgetUpdate({
          widgetName: name,
          // A failure keeps the widget's old picture (a made-up "plant a tree" would lie, спец 1.3) and tries again
          // with the next change; the library doesn't wait for this, so the error is only logged.
          renderWidget: async (info) => {
            try {
              const config = parseConfig(await AsyncStorage.getItem(configKey(info.widgetId)));
              return representation(composeWidget(name, snap, config, info.width, info.height, new Date()));
            } catch (error) {
              console.warn('Oyuur widget could not draw', error);
              last = '';
              throw error;
            }
          },
        });
      }
    })
    .catch((error) => console.warn('Oyuur widgets were not updated', error));
}
