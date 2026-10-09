import { initReveal, initSpy } from './reveal';
import { initNav } from './nav';
import { initMotion } from './motion';
import { initGlyphFields } from './glyph';

document.documentElement.classList.remove('no-js');

initReveal();
initSpy();
initNav();
initMotion();
void initGlyphFields();
