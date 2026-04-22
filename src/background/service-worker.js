/**
 * バックグラウンドサービスワーカー
 * ツールバーアイコンのクリックをコンテンツスクリプトに中継する
 */

/** ツールバーアイコンクリック → アクティブタブのサイドバーをトグル */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
  } catch {
    // コンテンツスクリプト未注入のタブ（chrome://など）は無視
  }
});
