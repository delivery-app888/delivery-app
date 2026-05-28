# CLAUDE.md — 配達ログアプリ プロジェクト指示書

## プロジェクト概要

フードデリバリー配達員向けの稼働記録・分析PWAアプリ。
Claude.aiアーティファクト上で開発したReact JSXアプリをPWAに変換し、段階的に機能を追加する。

## ターゲットユーザー

- 40代後半〜60代、ITリテラシー普通、堅実・コツコツ型
- フードデリバリーの副業で月5〜20万円を目指す人
- 分析が苦手な人でも直感的に使えるUIが必要

## 技術スタック

- **フロントエンド**: React 18（Vite）
- **スタイリング**: インラインスタイル（CSS-in-JS）、Tailwind不使用
- **グラフ**: Recharts
- **地図**: Leaflet + OpenStreetMap（フェーズ2で実装）
- **データ保存**: IndexedDB（Dexie.jsラッパー推奨）
- **GPS**: navigator.geolocation
- **天気**: Open-Meteo API（無料、APIキー不要）
- **ホスティング**: GitHub Pages or Cloudflare Pages
- **課金**: Stripe Checkout（将来）
- **フォント**: 'Hiragino Sans', 'Noto Sans JP', sans-serif

## ファイル構成

```
/
├── CLAUDE.md              ← このファイル（プロジェクト指示書）
├── ROADMAP.md             ← 事業計画・機能ロードマップ
├── src/
│   ├── App.jsx            ← メインアプリ（元のdelivery_log_app.jsx）
│   ├── main.jsx           ← エントリーポイント
│   ├── db.js              ← IndexedDBラッパー（window.storageから移行）
│   ├── themes.js          ← DARK/LIGHTテーマ定数
│   ├── constants.js       ← 天候・会社・注文タイプ等の定数
│   ├── utils.js           ← 日時フォーマット、計算ユーティリティ
│   ├── components/        ← 将来的にコンポーネント分割
│   └── assets/            ← アイコン等
├── public/
│   ├── index.html
│   ├── manifest.json      ← PWAマニフェスト
│   ├── sw.js              ← Service Worker
│   ├── icon-192.png       ← PWAアイコン
│   └── icon-512.png       ← PWAアイコン
├── package.json
└── vite.config.js
```

## PWA化の作業手順

### ステップ1: プロジェクト初期化
1. Vite + React プロジェクトを作成
2. package.json に依存関係を追加（react, recharts, dexie, leaflet）
3. 元のdelivery_log_app.jsx を src/App.jsx に配置

### ステップ2: window.storage → IndexedDB 移行
- 現在のアプリは `window.storage.get/set/delete/list` を使用
- これをIndexedDB（Dexie.js）に置き換える
- キー構造は同じ: `log:YYYY-MM-DD`, `all-logs-index`, `monthly-goal`, `app-settings`
- データ構造は変更しない

### ステップ3: PWAマニフェスト + Service Worker
- manifest.json: name, short_name, theme_color, background_color, icons, start_url, display: "standalone"
- Service Worker: キャッシュファースト戦略（App Shell）
- オフラインで完全動作すること

### ステップ4: GPS実装
- 受注ボタン押下時: `navigator.geolocation.getCurrentPosition()` で座標取得 → `startLat, startLng`
- 配達完了時: 同様に → `endLat, endLng`
- GPS取得失敗時はnullのまま保存（エラーで止めない）
- ユーザーに位置情報許可を求めるのは初回受注時のみ

### ステップ5: 気象API連携
- Open-Meteo API: `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}&current_weather=true`
- GPS取得後に自動呼び出し
- レスポンスから temperature, weathercode, windspeed を取得
- 天候ゲートの手動選択と併用（API結果は参考データとして保存）

