# 仕様駆動開発テンプレート

ClaudeCodeによる仕様駆動開発のスターターテンプレートです。

---

## クイックスタート

```bash
# このテンプレートをコピーして新プロジェクトを開始
cp -r spec-driven-template/ my-new-project/
cd my-new-project/

# CLAUDE.mdのプロジェクト情報を更新
# .env.exampleを.envにコピーして設定
cp .env.example .env
```

---

## 開発フロー

```
1. 要件定義（specs/requirements/）
   └─ PRD-XXX_feature-name.md を作成

2. 設計（specs/design/ + specs/api/）
   ├─ DS-XXX_feature-name.md を作成
   └─ API-XXX_resource-name.md を作成

3. タスク分割（tasks/）
   └─ /task-create コマンドでタスクファイル作成

4. 実装（src/）
   └─ 仕様に従って実装

5. テスト（tests/）
   └─ 受け入れ条件に対応するテストを作成

6. 整合性チェック
   └─ /spec-check で仕様と実装のズレを確認
```

---

## ディレクトリ構成

| パス | 役割 |
|------|------|
| `CLAUDE.md` | AIへの行動指針・プロジェクトルール |
| `.claude/commands/` | カスタムスラッシュコマンド定義 |
| `.claude/skills/` | 再利用可能なAIスキル定義 |
| `.claude/settings.json` | ClaudeCodeの権限設定 |
| `specs/requirements/` | 要件定義書（PRD） |
| `specs/design/` | 設計仕様書 |
| `specs/api/` | API仕様書 |
| `specs/changelog/` | 仕様変更履歴 |
| `docs/adr/` | アーキテクチャ決定記録 |
| `docs/architecture.md` | システム構成図 |
| `tasks/` | タスク・進捗管理 |
| `.env.example` | 環境変数テンプレート |

---

## カスタムコマンド

| コマンド | 説明 |
|---------|------|
| `/spec-check` | 実装と仕様の整合性チェック |
| `/task-create` | タスクファイルの新規作成 |
| `/adr-new` | ADRの新規作成 |

---

## 番号体系

### PRD（要件定義書）
`PRD-001_feature-name.md` — 連番

### DS（設計書）
`DS-001_feature-name.md` — PRDと対応した番号

### API仕様
`API-001_resource-name.md` — 連番

### ADR
- ADR-001〜099: インフラ・基盤
- ADR-100〜199: アーキテクチャ
- ADR-200〜299: 技術選定
- ADR-300〜399: プロセス
