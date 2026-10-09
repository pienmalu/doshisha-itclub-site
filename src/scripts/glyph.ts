/*
  文字の形に集まるパーティクル場。ヒーローでは「0」がスクロールで「1」に変わる。
  「アイデアのままでは0、世に出してはじめて1」というサイトの主張そのもの。

  設計の要点:
  - 形は、オフスクリーンに描いた文字のピクセルから点を取る。0 と 1 から同じ数を
    取り、粒ごとに「0での位置」と「1での位置」を持たせる。
  - 変形の途中では、粒ごとの向きへ一度散らしてから集め直す。直線で補間すると
    ただの伸び縮みに見えるため。
  - 位置はばねで目標に追従させる。ポインタの近くでは押しのけ、離れると戻る。
  - 描画は 7 色 × 3 段の不透明度 = 最大 21 バッチ。粒ごとに fillStyle を変えると
    状態変更が数千回になるため、色と濃さでまとめて一括で fill する。
  - 画面外・タブ非表示では rAF を止める。prefers-reduced-motion では
    揺らぎと登場演出をやめ、スクロールに応じた位置を1フレームずつ描くだけにする。
*/

const PALETTE = ['#8052ff', '#a78bfa', '#5b8dff', '#e05cff', '#ffb829', '#4fd1c5', '#15846e'];
const WEIGHTS = [34, 20, 16, 9, 8, 8, 5];
/** 0 番は「文字の外に余った粒」と「見出しの背後」に使う */
const ALPHAS = [0.14, 0.35, 0.65, 1];
const TAU = Math.PI * 2;

type Particle = {
  /** 文字ごとの目標位置（CSS px）。glyph の数だけ並ぶ */
  tx: Float32Array;
  ty: Float32Array;
  /** その文字では形に入らず、まわりを漂う粒か */
  dust: Uint8Array;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 変形の途中で散る向きと距離 */
  sx: number;
  sy: number;
  size: number;
  rot: number;
  color: number;
  alpha: number;
  phase: number;
  /** ばねの強さ。粒ごとに少し変えて、揃いすぎた動きを避ける */
  k: number;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickColor(rand: () => number) {
  const total = WEIGHTS.reduce((s, w) => s + w, 0);
  let target = rand() * total;
  for (let i = 0; i < WEIGHTS.length; i += 1) {
    target -= WEIGHTS[i]!;
    if (target <= 0) return i;
  }
  return 0;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * 文字を描いて、塗られたピクセルから点を count 個取る。
 * 返す座標は文字の外接矩形の中心を原点にした px。
 */
function sampleGlyph(glyph: string, height: number, count: number, rand: () => number) {
  const size = Math.round(height);
  const w = Math.round(size * 1.2);
  const h = Math.round(size * 1.1);
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `300 ${size}px Inter, sans-serif`;
  const m = ctx.measureText(glyph);
  const asc = m.actualBoundingBoxAscent;
  const desc = m.actualBoundingBoxDescent;
  const base = h / 2 + (asc - desc) / 2;
  ctx.fillText(glyph, w / 2, base);

  const data = ctx.getImageData(0, 0, w, h).data;
  const step = Math.max(1, Math.round(size / 260));
  const pool: number[] = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (data[(y * w + x) * 4 + 3]! > 140) pool.push(x - w / 2, y - h / 2);
    }
  }
  const out = new Float32Array(count * 2);
  const n = pool.length / 2;
  if (n === 0) return { points: out, area: 0 };
  for (let i = 0; i < count; i += 1) {
    const j = Math.floor(rand() * n);
    // ピクセル格子が見えないよう、1マス以内でずらす
    out[i * 2] = pool[j * 2]! + (rand() - 0.5) * step;
    out[i * 2 + 1] = pool[j * 2 + 1]! + (rand() - 0.5) * step;
  }
  return { points: out, area: n * step * step };
}

type FieldOptions = {
  canvas: HTMLCanvasElement;
  glyphs: string[];
  /** 0〜1。glyphs の何番目から何番目へ変形しているか */
  progress: () => number;
  /** 文字の中心（キャンバスに対する割合） */
  anchor: () => { x: number; y: number; scale: number };
  /** この要素の矩形の内側では粒を暗くする（見出しを守る） */
  guard?: HTMLElement | null;
  seed: number;
};

