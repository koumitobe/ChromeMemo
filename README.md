# ChromeMemo

Chrome拡張機能として動作する、サイドバー型のメモアプリです。ブラウザを使いながらページを離れることなくメモを記録・管理できます。

---

## 主な機能

- **サイドバー表示** — ショートカットキー（`Cmd+M` / `Alt+M`）またはツールバーアイコンで開閉
- **メモの作成・編集・削除** — タイトル・本文・タグを管理
- **タグ機能** — タグによるフィルタリング
- **ピン留め** — 重要なメモを一覧の上部に固定
- **Markdownプレビュー** — 本文をMarkdown記法で記述してプレビュー表示
- **キーワード検索** — タイトル・本文・タグをリアルタイム検索
- **URL挿入** — 現在閲覧中のページのURLをワンクリックで挿入
- **テンプレート** — 定型文を登録してカーソル位置に挿入
- **ダークモード** — ライト/ダーク切替対応
- **エクスポート / インポート** — JSONファイルでのバックアップ・移行
- **Undo / Redo** — `Cmd+Z` / `Cmd+Shift+Z` によるテキスト編集の取り消し・やり直し

---

## インストール

Chrome Web Storeは使用せず、ローカルファイルから読み込みます。

1. このリポジトリをクローンまたはZIPダウンロードして解凍
2. Chromeで `chrome://extensions` を開く
3. 右上の「**デベロッパーモード**」をオンにする
4. 「**パッケージ化されていない拡張機能を読み込む**」をクリック
5. リポジトリ内の `src/` フォルダを選択

詳細は [docs/manual/install.md](docs/manual/install.md) を参照してください。

---

## 使い方

| 操作 | 方法 |
|------|------|
| サイドバーを開く/閉じる | `Cmd+M`（Mac） / `Alt+M`（Windows） |
| 新規メモ | サイドバー内「＋ 新規メモ」ボタン |
| メモを保存 | 「保存」ボタン（自動保存あり） |
| Undo / Redo | `Cmd+Z` / `Cmd+Shift+Z` |

詳細は [docs/manual/usage.md](docs/manual/usage.md) を参照してください。

---

## ディレクトリ構成

```
ChromeMemo/
├── src/
│   ├── manifest.json          # 拡張機能の設定ファイル
│   ├── background/
│   │   └── service-worker.js  # バックグラウンド処理
│   ├── content/
│   │   └── content.js         # サイドバーUI・メモ管理のメイン実装
│   ├── markdown/
│   │   └── markdown.js        # Markdownパーサー
│   ├── storage/
│   │   └── storage.js         # chrome.storage.local ラッパー
│   └── icons/
├── docs/
│   └── manual/
│       ├── install.md         # インストール手順
│       └── usage.md           # 操作マニュアル
└── specs/
    ├── requirements/          # 要件定義書
    └── design/                # 設計仕様書
```

---

## データについて

- メモは `chrome.storage.local` に保存されます
- Chromeの「閲覧データを消去」を実行するとメモも削除されます（事前にエクスポート推奨）
- 別PCへの移行はエクスポート → インポートで行えます
