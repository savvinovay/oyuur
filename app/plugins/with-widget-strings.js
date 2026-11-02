// Widget names and descriptions in the phone's language (OYUUR-39, design/oyuur-37/спец.md, 7.2 "Список виджетов").
// react-native-android-widget writes the label straight into the manifest and the description as an
// untranslatable string, so the widget list would be English only. This plugin runs after every other mod
// and points both at our own strings, with a Russian copy in values-ru; the list pictures get Russian copies too.
const fs = require('fs');
const path = require('path');
const { withFinalizedMod } = require('expo/config-plugins');

const WIDGETS = {
  Tree: { en: ['Tree', 'Streak of one tree'], ru: ['Дерево', 'Серия одного дерева'] },
  Today: { en: ['Today', 'Trees waiting for water'], ru: ['Сегодня', 'Деревья, которые ждут полива'] },
  Forest: { en: ['My forest', 'Your forest and all your days'], ru: ['Мой лес', 'Твой лес и все дни вместе'] },
  Row: { en: ['Row', 'Scene or Simple'], ru: ['Строка', 'Сцена или «Простой»'] },
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, "\\'");
const key = (name, what) => `oyuur_widget_${name.toLowerCase()}_${what}`;

function stringsXml(lang) {
  const items = Object.entries(WIDGETS).flatMap(([name, t]) => [
    `  <string name="${key(name, 'label')}">${esc(t[lang][0])}</string>`,
    `  <string name="${key(name, 'desc')}">${esc(t[lang][1])}</string>`,
  ]);
  return `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${items.join('\n')}\n</resources>\n`;
}

module.exports = function withWidgetStrings(config) {
  return withFinalizedMod(config, [
    'android',
    async (cfg) => {
      const main = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main');
      for (const [dir, lang] of [['values', 'en'], ['values-ru', 'ru']]) {
        fs.mkdirSync(path.join(main, 'res', dir), { recursive: true });
        fs.writeFileSync(path.join(main, 'res', dir, 'oyuur_widgets.xml'), stringsXml(lang));
      }
      // Russian pictures in the widget list (assets/widget/preview/<name>-ru.webp → drawable-ru).
      for (const name of Object.keys(WIDGETS)) {
        const ru = path.join(cfg.modRequest.projectRoot, 'assets', 'widget', 'preview', `${name.toLowerCase()}-ru.webp`);
        if (!fs.existsSync(ru)) continue;
        fs.mkdirSync(path.join(main, 'res', 'drawable-ru'), { recursive: true });
        fs.copyFileSync(ru, path.join(main, 'res', 'drawable-ru', `${name.toLowerCase()}_preview.webp`));
      }
      const manifestPath = path.join(main, 'AndroidManifest.xml');
      let manifest = fs.readFileSync(manifestPath, 'utf8');
      for (const name of Object.keys(WIDGETS)) {
        // <receiver android:name=".widget.Tree" android:exported="false" android:label="Tree"> → @string/…
        manifest = manifest.replace(new RegExp(`(<receiver[^>]*android:name="[^"]*\\.widget\\.${name}"[^>]*android:label=")[^"]*(")`), `$1@string/${key(name, 'label')}$2`);
        const xmlPath = path.join(main, 'res', 'xml', `widgetprovider_${name.toLowerCase()}.xml`);
        if (fs.existsSync(xmlPath)) {
          const xml = fs.readFileSync(xmlPath, 'utf8').replace(/android:description="[^"]*"/, `android:description="@string/${key(name, 'desc')}"`);
          fs.writeFileSync(xmlPath, xml);
        }
      }
      fs.writeFileSync(manifestPath, manifest);
      return cfg;
    },
  ]);
};