function createField(opts: FieldOptions) {
  const { canvas, glyphs, progress, anchor, guard, seed } = opts;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(pointer: fine)');
  let particles: Particle[] = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let running = false;
  let visible = false;
  let raf = 0;
  let start = performance.now();
  const pointer = { x: -9999, y: -9999, active: false };
  /** 色 × 濃さごとのバケット。毎フレーム作り直さない */
  const buckets: number[][] = Array.from({ length: PALETTE.length * ALPHAS.length }, () => []);

  function build() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    if (width === 0 || height === 0) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const rand = mulberry32(seed);
    const a = anchor();
    const glyphHeight = Math.min(width, height) * a.scale;
    // 面積に応じて数を決める。狭い画面では少なくして負荷を抑える
    const count = Math.round(Math.min(3200, Math.max(1100, glyphHeight * 4.2)));
    const samples = glyphs.map((g) => sampleGlyph(g, glyphHeight, count, rand));
    // 面積の小さい文字（1 など）では、同じ数の粒を詰めると塊に見える。
    // 面積に比例した数だけを形に使い、残りは文字のまわりに薄く漂わせる
    const maxArea = Math.max(...samples.map((s) => s.area), 1);
    const onShape = samples.map((s) => Math.round((count * s.area) / maxArea));

    const prev = particles;
    particles = [];
    for (let i = 0; i < count; i += 1) {
      const tx = new Float32Array(glyphs.length);
      const ty = new Float32Array(glyphs.length);
      const dust = new Uint8Array(glyphs.length);
      for (let g = 0; g < glyphs.length; g += 1) {
        if (i < onShape[g]!) {
          tx[g] = samples[g]!.points[i * 2]!;
          ty[g] = samples[g]!.points[i * 2 + 1]!;
        } else {
          const da = rand() * TAU;
          const dr = glyphHeight * (0.3 + rand() ** 0.8 * 0.55);
          tx[g] = Math.cos(da) * dr * 0.8;
          ty[g] = Math.sin(da) * dr;
          dust[g] = 1;
        }
      }
      const angle = rand() * TAU;
      const reach = glyphHeight * (0.25 + rand() ** 1.6 * 0.9);
      const old = prev[i];
      // 初回は画面の外周から集める。作り直しのときは今の位置を引き継ぐ
      const from = rand() * TAU;
      const far = Math.hypot(width, height) * (0.45 + rand() * 0.35);
      particles.push({
        tx,
        ty,
        dust,
        x: old ? old.x : width * a.x + Math.cos(from) * far,
        y: old ? old.y : height * a.y + Math.sin(from) * far,
        vx: 0,
        vy: 0,
        sx: Math.cos(angle) * reach,
        sy: Math.sin(angle) * reach,
        size: (0.9 + rand() ** 2.2 * 2.6) * Math.max(0.8, Math.min(1.25, glyphHeight / 520)),
        rot: rand() * TAU,
        color: pickColor(rand),
        alpha: rand() < 0.18 ? 1 : rand() < 0.5 ? 2 : 3,
        phase: rand() * TAU,
        k: 0.018 + rand() * 0.03,
      });
    }
  }

  function target(p: Particle, t: number, prog: number, cx: number, cy: number, still: boolean) {
    const span = glyphs.length - 1;
    const pos = span === 0 ? 0 : clamp01(prog) * span;
    const i0 = Math.min(span, Math.floor(pos));
    const i1 = Math.min(span, i0 + 1);
    const local = ease(pos - i0);
    // 変形の途中ほど大きく散らす
    const burst = Math.sin(Math.PI * local) ** 1.4;
    let x = cx + p.tx[i0]! + (p.tx[i1]! - p.tx[i0]!) * local + p.sx * burst;
    let y = cy + p.ty[i0]! + (p.ty[i1]! - p.ty[i0]!) * local + p.sy * burst;
    if (!still) {
      x += Math.sin(t * 0.0009 + p.phase) * 1.6;
      y += Math.cos(t * 0.0011 + p.phase * 1.3) * 1.6;
    }
    return [x, y, local < 0.5 ? i0 : i1] as const;
  }

  function draw(t: number) {
    const still = reduce.matches;
    const a = anchor();
    const cx = width * a.x;
    const cy = height * a.y;
    const prog = progress();

    let gx0 = 0;
    let gy0 = 0;
    let gx1 = 0;
    let gy1 = 0;
    if (guard) {
      const c = canvas.getBoundingClientRect();
      const g = guard.getBoundingClientRect();
      gx0 = g.left - c.left - 16;
      gy0 = g.top - c.top - 16;
      gx1 = g.right - c.left + 16;
      gy1 = g.bottom - c.top + 16;
    }

    for (const b of buckets) b.length = 0;
    const elapsed = t - start;
    const r2 = 110 * 110;

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i]!;
      const [tx, ty, shape] = target(p, t, prog, cx, cy, still);
      if (still) {
        p.x = tx;
        p.y = ty;
      } else {
        // 登場時は粒ごとに遅れて動き出す
        const ramp = clamp01((elapsed - (i % 97) * 9) / 900);
        p.vx += (tx - p.x) * p.k * ramp;
        p.vy += (ty - p.y) * p.k * ramp;
        if (pointer.active) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < r2 && d2 > 0.01) {
            const f = (1 - d2 / r2) * 2.4;
            const d = Math.sqrt(d2);
            p.vx += (dx / d) * f;
            p.vy += (dy / d) * f;
          }
        }
        p.vx *= 0.86;
        p.vy *= 0.86;
        p.x += p.vx;
        p.y += p.vy;
      }

      let alpha = p.dust[shape] ? 0 : p.alpha;
      if (guard && p.x > gx0 && p.x < gx1 && p.y > gy0 && p.y < gy1) alpha = 0;
      buckets[p.color * ALPHAS.length + alpha]!.push(i);
    }

    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, width, height);
    for (let c = 0; c < PALETTE.length; c += 1) {
      ctx!.fillStyle = PALETTE[c]!;
      for (let s = 0; s < ALPHAS.length; s += 1) {
        const list = buckets[c * ALPHAS.length + s]!;
        if (list.length === 0) continue;
        ctx!.globalAlpha = ALPHAS[s]!;
        ctx!.beginPath();
        for (let n = 0; n < list.length; n += 1) {
          const p = particles[list[n]!]!;
          // 速く動いている粒ほど回す。止まると向きが落ち着く
          const r = p.rot + (p.vx - p.vy) * 0.08;
          const s0 = p.size;
          const c0 = Math.cos(r) * s0;
          const s1 = Math.sin(r) * s0;
          ctx!.moveTo(p.x + c0, p.y + s1);
          ctx!.lineTo(p.x - 0.5 * c0 - 0.866 * s1, p.y - 0.5 * s1 + 0.866 * c0);
          ctx!.lineTo(p.x - 0.5 * c0 + 0.866 * s1, p.y - 0.5 * s1 - 0.866 * c0);
        }
        ctx!.fill();
      }
    }
    ctx!.globalAlpha = 1;
  }

  function loop(t: number) {
    draw(t);
    if (running) raf = requestAnimationFrame(loop);
  }

  function play() {
    if (running || !visible || document.hidden) return;
    if (reduce.matches) {
      draw(performance.now());
      return;
    }
    running = true;
    raf = requestAnimationFrame(loop);
  }

  function pause() {
    running = false;
    cancelAnimationFrame(raf);
  }

  build();
  start = performance.now();

  new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    if (visible) play();
    else pause();
  }).observe(canvas);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else play();
  });

  // 動きを減らす設定では、スクロールのたびに1フレームだけ描く
  window.addEventListener(
    'scroll',
    () => {
      if (reduce.matches && visible) requestAnimationFrame(() => draw(performance.now()));
    },
    { passive: true },
  );

  let resizeTimer = 0;
  new ResizeObserver(() => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      build();
      if (reduce.matches) draw(performance.now());
    }, 120);
  }).observe(canvas);

  if (fine.matches) {
    const host = canvas.closest('section') ?? canvas;
    host.addEventListener('pointermove', (event) => {
      const e = event as PointerEvent;
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = true;
    });
    host.addEventListener('pointerleave', () => {
      pointer.active = false;
    });
  }
}

