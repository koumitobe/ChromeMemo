/**
 * シンプルなMarkdownパーサー
 * 対応: 見出し / 太字・斜体 / リスト / コードブロック / インラインコード / リンク / 水平線
 */
function parseMarkdown(text) {
  if (!text) return '';

  /** HTML特殊文字をエスケープする（XSS対策） */
  const esc = s => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // コードブロックとインラインコードを一時保護
  const saved = [];
  const protect = html => { saved.push(html); return `\x00${saved.length - 1}\x00`; };

  text = text.replace(/```([\s\S]*?)```/g, (_, c) =>
    protect(`<pre><code>${esc(c.trim())}</code></pre>`));
  text = text.replace(/`([^`]+)`/g, (_, c) => protect(`<code>${esc(c)}</code>`));

  // 残りのテキストをエスケープ
  text = esc(text);

  // 見出し・水平線（ブロック要素）
  text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  text = text.replace(/^---$/gm, '<hr>');

  // インライン要素
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/\[(.+?)\]\((https?:\/\/[^)]+)\)/g,
    (_, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);

  // リストと改行を行単位で処理
  const lines = text.split('\n');
  const out = [];
  let inList = false;
  for (const line of lines) {
    const listMatch = line.match(/^[*-] (.+)$/);
    if (listMatch) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${listMatch[1]}</li>`);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      if (!line.trim() || /^<(h[123]|hr)/.test(line)) {
        out.push(line);
      } else {
        out.push(line + '<br>');
      }
    }
  }
  if (inList) out.push('</ul>');

  // 保護したコードブロックを復元
  return out.join('').replace(/\x00(\d+)\x00/g, (_, i) => saved[+i]);
}
