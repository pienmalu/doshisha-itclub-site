# 同志社IT起業サークル — サイト

同志社大学公認のIT起業サークルの公開サイト。Astro による静的サイトで、`dist/` をそのまま配信できる。

デザインは `design-system/` を正本とする。純黒のキャンバス、単一のバイオレット（Electric Iris）をアクションに限って使い、見出しは太字にせず大きさと字間で階層を作る。カード・境界線・影は置かない。ヒーローの輪郭三角形のパーティクル場が、このサイトのブランドそのものである。

## 使い方

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # dist/ に出力
npm run preview  # dist/ を確認
npm run check    # 型と Astro の検査
npm run audit    # dist を配信して axe-core で検査（ローカルの Chrome を使う）
```

本番のドメインは環境変数で渡す。canonical・OG・sitemap.xml・robots.txt がすべてこの値を基準に生成される。

```bash
SITE_URL=https://example.jp npm run build
```

## 公開前に差し替えるもの

内容はすべて [`src/data/site.ts`](src/data/site.ts) に集約している。以下は仮の値なので、実際の値に置き換える。

| 場所 | 項目 | 現在の仮値 |
|---|---|---|
| `brand.mark` | 視覚的なワードマーク | `ANON.VENTURES` |
| `brand.nameJa` | 検索に出したい正式名称 | 同志社IT起業サークル |
| `brand.founded` | 設立年 | 2019 |
| `stats` | 設立・在籍・法人化・選考 | 2019年 / 42名 / 3社 / なし |
| `ventures` | 起業実績（3件） | 受託→法人化、学内SaaS、事業譲渡 |
| `gates` | 参加条件の説明文 | 未経験が半数、文系が多数 など |
| `activities` | 活動の中身と頻度 | 定例会・もくもく会 ほか |
| `faq[5].a` | 会費 | 月500円 |
| `links.join` | **入会フォームのURL（最重要）** | `https://forms.gle/PLACEHOLDER` |
| `links.x` / `links.discord` / `links.mail` | 連絡先 | PLACEHOLDER |
| `media.inside` | 活動写真 | `public/images/inside.svg`（プレースホルダー） |
| `public/og.png` | SNS共有画像 1200×630 | 生成済み。名称変更時は作り直す |

`links` の値を空文字にすると、フッターのその行は出力されない。

数値と実績は検索結果とSNSに出る。**事実と異なる値のまま公開しない。** 実績の名称は意図的に伏せ字にしてあるので、社名やサービス名を書く必要はない。

画像を差し替えるときは `public/images/` に置き、`media.inside` の `src` / `width` / `height` / `alt` を実寸に合わせて更新する。`width` と `height` はレイアウトのずれ（CLS）を防ぐために必要。

## 検索結果に出すための設定

ビルド時に次が生成される。

- `robots.txt` — `SITE_URL` を見て sitemap の場所を書く
- `sitemap-index.xml` / `sitemap-0.xml`
- 構造化データ（JSON-LD）— `Organization`（親組織に同志社大学）、`WebSite`、`FAQPage`（8問）
- canonical、OG、Twitter カード

公開後にやること。

1. Google Search Console にドメインを登録し、所有権を確認する
2. `https://<ドメイン>/sitemap-index.xml` を送信する
3. [リッチリザルトテスト](https://search.google.com/test/rich-results)で FAQ の構造化データを確認する
4. トップページのインデックス登録をリクエストする

`SITE_URL` を設定せずにビルドすると canonical が `https://example.com` を指す。**必ず設定する。**

## 配信

静的ファイルなので、どこでも置ける。ビルドコマンドは `npm run build`、出力は `dist`。

- **Vercel / Netlify / Cloudflare Pages** — リポジトリを繋ぎ、環境変数 `SITE_URL` を設定するだけ
- **GitHub Pages** — サブディレクトリに置く場合は `astro.config.mjs` に `base` を追加する

## 構造

```
design-system/          デザインシステムの正本（トークンと規範）
src/
  data/site.ts          可変情報はすべてここ
  styles/global.css     design-system/variables.css を読み込み、和文の扱いを足す
  layouts/Base.astro    head、構造化データ、ヘッダーとフッター
  components/           セクションごとに1ファイル
  scripts/
    constellation.ts    パーティクル場（canvas 2D）
    nav.ts              ヘッダーの挙動とメニュー
    reveal.ts           スクロール連動の出現
    counters.ts         数値の解読演出
  pages/
    index.astro         1ページ構成の本体
    404.astro
    robots.txt.ts
public/                 画像とアイコン
tools/
  og-template.html      OG画像の元（書き出し方は tools/README.md）
  audit.mjs             npm run audit の中身
```

## 実装で決めたこと

**和文のタイポグラフィ** — PPNeueMontreal に和文がないので、欧文は Inter、和文は Noto Sans JP に振っている。Noto Sans JP は weight 200 を持つため、デザインシステムの「本文は 200」を和文でも守れる。`font-feature-settings: 'palt' 1` で和文を詰め、`line-break: strict` で行頭に「ー」や促音が来る折り返しを防ぐ。見出しの改行は `<br>` と `.nb`（nowrap）を併用し、画面幅が変わっても語中で切れないようにしている。

**パーティクル場** — 複数のガウス葉を重ねた密度場から棄却サンプリングで粒を配置する。座標を正弦波で歪めてから評価するので、輪郭が楕円の重ね合わせに見えない。粒の一部は放射状の曲がった筋に沿わせ、線を引かずに流れを出している。描画は色×不透明度で最大35バケットにまとめ、インデックスのカウンティングソートで並べ替えてから一括で `stroke()` する。5,200粒・DPR2 で1フレーム約7.5ms。

**見出しの可読性** — パーティクル場は見出しの背後まで広がる。`#hero-copy` の矩形を毎フレーム読み、その内側では粒子を減光している。CSS のマスクだけでは端全体が薄くなるが、この方法なら文字のある場所だけを守れる。

**ヘッダーのCTA** — デザインシステムは塗りボタンを1ビューに1つに限っている。ヒーローのCTAが見えているあいだヘッダーのCTAは出さず、ヒーローを抜けてから引き継ぐ。隠れているあいだはタブ移動の対象からも外れる。

**ボタンのhover** — 明るくすると白文字のコントラストが 3.5:1 まで落ちるため、逆に濃くしている（`#8052ff` → `#6a37ff`、4.6:1 → 5.8:1）。

**境界線** — デザインシステムは境界線を置かない方針だが、FAQ の行だけは開閉できることを示す手掛かりが必要なので、白 8% の細線を引いている。ここだけの例外。

**動きを減らす設定** — `prefers-reduced-motion: reduce` では、パーティクル場は整列後の1フレームだけを描いて停止し、出現アニメーションと数値の演出も止まる。

## 確認済みのこと

- `npm run audit` で違反 0 件・JSエラー 0 件（1440×900 / 390×844）
- キーボードのみで全操作が可能。フォーカスリングはバイオレット
- JavaScript を切っても内容はすべて読める（FAQ は `<details>`）
- 初期表示の転送量は約 8KB（HTML 28KB、JS 4KB gzip、CSS 6KB）＋ フォント
