// Phones start the app right away; the browser first loads the Skia engine (index.web.ts).
// Android widgets: their background handler and tree picker are registered first (OYUUR-39).
import './src/widget/register';
import 'expo-router/entry';