### ステップ6: MAP機能（Leaflet + OpenStreetMap）
- デイリーレポートに当日のマップ表示（無料）
- ピンの色分け: 🟡good(#EAB308) / ⚪normal(#9CA3AF) / 🔵bad(#3B82F6) / 🔴cancelled(#EF4444)
- プレミアム: 全期間表示 + 時間帯/曜日/会社/評価フィルター

## 重要な設計ルール

### UIルール
- 最小フォントサイズ: 標準モード9px、大きめモード13px
- ボタン高さ: 通常54px、受注/配達完了65px
- 最大幅: 430px（スマホ想定）
- 色: ダークモード基準で設計、ライトモードはコントラスト調整
- 円グラフ: タッチ選択無効（pointerEvents: none, activeIndex: -1）
- グラフアニメーション: 画面遷移時に1回だけ、1.5秒後に停止

### データルール
- 全データはユーザーの端末内に閉じる（外部送信しない）
- deliveryオブジェクトの構造を変更しない（フィールド追加のみ）
- 日付キーは `YYYY-MM-DD` 形式
- 保存はデータ変更後300msデバウンスで自動保存

### マネタイズルール
- 記録機能は全て無料（制限しない）
- 分析の「過去データ」がプレミアム
- MAPの「過去ピン」がプレミアム
- デイリーレポート（当日のみ）は無料
- プレミアム画面はblur(3px)でチラ見せ
- isPremium フラグ1つで全画面の有料/無料を制御

### セキュリティルール
- GPS座標はローカルのみに保存
- 外部APIへの送信は緯度経度のみ（個人特定不可）
- プライバシーポリシーを用意すること

## 現在のアプリの状態

- `src/App.jsx` (元 delivery_log_app.jsx) が全機能を1ファイルに含む
- 約1400行のReact関数コンポーネント
- `window.storage` APIに依存（PWA化でIndexedDBに移行が必要）
- Rechartsのimportあり
- isPremium は useState(false) でハードコード中
- デモデータ生成機能あり（本番前に削除予定）

## コマンドメモ

```bash
# 開発サーバー起動
npm run dev

# ビルド
npm run build

# プレビュー
npm run preview

# GitHub Pagesデプロイ
npm run build && npx gh-pages -d dist
```

## 参考リンク

- Open-Meteo API: https://open-meteo.com/en/docs
- Leaflet: https://leafletjs.com/
- OpenStreetMap: https://www.openstreetmap.org/
- Dexie.js: https://dexie.org/
- Recharts: https://recharts.org/
- Stripe: https://stripe.com/docs

---

## セッション開始時のルール

作業を始める前に、まず以下のファイルを読み込んで内容を把握すること：
- thinking-style.md（私の考え方・判断基準・好み）
- このプロジェクトで使うAIツールのノウハウファイル（あれば）

これらの内容を踏まえた上で、作業や提案を行うこと。

---

## コンテキスト自動更新ルール

### 更新のタイミング
以下のいずれかのタイミングで、自動的にコンテキスト更新を実行すること：
- 私が「終わり」「おわり」「ありがとう」「お疲れ」「今日はここまで」と言ったとき
- 長い作業セッションの途中で大きな区切りがついたとき（こちらから提案してよい）

更新が完了したら、以下のコマンドを順番に実行してmy-context/の内容をGitHubにセーブすること：

    cd ~/Dev/my-context
    git add .
    git commit -m "コンテキスト更新"
    git push

### 更新対象ファイル
以下のファイルに該当する発見があれば更新すること：

- thinking-style.md：19項目の観点で自分について新たにわかったこと（詳細は下記）
- kling-tips.md：Klingに関する失敗・成功・コツ
- midjourney-tips.md：Midjourneyに関する失敗・成功・コツ
- chatgpt-tips.md：ChatGPTに関する使い方・プロンプトのコツ
- remotion-tips.md：Remotionに関するコード・設定・エラー対処のコツ
- ai-workflows.md：ツール間の連携に関する発見
- 上記以外でも、my-context/ 内に該当するファイルがあれば更新すること

### 更新の共通ルール
- すでに記載済みの内容は追記せず、より正確な表現があれば更新する
- 更新した場合は、何を追加・変更したか簡潔に報告する
- 各ファイルが200行を超えた場合、追記の前に以下を実施すること：
  - 古くなった情報や、より新しい記録で上書きされた内容を削除
  - 似た内容を統合・圧縮
  - 具体例が3つ以上ある項目は、傾向の要約に置き換える
  - 圧縮後も200行を超える場合はそのまま追記してよい

### thinking-style.md の抽出観点（19項目）

**第1層：自分は誰か**
1. 判断基準：何を優先し、何を後回しにしたか
2. 美意識：コード・デザイン・命名などで何を「良い」と感じたか
3. 不快・拒否反応：嫌がったこと、却下したこと、その理由
4. 思考プロセス：問題にどう取り組んだか
5. コミュニケーション：指示の出し方の特徴、曖昧にした部分と明確にした部分
6. 学習スタイル：何で理解が進み、何でつまずいたか
7. 目標・ビジョン：この作業の先に何を実現しようとしているか
8. ツールの使い方：どの道具をどう使ったか、こだわり
9. 制約・環境：マシンスペック、時間、予算など変化した事実

**第2層：自分はどう作るか**
10. 品質基準：「完成」の判断ライン、チェック観点
11. テンプレート・型：繰り返し使ったコード構成、命名規則、ディレクトリ設計
12. 失敗パターン：やって後悔したこと、やり直しの原因
13. 成果物の届け先：誰向けか、相手のリテラシーや期待値
14. 意思決定の前例：「AとBで迷ってAを選んだ」の記録と理由
15. ワークフロー：作業順序の癖
16. 外部依存：使ったライブラリ、API、サービスと選定理由
17. 言語・トーン：コメント、ドキュメント、コミットメッセージのスタイル
18. スケール感覚：「簡素でいい」と「設計する」の境界線

**第3層：ビジネス判断**
19. ビジネス判断基準：収益性・コスト・納期のバランス、投資判断の傾向

### AIツールノウハウの記録フォーマット
AIツール関連ファイル（kling-tips.md、midjourney-tips.md、chatgpt-tips.md、remotion-tips.md等）には
以下の形式で記録すること：

- 失敗したプロンプトと、なぜ失敗したか
- 修正後のプロンプトと、何を変えたら成功したか
- 発見した設定やパラメータのコツ
- 「この表現をするにはこう書く」という具体的なパターン
- 失敗→成功のペアで記録すると、次回最も役に立つ

---

## 大きな判断をするときのルール

デザインの方向性、技術選定、ビジネス戦略など
プロジェクトの方向を左右する大きな判断を求められた場合は、
以下の流れで回答すること：

1. 私のコンテキストを踏まえた提案をする
2. その提案をこのプロジェクトで採用した場合に考えられる
   デメリットやリスクがあれば、注釈として添える

※バグ修正、実装作業、軽微な判断などの日常作業では不要。

---

## セキュリティルール

- .env ファイルの中身を画面に表示したり、外部に送信したりしないこと
- APIキー、パスワード、トークンなどの機密情報をコードに直接書かないこと
- curl、wget、nc などの外部通信コマンドを使う前に必ず理由を説明すること
- 外部のURLにデータを送信する処理を書く場合は必ず事前に確認すること
- 知らないURLからのスクリプトを実行しないこと