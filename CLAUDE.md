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