/** data-glyph-field を持つ canvas をすべて起動する */
export async function initGlyphFields() {
  const canvases = document.querySelectorAll<HTMLCanvasElement>('canvas[data-glyph-field]');
  if (canvases.length === 0) return;
  // 文字の形を取るので、フォントを待つ。読めなくても代替フォントで描く
  try {
    await Promise.race([
      document.fonts.load('300 200px Inter'),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch {
    /* 代替フォントで続ける */
  }

  canvases.forEach((canvas, index) => {
    const glyphs = (canvas.dataset.glyphs ?? '0').split(',');
    const track = canvas.dataset.track ? document.querySelector<HTMLElement>(canvas.dataset.track) : null;
    const guard = canvas.dataset.guard ? document.querySelector<HTMLElement>(canvas.dataset.guard) : null;
    const wide = window.matchMedia('(min-width: 860px)');

    createField({
      canvas,
      glyphs,
      seed: Number(canvas.dataset.seed ?? 20260401 + index),
      guard,
      progress: () => {
        if (!track) return 0;
        const rect = track.getBoundingClientRect();
        const range = rect.height - window.innerHeight;
        if (range <= 0) return 0;
        return clamp01(-rect.top / range);
      },
      anchor: () =>
        wide.matches
          ? { x: Number(canvas.dataset.x ?? 0.72), y: 0.5, scale: Number(canvas.dataset.scale ?? 0.82) }
          : { x: 0.5, y: Number(canvas.dataset.yNarrow ?? 0.42), scale: Number(canvas.dataset.scaleNarrow ?? 0.9) },
    });
  });
}
