/*
  デザインシステムが「signature visual」と呼んでいる、輪郭だけの三角形が
  有機的な塊をつくるパーティクル場。

  設計の要点:
  - 形は複数のガウス葉を重ねた密度場から棄却サンプリングで取る。座標そのものを
    正弦波で歪めて（ドメインワーピング）から葉を評価するので、輪郭が楕円の
    重ね合わせに見えない。球にも「線でつないだネットワーク図」にもならない。
  - 粒の一部を放射状の曲がった筋に沿わせる。線を引かずに流れが出る。
  - 見出しの矩形を毎フレーム読み、その内側では粒子を減光する。これで塊を
    文字の背後まで広げても可読性が落ちない。
  - 描画は 7 色 × 5 段の不透明度 = 最大 35 バッチにまとめる。三角形ひとつずつ
    strokeStyle を変えると状態変更が数千回になるため、インデックスの
    カウンティングソートで並べ替えてから一括で stroke する。
  - 画面外・タブ非表示では rAF を止める。prefers-reduced-motion では
    整列後の 1 フレームだけ描いて終わる。
*/

type Variant = 'hero' | 'sparse';

const PALETTE = [
  { hex: '#8052ff', weight: 30 }, // Electric Iris
  { hex: '#a78bfa', weight: 20 }, // 明るい紫
  { hex: '#5b8dff', weight: 16 }, // 青
  { hex: '#e05cff', weight: 10 }, // マゼンタ
  { hex: '#ffb829', weight: 9 }, // Saffron Spark
  { hex: '#4fd1c5', weight: 8 }, // 明るい青緑
  { hex: '#15846e', weight: 7 }, // Deep Verdant
];

/** 密度が高い場所で選ばれやすい色ほど前に置く */
const CORE_BIAS = [0, 4, 1, 3, 2, 5, 6];

const ALPHA_STEPS = 5;
const TAU = Math.PI * 2;

/** 有機的な塊をつくるガウス葉。x, y, σ, 重み */
const LOBES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.0, 0.0, 0.29, 1.0], // 芯
  [0.26, -0.14, 0.25, 0.88],
  [-0.28, 0.12, 0.23, 0.82],
  [0.08, 0.31, 0.21, 0.62],
  [-0.14, -0.31, 0.2, 0.58],
  [0.45, 0.21, 0.17, 0.42],
  [-0.47, -0.09, 0.16, 0.38],
  [0.04, -0.49, 0.15, 0.3],
  [-0.31, 0.43, 0.14, 0.26],
  [0.37, -0.43, 0.13, 0.22],
  [0.0, 0.02, 0.8, 0.12], // 弱いハロー
];

/** 場の最大値。正規化に使う（初回のみ実測する）*/
let fieldMax = 0;

/** 座標を歪めてから葉を評価する。輪郭が楕円の重ね合わせに見えなくなる */
function density(x: number, y: number) {
  const wx = x + 0.085 * Math.sin(3.1 * y + 1.3) + 0.05 * Math.sin(5.7 * y - 0.4);
  const wy = y + 0.075 * Math.sin(2.7 * x - 0.7) + 0.045 * Math.sin(6.1 * x + 2.2);
  let sum = 0;
  for (let i = 0; i < LOBES.length; i += 1) {
    const [lx, ly, sigma, weight] = LOBES[i]!;
    const dx = wx - lx;
    const dy = wy - ly;
    sum += weight * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
  }
  return sum;
}

function measureFieldMax() {
  let max = 0;
  for (let x = -1.2; x <= 1.2; x += 0.02) {
    for (let y = -1.2; y <= 1.2; y += 0.02) {
      const v = density(x, y);
      if (v > max) max = v;
    }
  }
  return max;
}

