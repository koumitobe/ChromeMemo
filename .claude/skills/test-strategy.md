# Skill: テスト戦略

> 実装に対して適切なテストを設計・作成するためのガイドライン

## テストピラミッド

```
        [E2E]
       少数・低速
      クリティカルパスのみ
    
    [統合テスト]
   中程度・API/DB境界
  
[ユニットテスト]
多数・高速・ロジック中心
```

## テスト種別と対象

### ユニットテスト
- **対象**: 純粋関数、ビジネスロジック、バリデーション
- **カバレッジ目標**: 80%以上
- **命名規則**: `<テスト対象>_<条件>_<期待結果>`
- **ツール**: Jest / Vitest / pytest / etc.

```typescript
// 例
describe('calculateTax', () => {
  it('通常税率10%が正しく計算される', () => {
    expect(calculateTax(1000, 'normal')).toBe(100);
  });
  
  it('軽減税率8%が正しく計算される', () => {
    expect(calculateTax(1000, 'reduced')).toBe(80);
  });
  
  it('負の金額でエラーをスローする', () => {
    expect(() => calculateTax(-100, 'normal')).toThrow('金額は0以上である必要があります');
  });
});
```

### 統合テスト
- **対象**: APIエンドポイント、DB操作、外部サービス連携
- **方針**: テスト用DBを使用、実際のHTTPリクエストをテスト
- **ツール**: Supertest / pytest + httpx / etc.

```typescript
// 例
describe('POST /api/v1/users', () => {
  it('正常なリクエストで201を返す', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .send({ name: 'テストユーザー', email: 'test@example.com' });
    
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
  });
});
```

### E2Eテスト
- **対象**: クリティカルなユーザーフロー（ログイン、購入、etc.）
- **実行タイミング**: CI/CDのステージング環境
- **ツール**: Playwright / Cypress

## テスト作成の原則

1. **Arrange / Act / Assert** パターンを使う
2. 1テスト1アサーション（原則）
3. テストデータはファクトリー関数で生成する
4. モック・スタブは最小限にする（過剰なモックは設計の問題のサイン）
5. テストは独立して実行可能にする（順序依存を避ける）

## 仕様書との紐付け

テストコードに対応するPRDの受け入れ条件を記載する:

```typescript
// PRD-001 FR-001: ユーザーが正しい認証情報でログインできる
it('正しいメールアドレスとパスワードでJWTトークンを返す', () => {
  // ...
});
```
