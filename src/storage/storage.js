/**
 * chrome.storage.local のラッパーモジュール
 * メモデータとサイドバー状態の読み書きを提供する
 */

const MEMOS_KEY = 'chromememo_memos';
const SIDEBAR_KEY = 'chromememo_sidebar_open';

/** 拡張機能コンテキストが有効かチェックする */
function isContextValid() {
  return !!chrome.runtime?.id;
}

/** メモ一覧を取得する */
async function getMemos() {
  if (!isContextValid()) return [];
  try {
    const result = await chrome.storage.local.get(MEMOS_KEY);
    return result[MEMOS_KEY] || [];
  } catch { return []; }
}

/** メモ一覧を保存する */
async function saveMemos(memos) {
  if (!isContextValid()) return;
  try {
    await chrome.storage.local.set({ [MEMOS_KEY]: memos });
  } catch { /* コンテキスト無効時は無視 */ }
}

/** サイドバーの開閉状態を取得する */
async function getSidebarOpen() {
  if (!isContextValid()) return false;
  try {
    const result = await chrome.storage.local.get(SIDEBAR_KEY);
    return result[SIDEBAR_KEY] || false;
  } catch { return false; }
}

/** サイドバーの開閉状態を保存する */
async function saveSidebarOpen(isOpen) {
  if (!isContextValid()) return;
  try {
    await chrome.storage.local.set({ [SIDEBAR_KEY]: isOpen });
  } catch { /* コンテキスト無効時は無視 */ }
}
