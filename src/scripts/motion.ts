/*
  スクロールに連動する小さな演出をまとめる。
  - data-progress: 要素がどこまでスクロールされたかを --p（0〜1）に書く。
    sticky のセクションで、CSS 側が --p を読んで動かす。
  - data-marquee: 流れる帯。スクロールの速さで一時的に加速する。
  - data-magnetic: ポインタに少し吸い寄せられるボタン。
  動きを減らす設定では、--p の更新だけを続け、帯と吸い寄せは止める。
*/

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function initProgress() {
  const items = Array.from(document.querySelectorAll<HTMLElement>('[data-progress]'));
  if (items.length === 0) return;

  /** 'stick' は sticky の区間（高さ − 画面高）で、'pass' は画面を横切る区間で測る */
  function update() {
    const vh = window.innerHeight;
    for (const el of items) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < -vh || rect.top > vh * 2) continue;
      const mode = el.dataset.progress || 'stick';
      const p =
        mode === 'pass'
          ? clamp01((vh - rect.top) / (vh + rect.height))
          : clamp01(-rect.top / Math.max(1, rect.height - vh));
      el.style.setProperty('--p', p.toFixed(4));
      // しきい値を越えたら段階を切り替える（文言の差し替えなど）
      const steps = Number(el.dataset.steps ?? 0);
      if (steps > 0) {
        const step = Math.min(steps - 1, Math.floor(p * steps));
        if (el.dataset.step !== String(step)) el.dataset.step = String(step);
      }
    }
  }

  let ticking = false;
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    },
    { passive: true },
  );
  window.addEventListener('resize', update);
  update();
}

function initMarquee(reduce: boolean) {
  const tracks = document.querySelectorAll<HTMLElement>('[data-marquee]');
  if (tracks.length === 0 || reduce) return;

  let lastY = window.scrollY;
  let boost = 0;
  let offset = 0;
  let last = performance.now();
  let visible = false;

  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
  });
  tracks.forEach((t) => io.observe(t));

  function frame(now: number) {
    const dt = Math.min(64, now - last);
    last = now;
    const y = window.scrollY;
    // スクロールの向きと速さを、帯の加速に変える
    boost += (y - lastY) * 0.06;
    lastY = y;
    boost *= 0.92;
    if (visible) {
      offset -= (0.045 + Math.abs(boost) * 0.02) * dt * (boost < -0.5 ? -1 : 1);
      tracks.forEach((track) => {
        const half = track.scrollWidth / 2;
        if (half > 0) offset = ((offset % half) - half) % half;
        track.style.transform = `translate3d(${offset}px,0,0) skewX(${Math.max(-8, Math.min(8, -boost * 0.6))}deg)`;
      });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function initMagnetic(reduce: boolean) {
  if (reduce || !window.matchMedia('(pointer: fine)').matches) return;
  document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
    el.addEventListener('pointermove', (event) => {
      const rect = el.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      el.style.transform = `translate(${x * 0.22}px, ${y * 0.3}px)`;
    });
    el.addEventListener('pointerleave', () => {
      el.style.transform = '';
    });
  });
}

export function initMotion() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  initProgress();
  initMarquee(reduce);
  initMagnetic(reduce);
}