type Particle = {
  /** 塊の中での位置（正規化座標）*/
  tx: number;
  ty: number;
  /** 登場アニメーションの開始位置 */
  fx: number;
  fy: number;
  /** 奥行き 0（奥）〜1（手前）*/
  z: number;
  size: number;
  color: number;
  rot: number;
  spin: number;
  /** 揺らぎの振幅（px）と周期 */
  ampX: number;
  ampY: number;
  freqX: number;
  freqY: number;
  phase: number;
  /** 明滅 */
  tw: number;
  twPhase: number;
  baseAlpha: number;
  delay: number;
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

function pickColor(rand: () => number, ratio: number, total: number) {
  const skew = rand() ** (1 + Math.min(1, ratio) * 1.6);
  const target = skew * total;
  let acc = 0;
  for (let i = 0; i < CORE_BIAS.length; i += 1) {
    const idx = CORE_BIAS[i]!;
    acc += PALETTE[idx]!.weight;
    if (target <= acc) return idx;
  }
  return 0;
}

function buildParticles(count: number, seed: number, variant: Variant): Particle[] {
  const rand = mulberry32(seed);
  const totalWeight = PALETTE.reduce((s, c) => s + c.weight, 0);
  if (fieldMax === 0) fieldMax = measureFieldMax();
  const out: Particle[] = [];

  /** 正規分布の近似。筋のまわりのばらつきに使う */
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;

  const spawn = (x: number, y: number, ratio: number, ambient: boolean): Particle => {
    // 小さく奥にあるものを多めにする
    const z = rand() ** 1.45;
    const angle = rand() * TAU;
    const radius = 1.3 + rand() * (variant === 'sparse' ? 2.6 : 1.9);

    return {
      tx: x,
      ty: y,
      fx: Math.cos(angle) * radius,
      fy: Math.sin(angle) * radius,
      z,
      size: (1.15 + 2.7 * Math.pow(z, 0.85)) * (ambient ? 1.25 : 1),
      color: pickColor(rand, ratio, totalWeight),
      rot: rand() * TAU,
      spin: (rand() - 0.5) * 0.34,
      ampX: 3 + rand() * 11,
      ampY: 3 + rand() * 11,
      freqX: 0.035 + rand() * 0.1,
      freqY: 0.035 + rand() * 0.1,
      phase: rand() * TAU,
      tw: 0.07 + rand() * 0.42,
      twPhase: rand() * TAU,
      baseAlpha: Math.min(
        1,
        (ambient ? 0.12 : 0.17 + 0.5 * z) * (0.52 + 0.62 * ratio) + (ambient ? 0.2 * rand() : 0),
      ),
      delay: rand() * (ambient ? 0.75 : 0.55),
    };
  };

  // --- 筋。放射状に曲がりながら伸びる ------------------------------------
  const strands = Array.from({ length: 9 }, () => ({
    a: rand() * TAU,
    len: 0.5 + rand() * 0.6,
    bend: (rand() - 0.5) * 2,
    off: 0.06 + rand() * 0.18,
  }));

  const strandCount = Math.round(count * 0.1);
  for (let i = 0; i < strandCount; i += 1) {
    const st = strands[(rand() * strands.length) | 0]!;
    const t = rand() ** 0.7;
    const ang = st.a + st.bend * t * t;
    const rad = st.off + st.len * t;
    const jitter = 0.018 + 0.08 * t;
    const x = Math.cos(ang) * rad + gauss() * jitter;
    const y = Math.sin(ang) * rad * 1.04 + gauss() * jitter;
    out.push(spawn(x, y, Math.min(1, density(x, y) / fieldMax), false));
  }

  // --- 塊本体 -------------------------------------------------------------
  const coreCount = Math.round(count * 0.78);
  let guard = 0;
  while (out.length < coreCount && guard < coreCount * 120) {
    guard += 1;
    const x = (rand() * 2 - 1) * 1.18;
    const y = (rand() * 2 - 1) * 1.18;
    const d = density(x, y);
    if (rand() >= Math.pow(d / fieldMax, 1.3)) continue;
    out.push(spawn(x, y * 1.05, Math.min(1, d / fieldMax), false));
  }

  // --- 周囲に漂う塵 -------------------------------------------------------
  const ambientCount = count - out.length;
  for (let i = 0; i < ambientCount; i += 1) {
    const angle = rand() * TAU;
    // 面積に対して一様になるよう平方根を取る
    const r = Math.sqrt(0.95 + rand() * 2.2);
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r * 0.84;
    out.push(spawn(x, y, 0.08, true));
  }

  // 手前のものを後に描く
  out.sort((a, b) => a.z - b.z);
  return out;
}

function easeOutQuint(t: number) {
  return 1 - Math.pow(1 - t, 5);
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

function start(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  const variant = (canvas.dataset.constellation as Variant) || 'hero';
  const seed = Number(canvas.dataset.seed ?? 20190401);
  /** この要素の矩形の内側では粒子を落とす（見出しを読ませるため）*/
  const guardEl = canvas.dataset.guard
    ? document.querySelector<HTMLElement>(canvas.dataset.guard)
    : null;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let particles: Particle[] = [];
  let scale = 1;
  let originX = 0;
  let originY = 0;
  let narrow = false;

  // バッチ描画用のバッファ。毎フレーム再確保しない
  let buckets = new Uint8Array(0);
  let order = new Uint16Array(0);
  let intros = new Float32Array(0);
  const counts = new Int32Array(PALETTE.length * ALPHA_STEPS);
  const offsets = new Int32Array(PALETTE.length * ALPHA_STEPS);
  const strokes: string[] = [];
  for (const c of PALETTE) {
    for (let a = 0; a < ALPHA_STEPS; a += 1) {
      strokes.push(hexToRgba(c.hex, (a + 1) / ALPHA_STEPS));
    }
  }

  let pointerX = 0;
  let pointerY = 0;
  let easedX = 0;
  let easedY = 0;

  let raf = 0;
  let running = false;
  let startedAt = 0;
  let visible = true;
  let pauseMark = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

    narrow = width < 900;
    const short = Math.min(width, height);
    scale = short * (narrow ? 0.62 : 0.54);
    originX = width * (narrow ? 0.5 : 0.72);
    originY = height * (narrow ? 0.42 : 0.5);

    const area = width * height;
    const base = variant === 'sparse' ? 760 : 200;
    const cap = variant === 'sparse' ? 1100 : 5200;
    const target = Math.max(360, Math.min(cap, Math.round(area / base)));

    if (particles.length !== target) {
      particles = buildParticles(target, seed, variant);
      buckets = new Uint8Array(particles.length);
      order = new Uint16Array(particles.length);
      intros = new Float32Array(particles.length);
    }
  }

  function draw(now: number) {
    if (!startedAt) startedAt = now;
    const t = (now - startedAt) / 1000;

    // ポインタ追従は強く減衰させて「奥行きがある」程度に留める
    easedX += (pointerX - easedX) * 0.045;
    easedY += (pointerY - easedY) * 0.045;

    // 塊全体のごく緩い揺れ
    const swayX = Math.sin(t * 0.031) * 7 + Math.sin(t * 0.017 + 2.1) * 4;
    const swayY = Math.cos(t * 0.024 + 0.9) * 6;

    // 見出しを守る矩形
    let gl = 0;
    let gt = 0;
    let gr = 0;
    let gb = 0;
    let hasGuard = false;
    if (guardEl) {
      const cr = guardEl.getBoundingClientRect();
      const own = canvas.getBoundingClientRect();
      gl = cr.left - own.left - 28;
      gt = cr.top - own.top - 24;
      gr = cr.right - own.left + 36;
      gb = cr.bottom - own.top + 24;
      hasGuard = true;
    }

    ctx!.clearRect(0, 0, width, height);
    ctx!.lineJoin = 'miter';
    ctx!.lineCap = 'butt';

    counts.fill(0);
    const n = particles.length;

    for (let i = 0; i < n; i += 1) {
      const p = particles[i]!;
      const intro = reduced ? 1 : easeOutQuint(clamp01((t - p.delay) / 1.9));
      intros[i] = intro;

      let alpha = p.baseAlpha * (0.62 + 0.38 * Math.sin(t * p.tw + p.twPhase)) * intro;

      if (hasGuard) {
        const x = position(p, t, intro, swayX, swayY, easedX, easedY, true);
        const y = position(p, t, intro, swayX, swayY, easedX, easedY, false);
        const ox = Math.max(gl - x, x - gr, 0);
        const oy = Math.max(gt - y, y - gb, 0);
        // 矩形の縁から時間をかけて元の濃さへ戻す。短いと矩形の輪郭が見える。
        // 狭い画面では文字の下に塊しか置けないので、減光は弱めにする
        const reach = narrow ? 110 : 170;
        const floor = narrow ? 0.26 : 0.04;
        const out = Math.sqrt(ox * ox + oy * oy) / reach;
        if (out < 1) alpha *= floor + (1 - floor) * Math.pow(out, 1.6);
      }

      const step = Math.min(ALPHA_STEPS - 1, Math.max(0, Math.round(alpha * ALPHA_STEPS) - 1));
      buckets[i] = p.color * ALPHA_STEPS + step;
      counts[buckets[i]!] += 1;
    }

    let run = 0;
    for (let b = 0; b < counts.length; b += 1) {
      offsets[b] = run;
      run += counts[b]!;
    }
    const cursor = offsets.slice();
    for (let i = 0; i < n; i += 1) {
      order[cursor[buckets[i]!]!++] = i;
    }

    for (let b = 0; b < counts.length; b += 1) {
      const len = counts[b]!;
      if (len === 0) continue;
      ctx!.strokeStyle = strokes[b]!;
      ctx!.lineWidth = b % ALPHA_STEPS >= 3 ? 1.35 : 1;
      ctx!.beginPath();

      const from = offsets[b]!;
      for (let k = 0; k < len; k += 1) {
        const index = order[from + k]!;
        const p = particles[index]!;
        const intro = intros[index]!;

        const x = position(p, t, intro, swayX, swayY, easedX, easedY, true);
        const y = position(p, t, intro, swayX, swayY, easedX, easedY, false);
        if (x < -30 || x > width + 30 || y < -30 || y > height + 30) continue;

        const r = p.size * (0.72 + intro * 0.28);
        const a = reduced ? p.rot : p.rot + t * p.spin;

        // 正三角形を 3 頂点で直接描く
        ctx!.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        ctx!.lineTo(x + Math.cos(a + 2.0944) * r, y + Math.sin(a + 2.0944) * r);
        ctx!.lineTo(x + Math.cos(a + 4.1888) * r, y + Math.sin(a + 4.1888) * r);
        ctx!.closePath();
      }
      ctx!.stroke();
    }
  }

  /** axis=true で x、false で y を返す（座標計算を一箇所に閉じる）*/
  function position(
    p: Particle,
    t: number,
    intro: number,
    swayX: number,
    swayY: number,
    px: number,
    py: number,
    axis: boolean,
  ) {
    const depth = 0.35 + p.z * 0.9;
    const bulk = 0.5 + p.z * 0.5;
    if (axis) {
      const nx = p.fx + (p.tx - p.fx) * intro;
      return (
        originX +
        nx * scale +
        Math.sin(t * p.freqX + p.phase) * p.ampX +
        px * depth +
        swayX * bulk
      );
    }
    const ny = p.fy + (p.ty - p.fy) * intro;
    return (
      originY +
      ny * scale +
      Math.cos(t * p.freqY + p.phase * 1.6) * p.ampY +
      py * depth +
      swayY * bulk
    );
  }

  function frame(now: number) {
    draw(now);
    raf = requestAnimationFrame(frame);
  }

  function play() {
    if (running || reduced || !visible || document.hidden) return;
    running = true;
    // 停止していた間の経過時間を足し込まない
    if (pauseMark) startedAt += performance.now() - pauseMark;
    pauseMark = 0;
    raf = requestAnimationFrame(frame);
  }

  function pause() {
    if (!running) return;
    running = false;
    pauseMark = performance.now();
    cancelAnimationFrame(raf);
  }

  function onPointer(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    pointerX = ((event.clientX - cx) / rect.width) * 30;
    pointerY = ((event.clientY - cy) / rect.height) * 30;
  }

  resize();
  if (reduced) {
    // 整列後の 1 フレームだけ描く
    startedAt = performance.now() - 4000;
    draw(performance.now());
  } else {
    play();
  }

  // 和文フォントが届くと見出しの矩形が変わるので、静止描画をやり直す
  if (reduced && 'fonts' in document) {
    document.fonts.ready.then(() => draw(performance.now()));
  }

  let resizeTimer = 0;
  const ro = new ResizeObserver(() => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resize();
      if (reduced) draw(performance.now());
    }, 160);
  });
  ro.observe(canvas);

  const io = new IntersectionObserver(
    (entries) => {
      visible = entries[0]?.isIntersecting ?? false;
      if (visible) play();
      else pause();
    },
    { rootMargin: '120px' },
  );
  io.observe(canvas);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else play();
  });

  if (!reduced && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    window.addEventListener('pointermove', onPointer, { passive: true });
  }
}

export function initConstellations() {
  const nodes = document.querySelectorAll<HTMLCanvasElement>('canvas[data-constellation]');
  nodes.forEach((node) => start(node));
}
