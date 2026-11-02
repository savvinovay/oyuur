// Android: the widgets' background handler and the tree picker, registered when the app's JS loads
// (index.ts). The handler is light (react-native-android-widget #165): it reads the ready snapshot and
// draws — no network, no heavy work.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerWidgetConfigurationScreen, registerWidgetTaskHandler } from 'react-native-android-widget';
import { composeWidget, configKey, parseConfig } from './compose';
import { WidgetConfigScreen } from './ConfigScreen';
import { representation } from './render';
import { parseSnapshot, SNAPSHOT_KEY } from './snapshot';

registerWidgetTaskHandler(async ({ widgetInfo, widgetAction, renderWidget }) => {
  try {
    if (widgetAction === 'WIDGET_DELETED') {
      await AsyncStorage.removeItem(configKey(widgetInfo.widgetId));
      return;
    }
    // Taps open the app by their link (OPEN_URI) without coming here.
    if (widgetAction === 'WIDGET_CLICK') return;
    const [snap, config] = await Promise.all([AsyncStorage.getItem(SNAPSHOT_KEY), AsyncStorage.getItem(configKey(widgetInfo.widgetId))]);
    renderWidget(representation(composeWidget(widgetInfo.widgetName, parseSnapshot(snap), parseConfig(config), widgetInfo.width, widgetInfo.height, new Date())));
  } catch (error) {
    console.warn('Oyuur widget could not draw', error);
  }
});

registerWidgetConfigurationScreen(WidgetConfigScreen);
