# tools

## og-template.html

`public/og.png`（SNS共有画像・1200×630）の元。サークル名や訴求文を変えたら、ここを直して書き出す。

文言は `src/data/site.ts` と手で揃える必要がある。ヘッドレスの Chrome で書き出す。

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1200,630 \
  --virtual-time-budget=6000 \
  --screenshot=public/og.png \
  "file://$PWD/tools/og-template.html"
```

パーティクルは本体（`src/scripts/glyph.ts`）と同じ考え方で「1」を描く静止1フレーム用の簡略版を、このファイル内に持っている。
