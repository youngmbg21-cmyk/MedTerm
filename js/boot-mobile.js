/* Mobile entry — phones only. Loads the native-concept mobile design system,
   mounts its frame, and boots the mobile app. Selected by index.html on
   narrow viewports; the desktop workspace is untouched (see boot-desktop.js). */
import { boot } from './mobile-app.js';

const css = document.createElement('link');
css.rel = 'stylesheet';
css.href = './css/mobile.css';

const frame = document.createElement('div');
frame.className = 'frame';
frame.id = 'frame';
frame.setAttribute('aria-label', 'MedTerminal');
document.body.appendChild(frame);

// Boot after the stylesheet is in to avoid an unstyled flash.
css.onload = () => boot();
css.onerror = () => boot();
document.head.appendChild(css);
