# 同志社IT起業サークル — サイト

https://doshisha-itclub.com

同志社大学公認のIT起業サークルの公開サイト。Astro による静的な1ページ構成。

中心の演出は、スクロールでパーティクルの「0」が「1」に変わるヒーロー。「アイデアのままでは0、世に出してはじめて1」というサイトの主張をそのまま形にしている。色とトークンは `design-system/` を正本とする（純黒の面に、行動を促す箇所だけバイオレット）。

## 使い方

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # dist/ に出力
npm run check    # 型と Astro の検査
npm run audit    # dist を配信して axe-core で検査（ローカルの Chrome を使う）
npm run deploy   # ビルドして Cloudflare Pages に公開
```

`npm run deploy` は初回だけ `npx wrangler login` で Cloudflare にログインしておく。

## 文言と事実

内容はすべて [`src/data/site.ts`](src/data/site.ts) にある。

- 事実として載せているのは、公式 X（@doshisha_itclub）のプロフィールにある内容だけ（大学公認、学年・学部不問、他大学・社会人歓迎、入会費無料、2026年4月始動、起業実績あり）。
- 「考え方」などの文言は X の投稿の主張を元にしている。人を下げる言い方と、確かめられない金額は載せない。
- 数字や実績を足すときは、確かめられる値にする。検索結果とSNSにそのまま出る。

入会の導線は LINE のグループ（`links.join`）。URL を変えると、ボタンと QR コードがビルド時に作り直される。

## 公開の構成

| 項目 | 内容 |
|---|---|
| ドメイン | お名前.com で取得、DNS は Cloudflare |
| 配信 | Cloudflare Pages（プロジェクト名 `doshisha-itclub`、直接アップロード） |
| DNS | `doshisha-itclub.com` と `www` を Pages に向けた CNAME。`www` は apex へ 301 |
| メール | Cloudflare Email Routing（MX・SPF・DKIM のレコードは消さない） |

## 検索結果に出すための設定

ビルド時に `robots.txt`、`sitemap-index.xml`、構造化データ（`Organization`・`WebSite`・`FAQPage`）、canonical、OG が作られる。基準のURLは `astro.config.mjs` の `site`。

公開後に人の手でやること。

1. [Google Search Console](https://search.google.com/search-console) で「ドメイン」として `doshisha-itclub.com` を登録し、表示された TXT レコードを Cloudflare の DNS に追加して所有権を確認する
2. `https://doshisha-itclub.com/sitemap-index.xml` を送信する
3. トップページの「インデックス登録をリクエスト」を押す
4. Bing Webmaster Tools は Search Console からインポートできる

## 構造

```
src/
  data/site.ts          文言・連絡先・FAQ
  styles/global.css     共通の文字と部品
  layouts/Base.astro    head、構造化データ、ヘッダーとフッター
  components/           セクションごとに1ファイル
  scripts/
    glyph.ts            文字の形に集まるパーティクル（0 → 1）
    motion.ts           スクロール連動（--p）、流れる帯、吸い寄せるボタン
    reveal.ts           出現の演出、いま読んでいる項目の追跡
    nav.ts              ヘッダーとメニュー
public/                 アイコンと OG 画像
tools/
  og-template.html      OG画像の元（書き出し方は tools/README.md）
  audit.mjs             npm run audit の中身
```

## 実装で決めたこと

**パーティクル** — 文字をオフスクリーンに描き、塗られたピクセルから点を取る。0 と 1 で同じ数を取り、粒ごとに両方の位置を持たせる。変形の途中では一度散らしてから集め直す。1 のように面積の小さい文字では、余った粒を文字のまわりに薄く漂わせる。描画は色と濃さで最大28バッチにまとめる。画面外では止まる。

**スクロール連動** — sticky のセクション（ヒーロー、「使う側から、つくる側へ」）は、`motion.ts` が書き込む `--p`（0〜1）を CSS が読んで動かす。JS がなくても文章はすべて読める。

**コントラスト** — 「考え方」で読んでいない項目は見出しだけを 40% に沈める（大きな文字に必要な 3:1 を保つ）。本文は沈めない。

**動きを減らす設定** — `prefers-reduced-motion: reduce` では、パーティクルの揺らぎ・流れる帯・吸い寄せを止め、出現の演出も省く。

## 確認済みのこと

- `npm run audit` で違反 0 件・JSエラー 0 件（1440×900 / 390×844）
- 横スクロールなし（1440 / 390）
