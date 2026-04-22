# 設計仕様書

> **ファイル**: `specs/design/DS-001_chrome-memo-extension.md`
> **対応PRD**: PRD-001
> **ステータス**: Review
> **作成日**: 2026-04-20
> **最終更新**: 2026-04-20

---

## 1. アーキテクチャ概要

Chrome拡張機能（Manifest V3）として実装する。
Content ScriptがDOMにサイドバーを注入し、chrome.storage.localでデータを永続化する。

```
┌─────────────────────────────────────────────────────┐
│  Chrome ブラウザ                                      │
│                                                     │
│  ┌──────────────┐    ┌──────────────────────────┐   │
│  │  background  │    │   content script          │   │
│  │  (SW)        │◄──►│   + sidebar UI (Shadow DOM)│  │
│  │              │    │                            │   │
│  │ ショートカット │    │  ┌────────────────────┐   │   │
│  │ コマンド処理  │    │  │  サイドバーパネル    │   │   │
│  └──────┬───────┘    │  │  - メモ一覧          │   │   │
│         │            │  │  - 検索・タグフィルタ │   │   │
│  ┌──────▼───────┐    │  │  - メモ編集          │   │   │
│  │chrome.storage│    │  └────────────────────┘   │   │
│  │  .local      │    └──────────────────────────┘   │
│  └──────────────┘                                   │
└─────────────────────────────────────────────────────┘
```

---

## 2. ファイル構成

```
ChromeMemo/
├── src/
│   ├── manifest.json          # 拡張機能設定（Manifest V3）
│   ├── background/
│   │   └── service-worker.js  # ショートカット処理・メッセージルーティング
│   ├── content/
│   │   ├── content.js         # サイドバー注入・イベント制御
│   │   └── content.css        # サイドバー本体のスタイル
│   ├── sidebar/
│   │   ├── sidebar.html       # サイドバーのHTML（Shadow DOM内）
│   │   ├── sidebar.js         # メモ管理ロジック・UI制御
│   │   └── sidebar.css        # サイドバーUIスタイル
│   ├── popup/
│   │   ├── popup.html         # ツールバーアイコンクリック時のポップアップ
│   │   └── popup.js           # 設定・エクスポート/インポート操作
│   ├── storage/
│   │   └── storage.js         # chrome.storage.local の読み書きラッパー
│   ├── markdown/
│   │   └── markdown.js        # Markdownパーサー（marked.jsを利用）
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── docs/
│   └── manual/
│       ├── install.md         # インストール手順
│       └── usage.md           # 操作マニュアル
└── specs/                     # 仕様書（このファイル含む）
```

---

## 3. データモデル

### Memo オブジェクト

```json
{
  "id": "uuid-v4",
  "title": "メモタイトル",
  "body": "メモ本文（Markdown可）",
  "tags": ["仕事", "確認"],
  "pinned": false,
  "createdAt": "2026-04-20T09:00:00.000Z",
  "updatedAt": "2026-04-20T14:30:00.000Z"
}
```

### chrome.storage.local スキーマ

```json
{
  "chromememo_memos": [ /* Memo[] */ ],
  "chromememo_sidebar_open": false
}
```

---

## 4. コンポーネント設計

### 4-1. service-worker.js
- `chrome.commands.onCommand` でショートカットを受信し、アクティブタブのcontent scriptへメッセージを送信

### 4-2. content.js
- ページロード時にサイドバーのiframe（またはShadow DOM）をDOMに追加
- `chrome.runtime.onMessage` でサービスワーカーからの開閉命令を受信
- サイドバーの表示状態を `chrome.storage.local` に保存

### 4-3. sidebar.js（メイン処理）
| 関数 | 役割 |
|------|------|
| `loadMemos()` | storageからメモ一覧を読み込む |
| `saveMemos()` | メモ一覧をstorageに書き込む |
| `renderMemoList()` | メモ一覧をDOMに描画（ピン留め→通常の順） |
| `renderMemoDetail()` | メモ詳細・編集フォームを描画 |
| `createMemo()` | 新規メモを作成してsaveする |
| `updateMemo()` | メモを更新してsaveする |
| `deleteMemo()` | メモを削除してsaveする |
| `filterMemos()` | 検索・タグ絞り込みを適用 |
| `insertCurrentUrl()` | 現在タブのURLをカーソル位置に挿入 |
| `toggleMarkdownPreview()` | 編集/プレビューモードを切り替え |

### 4-4. popup.js
| 機能 | 説明 |
|------|------|
| エクスポート | 全メモをJSONファイルとしてダウンロード |
| インポート | JSONファイルを選択し、既存メモにマージ |

---

## 5. UIレイアウト

```
┌──────────────────────────────┐
│  📝 ChromeMemo          [×]  │  ← ヘッダー（閉じるボタン）
├──────────────────────────────┤
│  🔍 [検索ボックス          ]  │  ← 検索
│  🏷 [全て] [仕事] [確認]...  │  ← タグフィルター
│  [＋ 新規メモ]               │  ← 新規作成ボタン
├──────────────────────────────┤
│  📌 ピン留め                  │
│  ┌────────────────────────┐  │
│  │ 📌 重要タスク           │  │
│  │ #仕事  2026/04/20 14:30 │  │
│  └────────────────────────┘  │
│                              │
│  メモ一覧                    │
│  ┌────────────────────────┐  │
│  │ ミーティングメモ        │  │
│  │ #確認  2026/04/20 10:00 │  │
│  └────────────────────────┘  │
├──────────────────────────────┤
│  メモ編集エリア               │
│  [タイトル入力              ] │
│  [本文入力（Markdown可）    ] │
│  [🔗 URLを挿入] [👁 プレビュー]│
│  タグ: [#仕事] [＋追加]      │
│  [保存]          [削除]      │
└──────────────────────────────┘
```

---

## 6. キーボードショートカット設定

`manifest.json` の `commands` セクションで定義する。

```json
"commands": {
  "_execute_action": {
    "suggested_key": {
      "mac": "Command+M",
      "default": "Alt+M"
    },
    "description": "ChromeMemoサイドバーを開閉する"
  }
}
```

---

## 7. 技術選定

| 技術 | 選定理由 |
|------|---------|
| Manifest V3 | Chromeの標準仕様（V2は廃止予定） |
| Shadow DOM | ページ側のCSSとの衝突を防ぐ |
| marked.js (CDN不使用・バンドル) | 軽量なMarkdownパーサー、外部通信不要 |
| crypto.randomUUID() | ブラウザ標準APIでUUID生成（外部依存なし） |
| Vanilla JS | フレームワーク不使用・軽量・依存関係ゼロ |

---

## 8. 変更履歴

| 日付 | 変更者 | 変更内容 |
|------|--------|---------|
| 2026-04-20 | koumitobe | 初版作成 |
