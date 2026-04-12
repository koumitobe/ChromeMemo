# /task-create — タスクファイル作成

## 目的
新しいタスクを構造化されたMarkdownファイルとして作成する。

## 使い方

```
/task-create <タスクの概要を一言で>
```

## 実行手順

1. ユーザーにタスクの詳細をヒアリングする:
   - 関連する仕様書（PRD番号、DS番号）
   - 見積もり時間
   - 依存タスク

2. `tasks/YYYYMMDD_<kebab-case-name>.md` を作成する
   - YYYYMMDDは今日の日付
   - ファイル名はタスク概要をkebab-caseに変換

3. `tasks/YYYYMMDD_template.md` をベースにチェックリストを生成する

4. 関連仕様書へのリンクを追記する

## 出力例

```
タスクファイルを作成しました: tasks/20240115_implement-login-api.md

関連仕様:
- specs/requirements/PRD-001_auth.md
- specs/design/DS-001_auth.md
- specs/api/API-001_auth.md

作業を開始する場合は「/task-start 20240115_implement-login-api」を実行してください。
```
