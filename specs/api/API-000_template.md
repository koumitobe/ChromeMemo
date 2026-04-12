# API仕様書

> **ファイル**: `specs/api/API-001_<resource-name>.md`
> **バージョン**: v1
> **ベースURL**: `https://api.example.com/v1`
> **認証方式**: Bearer Token (JWT)

---

## エンドポイント一覧

| メソッド | パス | 説明 | 認証 |
|--------|------|------|------|
| GET | /resources | 一覧取得 | 必須 |
| GET | /resources/:id | 詳細取得 | 必須 |
| POST | /resources | 新規作成 | 必須 |
| PUT | /resources/:id | 更新 | 必須 |
| DELETE | /resources/:id | 削除 | 必須 |

---

## GET /resources — 一覧取得

### リクエスト

**クエリパラメータ**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| page | integer | - | 1 | ページ番号 |
| per_page | integer | - | 20 | 1ページあたり件数（max: 100）|
| sort | string | - | created_at | ソートキー |
| order | string | - | desc | asc / desc |

### レスポンス

**200 OK**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "meta": {
    "total": 100,
    "page": 1,
    "per_page": 20
  }
}
```

---

## POST /resources — 新規作成

### リクエスト

**ヘッダー**
```
Content-Type: application/json
Authorization: Bearer <token>
```

**ボディ**

```json
{
  "name": "string (required, max: 100)",
  "description": "string (optional, max: 1000)"
}
```

**バリデーションルール**

| フィールド | ルール |
|-----------|--------|
| name | 必須, 1〜100文字, 英数字・日本語・ハイフン |
| description | 任意, 最大1000文字 |

### レスポンス

**201 Created**

```json
{
  "data": {
    "id": "uuid",
    "name": "string",
    "description": "string",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

**400 Bad Request**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力値が正しくありません",
    "details": [
      {
        "field": "name",
        "message": "nameは必須です"
      }
    ]
  }
}
```

---

## エラーコード一覧

| コード | HTTPステータス | 説明 |
|-------|--------------|------|
| VALIDATION_ERROR | 400 | バリデーションエラー |
| UNAUTHORIZED | 401 | 認証エラー |
| FORBIDDEN | 403 | 権限エラー |
| NOT_FOUND | 404 | リソースが存在しない |
| CONFLICT | 409 | 競合（重複など） |
| INTERNAL_ERROR | 500 | サーバー内部エラー |

---

## 変更履歴

| 日付 | バージョン | 変更内容 |
|------|-----------|---------|
| YYYY-MM-DD | v1.0 | 初版 |
