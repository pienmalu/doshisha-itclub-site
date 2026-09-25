/*
  数字の「解読」演出。伏せられていた値が確定するように見せる。
  匿名という主題に合わせて、数え上げではなく桁の走査にしている。
*/

const GLYPHS = '0123456789';

export function initCounters() {
  const targets = document.querySelectorAll<HTMLElement>('[data-scramble]');
  if (targets.length === 0) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        scramble(entry.target as HTMLElement);
      }
    },
    { threshold: 0.6 },
  );

  targets.forEach((el) => observer.observe(el));
}

function scramble(el: HTMLElement) {
  const final = el.textContent ?? '';
  if (!/\d/.test(final)) return;

  const chars = final.split('');
  const duration = 620;
  const delay = Number(el.dataset.scramble || 0);
  // 桁ごとに確定する時刻をずらす（左から順に落ち着く）
  const settleAt = chars.map((_, i) => 180 + (i / Math.max(1, chars.length)) * duration);

  const started = performance.now() + delay;
  el.style.setProperty('font-variant-numeric', 'tabular-nums');

  function tick(now: number) {
    const t = now - started;
    if (t < 0) {
      requestAnimationFrame(tick);
      return;
    }
    let done = true;
    const out = chars.map((c, i) => {
      if (!/\d/.test(c)) return c;
      if (t >= settleAt[i]!) return c;
      done = false;
      return GLYPHS[(Math.random() * GLYPHS.length) | 0];
    });
    el.textContent = out.join('');
    if (!done) requestAnimationFrame(tick);
    else el.textContent = final;
  }

  requestAnimationFrame(tick);
}
