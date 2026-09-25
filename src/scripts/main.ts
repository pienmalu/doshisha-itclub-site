import { initConstellations } from './constellation';
import { initReveal } from './reveal';
import { initNav } from './nav';
import { initCounters } from './counters';

document.documentElement.classList.remove('no-js');

initReveal();
initNav();
initCounters();
initConstellations();
