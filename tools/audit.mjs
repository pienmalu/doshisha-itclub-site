/*
  ビルド済みの dist を配信し、axe-core で検査する。
  `node tools/audit.mjs` で実行する（npm run audit）。
  ローカルの Google Chrome を使うので、ブラウザの追加ダウンロードは不要。
*/
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';

const PORT = 4331;
const axe = fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8');

const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`http://localhost:${PORT}/`);
      if (r.ok) return;
    } catch {
      /* まだ起きていない */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('preview サーバーが起動しなかった');
}

await waitForServer();

const browser = await chromium.launch({ channel: 'chrome' });
let total = 0;

for (const [label, width, height] of [
  ['desktop', 1440, 900],
  ['mobile', 390, 844],
]) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (e) => {
    if (e.type() === 'error') problems.push(`console: ${e.text()}`);
  });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.addScriptTag({ content: axe });

  const violations = await page.evaluate(async () => {
    const res = await window.axe.run(document, { resultTypes: ['violations'] });
    return res.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      n: v.nodes.length,
      help: v.help,
      where: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
    }));
  });

  total += violations.length + problems.length;
  console.log(`\n${label} (${width}x${height})`);
  console.log(`  axe 違反: ${violations.length}`);
  for (const v of violations) {
    console.log(`  [${v.impact}] ${v.id} x${v.n} — ${v.help}`);
    for (const w of v.where) console.log(`      ${w}`);
  }
  console.log(`  JS エラー: ${problems.length}`);
  for (const m of problems) console.log(`      ${m}`);
  await page.close();
}

await browser.close();
stop();
console.log(total === 0 ? '\n問題なし' : `\n合計 ${total} 件`);
process.exit(total === 0 ? 0 : 1);
