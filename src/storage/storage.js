/**
 * chrome.storage.local のラッパーモジュール
 * メモデータとサイドバー状態の読み書きを提供する
 */

const MEMOS_KEY = 'chromememo_memos';
const SIDEBAR_KEY = 'chromememo_sidebar_open';

/** メモ一覧を取得する */
async function getMemos() {
  const result = await chrome.storage.local.get(MEMOS_KEY);
  return result[MEMOS_KEY] || [];
}

/** メモ一覧を保存する */
async function saveMemos(memos) {
  await chrome.storage.local.set({ [MEMOS_KEY]: memos });
}

/** サイドバーの開閉状態を取得する */
async function getSidebarOpen() {
  const result = await chrome.storage.local.get(SIDEBAR_KEY);
  return result[SIDEBAR_KEY] || false;
}

/** サイドバーの開閉状態を保存する */
async function saveSidebarOpen(isOpen) {
  await chrome.storage.local.set({ [SIDEBAR_KEY]: isOpen });
}
