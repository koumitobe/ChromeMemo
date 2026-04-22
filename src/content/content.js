/**
 * ChromeMemo コンテンツスクリプト
 * Shadow DOMでサイドバーを注入し、メモの管理UIを提供する
 */
(function () {
  if (document.getElementById('chromememo-host')) return;

  const DEFAULT_WIDTH = 320;
  const MIN_WIDTH = 240;
  const MAX_WIDTH = 600;
  const DEFAULT_TEMPLATES = [
    { id: 'tpl-daily',   name: '📅 日報',        content: '## 日報\n\n### 本日の作業\n- \n\n### 明日の予定\n- \n\n### 課題・連絡事項\n- ' },
    { id: 'tpl-minutes', name: '📝 議事録',       content: '## 議事録\n\n**日時**: \n**参加者**: \n**場所**: \n\n---\n\n### 議題\n1. \n\n### 決定事項\n- \n\n### 次回アクション\n| 担当 | 内容 | 期限 |\n|------|------|------|\n|  |  |  |' },
    { id: 'tpl-tasks',   name: '✅ タスクリスト', content: '## タスクリスト\n\n- [ ] \n- [ ] \n- [ ] \n\n### 完了\n- [x] ' },
    { id: 'tpl-blank',   name: '🗒 シンプルメモ', content: '## タイトル\n\n' },
  ];

  // ========== 状態 ==========
  let memos = [], currentId = null, activeTag = null, searchQuery = '';
  let isPreview = false, isOpen = false, sidebarWidth = DEFAULT_WIDTH;
  let shadow, isDark = false, customTemplates = [], editingTemplateId = null;
  let autoSaveTimer = null;
  let undoStack = [], redoStack = [];
  let isSaving = false; // 自タブ保存中フラグ（他タブからの onChanged と区別する）
  let isDirty = false;  // 編集中フラグ（未保存の変更があるか）

  // ========== Shadow DOM セットアップ ==========
  function buildHost() {
    const host = document.createElement('div');
    host.id = 'chromememo-host';
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = getStyles();
    shadow.appendChild(style);

    const tmpl = document.createElement('template');
    tmpl.innerHTML = getSidebarHTML().trim();
    shadow.appendChild(tmpl.content.cloneNode(true));

    setSidebarWidth(sidebarWidth);

    // バブルフェーズでキーイベントをページに伝播させない
    // Cmd/Ctrl系ショートカット（Undo/Redo等）はブラウザに通過させる
    ['keydown', 'keyup', 'keypress'].forEach(t =>
      host.addEventListener(t, e => {
        if (e.metaKey || e.ctrlKey) return;
        e.stopPropagation();
      }));
  }

  function $(id) { return shadow.getElementById(id); }

  // ========== サイドバー開閉 ==========
  function toggleSidebar() { isOpen ? closeSidebar() : openSidebar(); }

  function openSidebar() {
    isOpen = true;
    $('sidebar').classList.add('open');
    saveSidebarOpen(true);
    renderList();
  }

  function closeSidebar() {
    isOpen = false;
    $('sidebar').classList.remove('open');
    saveSidebarOpen(false);
  }

  function setSidebarWidth(w) {
    sidebarWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));
    $('sidebar').style.width = sidebarWidth + 'px';
  }

  // ========== メモ一覧の描画 ==========
  function renderList() {
    updateTagButtons();
    const filtered = getFilteredMemos();
    const list = $('memo-list');

    if (filtered.length === 0) {
      list.innerHTML = `<div class="empty-state">📝 メモがありません</div>`;
      return;
    }

    const pinned = filtered.filter(m => m.pinned);
    const normal = filtered.filter(m => !m.pinned);
    let html = '';
    if (pinned.length > 0) {
      html += `<div class="section-label">📌 ピン留め</div>`;
      pinned.forEach(m => { html += memoItemHTML(m); });
    }
    if (normal.length > 0) {
      if (pinned.length > 0) html += `<div class="section-label">メモ</div>`;
      normal.forEach(m => { html += memoItemHTML(m); });
    }
    list.innerHTML = html;

    list.querySelectorAll('.memo-item').forEach(el =>
      el.addEventListener('click', () => openDetail(el.dataset.id)));
    list.querySelectorAll('.pin-btn').forEach(el =>
      el.addEventListener('click', e => { e.stopPropagation(); togglePin(el.dataset.id); }));
    list.querySelectorAll('.list-delete-btn').forEach(el =>
      el.addEventListener('click', e => { e.stopPropagation(); deleteFromList(el.dataset.id); }));
  }

  function memoItemHTML(memo) {
    const tagsHTML = memo.tags.map(t => `<span class="memo-tag">${escapeHtml(t)}</span>`).join('');
    const preview = (memo.body || '').replace(/[#*`\[\]]/g, '').slice(0, 55);
    const pinClass = memo.pinned ? 'pinned' : '';
    const selClass = memo.id === currentId ? 'selected' : '';
    return `
      <div class="memo-item ${selClass}" data-id="${memo.id}">
        <div class="memo-item-title">${escapeHtml(memo.title || '（タイトルなし）')}</div>
        <div class="memo-item-preview">${escapeHtml(preview)}</div>
        <div class="memo-item-footer">
          <div class="memo-tags">${tagsHTML}</div>
          <span class="memo-date">${formatDate(memo.updatedAt)}</span>
        </div>
        <div class="memo-item-actions">
          <button class="pin-btn ${pinClass}" data-id="${memo.id}" title="ピン留め">📌</button>
          <button class="list-delete-btn" data-id="${memo.id}" title="削除">🗑</button>
        </div>
      </div>`;
  }

  // ========== メモ詳細 ==========
  function openDetail(id) {
    currentId = id;
    const memo = memos.find(m => m.id === id);
    if (!memo) return;

    isPreview = false;
    isDirty = false;
    $('sync-banner').classList.add('hidden');
    $('memo-title-input').value = memo.title;
    $('memo-body-input').value = memo.body;
    undoStack = [{ v: memo.body, s: 0, e: 0 }]; redoStack = [];
    $('memo-body-input').classList.remove('split-mode');
    $('memo-body-input').removeEventListener('input', onLivePreview);
    $('memo-preview-area').classList.remove('visible');
    $('preview-btn').classList.remove('active');
    $('memo-meta-info').textContent = `作成: ${formatDate(memo.createdAt)}　更新: ${formatDate(memo.updatedAt)}`;
    $('last-saved-time').textContent = `保存 ${formatTime(memo.updatedAt)}`;

    renderTagEditor(memo.tags);
    showDetail(true);
    renderList();
  }

  function showDetail(visible) {
    $('memo-list-view').style.display = visible ? 'none' : 'flex';
    $('detail').classList.toggle('visible', visible);
  }

  function renderTagEditor(tags) {
    const area = $('tag-editor');
    const chips = tags.map(t => `
      <span class="tag-chip">${escapeHtml(t)}
        <button class="tag-remove" data-tag="${escapeHtml(t)}">×</button>
      </span>`).join('');
    area.innerHTML = chips + `<input id="tag-add-input" placeholder="タグを追加" maxlength="20">`;
    area.querySelectorAll('.tag-remove').forEach(btn =>
      btn.addEventListener('click', () => removeTag(btn.dataset.tag)));
    const inp = $('tag-add-input');
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(inp.value); }
    });
    inp.addEventListener('blur', () => { if (inp.value.trim()) addTag(inp.value); });
  }

  // ========== ストレージ保存ラッパー ==========
  async function saveMemosLocal(data) {
    isSaving = true;
    await saveMemos(data);
    // onChanged は非同期で発火するため、次のイベントループで解除
    setTimeout(() => { isSaving = false; }, 0);
  }

  // ========== メモ操作 ==========
  async function createMemo() {
    const memo = {
      id: crypto.randomUUID(), title: '', body: '', tags: [], pinned: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    memos.unshift(memo);
    await saveMemosLocal(memos);
    openDetail(memo.id);
  }

  async function saveMemo() {
    const memo = memos.find(m => m.id === currentId);
    if (!memo) return;
    memo.title = $('memo-title-input').value;
    memo.body = $('memo-body-input').value;
    memo.updatedAt = new Date().toISOString();
    await saveMemosLocal(memos);
    isDirty = false;
    $('sync-banner').classList.add('hidden');
    $('memo-meta-info').textContent = `作成: ${formatDate(memo.createdAt)}　更新: ${formatDate(memo.updatedAt)}`;
    $('last-saved-time').textContent = `保存 ${formatTime(memo.updatedAt)}`;
    renderList();
  }

  async function deleteMemo() {
    if (!confirm('このメモを削除しますか？')) return;
    memos = memos.filter(m => m.id !== currentId);
    await saveMemosLocal(memos);
    currentId = null;
    showDetail(false);
    renderList();
  }

  async function deleteFromList(id) {
    const title = memos.find(m => m.id === id)?.title || 'タイトルなし';
    if (!confirm(`「${title}」を削除しますか？`)) return;
    memos = memos.filter(m => m.id !== id);
    if (currentId === id) currentId = null;
    await saveMemosLocal(memos);
    renderList();
  }

  async function togglePin(id) {
    const memo = memos.find(m => m.id === id);
    if (!memo) return;
    memo.pinned = !memo.pinned;
    await saveMemosLocal(memos);
    renderList();
  }

  // ========== タグ操作 ==========
  function addTag(value) {
    const tag = value.trim().replace(/^#/, '');
    if (!tag) return;
    const memo = memos.find(m => m.id === currentId);
    if (!memo || memo.tags.includes(tag)) return;
    memo.tags.push(tag);
    renderTagEditor(memo.tags);
  }

  function removeTag(tag) {
    const memo = memos.find(m => m.id === currentId);
    if (!memo) return;
    memo.tags = memo.tags.filter(t => t !== tag);
    renderTagEditor(memo.tags);
  }

  // ========== フィルタ・検索 ==========
  function getFilteredMemos() {
    return memos.filter(memo => {
      const matchTag = !activeTag || memo.tags.includes(activeTag);
      const q = searchQuery.toLowerCase();
      const matchSearch = !q ||
        (memo.title || '').toLowerCase().includes(q) ||
        (memo.body || '').toLowerCase().includes(q) ||
        memo.tags.some(t => t.toLowerCase().includes(q));
      return matchTag && matchSearch;
    }).sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  }

  function updateTagButtons() {
    const allTags = [...new Set(memos.flatMap(m => m.tags))];
    const filter = $('tag-filter');
    let html = `<button class="tag-btn ${!activeTag ? 'active' : ''}" data-tag="">すべて</button>`;
    allTags.forEach(t => {
      html += `<button class="tag-btn ${activeTag === t ? 'active' : ''}" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`;
    });
    filter.innerHTML = html;
    filter.querySelectorAll('.tag-btn').forEach(btn =>
      btn.addEventListener('click', () => { activeTag = btn.dataset.tag || null; renderList(); }));
  }

  // ========== Markdownプレビュー ==========
  function togglePreview() {
    isPreview = !isPreview;
    const body = $('memo-body-input');
    const preview = $('memo-preview-area');
    const btn = $('preview-btn');
    if (isPreview) {
      // textareaは残したまま下にプレビューを表示（URL挿入・テンプレート挿入も引き続き使える）
      preview.innerHTML = parseMarkdown(body.value);
      preview.classList.add('visible');
      body.classList.add('split-mode');
      btn.classList.add('active');
      body.addEventListener('input', onLivePreview);
    } else {
      preview.classList.remove('visible');
      body.classList.remove('split-mode');
      btn.classList.remove('active');
      body.removeEventListener('input', onLivePreview);
    }
  }

  /** プレビューをリアルタイム更新する */
  function onLivePreview() {
    if (isPreview) $('memo-preview-area').innerHTML = parseMarkdown($('memo-body-input').value);
  }

  // ========== URL挿入（Cmd+Z対応） ==========
  function insertCurrentUrl() {
    const url = window.location.href;
    const textarea = $('memo-body-input');
    textarea.focus();
    const ok = document.execCommand('insertText', false, url);
    if (!ok) {
      const pos = textarea.selectionStart;
      textarea.value = textarea.value.slice(0, pos) + url + textarea.value.slice(textarea.selectionEnd);
      textarea.selectionStart = textarea.selectionEnd = pos + url.length;
    }
  }

  // ========== テンプレート ==========
  async function loadTemplates() {
    const result = await chrome.storage.local.get('chromememo_templates');
    customTemplates = result.chromememo_templates || DEFAULT_TEMPLATES.map(t => ({ ...t }));
  }

  async function saveTemplates(templates) {
    await chrome.storage.local.set({ chromememo_templates: templates });
  }

  function updateTemplateMenu() {
    const menu = $('template-menu');
    if (!menu) return;
    menu.innerHTML = customTemplates.length
      ? customTemplates.map(t =>
          `<div class="template-item" data-id="${escapeHtml(t.id)}">${escapeHtml(t.name)}</div>`).join('')
      : `<div class="template-empty">テンプレートがありません</div>`;
    menu.querySelectorAll('.template-item').forEach(el =>
      el.addEventListener('click', () => insertTemplate(el.dataset.id)));
  }

  function insertTemplate(id) {
    const tpl = customTemplates.find(t => t.id === id);
    if (!tpl) return;
    const textarea = $('memo-body-input');
    textarea.focus();

    // カーソル位置にテンプレートを挿入（既存テキストを保持）
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = textarea.value.substring(0, start) + tpl.content + textarea.value.substring(end);
    const newPos = start + tpl.content.length;
    textarea.value = newValue;
    textarea.setSelectionRange(newPos, newPos);

    // inputイベントが発火しないため手動でアンドゥスタックに積む
    undoStack.push({ v: newValue, s: newPos, e: newPos });
    if (undoStack.length > 200) undoStack.shift();
    redoStack = [];
    scheduleAutoSave();

    $('template-menu').classList.remove('visible');
  }

  function renderTemplateManager() {
    const container = $('template-manager');
    if (!container) return;

    if (editingTemplateId !== null) {
      const tpl = editingTemplateId === 'new'
        ? { name: '', content: '' }
        : customTemplates.find(t => t.id === editingTemplateId) || { name: '', content: '' };
      container.innerHTML = `
        <div class="tpl-edit-form">
          <input class="tpl-name-input" type="text" value="${escapeHtml(tpl.name)}" placeholder="テンプレート名">
          <textarea class="tpl-content-input" placeholder="テンプレート内容（Markdown対応）">${escapeHtml(tpl.content)}</textarea>
          <div class="tpl-edit-actions">
            <button class="tpl-save-btn">保存</button>
            <button class="tpl-cancel-btn">キャンセル</button>
          </div>
        </div>`;
      container.querySelector('.tpl-save-btn').addEventListener('click', saveTemplateEdit);
      container.querySelector('.tpl-cancel-btn').addEventListener('click', () => {
        editingTemplateId = null; renderTemplateManager();
      });
    } else {
      if (!customTemplates.length) {
        container.innerHTML = `<div class="tpl-empty">テンプレートがありません</div>`;
        return;
      }
      container.innerHTML = customTemplates.map(t => `
        <div class="tpl-item">
          <span class="tpl-name">${escapeHtml(t.name)}</span>
          <div class="tpl-btns">
            <button class="tpl-edit-btn" data-id="${escapeHtml(t.id)}">✏️</button>
            <button class="tpl-del-btn" data-id="${escapeHtml(t.id)}">🗑</button>
          </div>
        </div>`).join('');
      container.querySelectorAll('.tpl-edit-btn').forEach(btn =>
        btn.addEventListener('click', () => { editingTemplateId = btn.dataset.id; renderTemplateManager(); }));
      container.querySelectorAll('.tpl-del-btn').forEach(btn =>
        btn.addEventListener('click', () => deleteTemplate(btn.dataset.id)));
    }
  }

  async function saveTemplateEdit() {
    const container = $('template-manager');
    const name = container.querySelector('.tpl-name-input').value.trim();
    const content = container.querySelector('.tpl-content-input').value;
    if (!name) { alert('テンプレート名を入力してください'); return; }
    if (editingTemplateId === 'new') {
      customTemplates.push({ id: crypto.randomUUID(), name, content });
    } else {
      const tpl = customTemplates.find(t => t.id === editingTemplateId);
      if (tpl) { tpl.name = name; tpl.content = content; }
    }
    await saveTemplates(customTemplates);
    editingTemplateId = null;
    renderTemplateManager();
    updateTemplateMenu();
  }

  async function deleteTemplate(id) {
    if (!confirm('このテンプレートを削除しますか？')) return;
    customTemplates = customTemplates.filter(t => t.id !== id);
    await saveTemplates(customTemplates);
    renderTemplateManager();
    updateTemplateMenu();
  }

  // ========== ダークモード ==========
  async function loadDarkMode() {
    const result = await chrome.storage.local.get('chromememo_dark');
    isDark = result.chromememo_dark || false;
    applyDarkMode(isDark);
  }

  async function toggleDarkMode() {
    isDark = !isDark;
    await chrome.storage.local.set({ chromememo_dark: isDark });
    applyDarkMode(isDark);
    updateDarkModeBtn();
  }

  function applyDarkMode(dark) {
    document.getElementById('chromememo-host').classList.toggle('dark', dark);
  }

  function updateDarkModeBtn() {
    const btn = $('dark-mode-btn');
    if (!btn) return;
    btn.classList.toggle('on', isDark);
    btn.setAttribute('aria-pressed', String(isDark));
  }

  // ========== JSON エクスポート / インポート ==========
  function exportMemos() {
    const blob = new Blob([JSON.stringify({ version: '1.0', memos }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chromememo-backup-${formatDateFile()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importMemos(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const imported = data.memos || data;
      if (!Array.isArray(imported)) throw new Error('不正なフォーマット');
      let merged = 0, skipped = 0;
      for (const m of imported) {
        const existing = memos.find(e => e.id === m.id);
        if (existing) {
          if (confirm(`「${m.title || 'タイトルなし'}」は既に存在します。上書きしますか？`)) {
            Object.assign(existing, m); merged++;
          } else skipped++;
        } else { memos.push(m); merged++; }
      }
      await saveMemosLocal(memos);
      renderList();
      alert(`インポート完了: ${merged}件追加・更新、${skipped}件スキップ`);
    } catch (e) { alert(`インポートに失敗しました: ${e.message}`); }
  }

  // ========== リサイズ ==========
  function setupResize() {
    const handle = $('resize-handle');
    let startX, startW;
    handle.addEventListener('mousedown', e => {
      startX = e.clientX; startW = sidebarWidth;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
    function onMove(e) { setSidebarWidth(startW - (e.clientX - startX)); }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
  }

  // ========== 自動保存 ==========
  function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(saveMemo, 800);
  }

  // ========== イベントリスナー設定 ==========
  function setupEvents() {
    $('close-btn').addEventListener('click', closeSidebar);
    $('new-memo-btn').addEventListener('click', createMemo);
    $('back-btn').addEventListener('click', () => {
      clearTimeout(autoSaveTimer); showDetail(false); currentId = null; renderList();
    });
    $('save-btn').addEventListener('click', saveMemo);
    $('delete-btn').addEventListener('click', deleteMemo);
    $('sync-apply-btn').addEventListener('click', () => {
      const updated = memos.find(m => m.id === currentId);
      if (!updated) return;
      isDirty = false;
      $('sync-banner').classList.add('hidden');
      $('memo-title-input').value = updated.title;
      $('memo-body-input').value = updated.body;
      undoStack = [{ v: updated.body, s: 0, e: 0 }]; redoStack = [];
      $('memo-meta-info').textContent = `作成: ${formatDate(updated.createdAt)}　更新: ${formatDate(updated.updatedAt)}`;
      $('last-saved-time').textContent = `保存 ${formatTime(updated.updatedAt)}`;
      renderTagEditor(updated.tags);
    });
    $('sync-dismiss-btn').addEventListener('click', () => {
      $('sync-banner').classList.add('hidden');
    });
    $('memo-title-input').addEventListener('input', () => { isDirty = true; scheduleAutoSave(); });
    // IME変換中はスタックに積まない（変換確定後のみ記録）
    let isComposing = false;
    $('memo-body-input').addEventListener('compositionstart', () => { isComposing = true; });
    $('memo-body-input').addEventListener('compositionend', () => {
      isComposing = false;
      const ta = $('memo-body-input');
      undoStack.push({ v: ta.value, s: ta.selectionStart, e: ta.selectionEnd });
      if (undoStack.length > 200) undoStack.shift();
      redoStack = [];
      isDirty = true;
      scheduleAutoSave();
    });
    $('memo-body-input').addEventListener('input', () => {
      if (isComposing) return; // IME変換中はスキップ
      const ta = $('memo-body-input');
      undoStack.push({ v: ta.value, s: ta.selectionStart, e: ta.selectionEnd });
      if (undoStack.length > 200) undoStack.shift();
      redoStack = [];
      isDirty = true;
      scheduleAutoSave();
    });
    // Cmd+Z / Cmd+Shift+Z をカスタムスタックで処理（SPAのkeydownより先にキャプチャ）
    $('memo-body-input').addEventListener('keydown', e => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const ta = $('memo-body-input');
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault(); e.stopPropagation();
        if (undoStack.length > 1) {
          redoStack.push(undoStack.pop());
          const st = undoStack[undoStack.length - 1];
          ta.value = st.v; ta.setSelectionRange(st.s, st.e);
          scheduleAutoSave();
        }
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault(); e.stopPropagation();
        if (redoStack.length > 0) {
          const st = redoStack.pop();
          undoStack.push(st);
          ta.value = st.v; ta.setSelectionRange(st.s, st.e);
          scheduleAutoSave();
        }
      }
    }, true); // キャプチャフェーズでSPAのハンドラより先に処理
    $('insert-url-btn').addEventListener('click', insertCurrentUrl);
    $('template-btn').addEventListener('click', () => {
      updateTemplateMenu();
      $('template-menu').classList.toggle('visible');
    });
    $('preview-btn').addEventListener('click', togglePreview);
    $('settings-btn').addEventListener('click', () => {
      const visible = $('settings-panel').classList.toggle('visible');
      if (visible) { renderTemplateManager(); updateDarkModeBtn(); }
    });
    $('dark-mode-btn').addEventListener('click', toggleDarkMode);
    $('add-template-btn').addEventListener('click', () => {
      editingTemplateId = 'new'; renderTemplateManager();
    });
    $('export-btn').addEventListener('click', exportMemos);
    $('import-btn').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', e => importMemos(e.target.files[0]));
    $('search-input').addEventListener('input', e => { searchQuery = e.target.value; renderList(); });

    // テンプレートメニューを外クリックで閉じる
    shadow.addEventListener('click', e => {
      if (!e.target.closest('#template-btn') && !e.target.closest('#template-menu')) {
        $('template-menu').classList.remove('visible');
      }
    });

    setupResize();
  }

  // ========== ユーティリティ ==========
  function escapeHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  function formatDateFile() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  }

  // ========== HTMLテンプレート ==========
  function getSidebarHTML() {
    return `
    <div id="sidebar">
      <div id="resize-handle"></div>

      <div id="header">
        <h1>ChromeMemo</h1>
        <div id="header-actions">
          <button id="new-memo-btn" class="icon-btn" title="新規メモ">＋</button>
          <button id="settings-btn" class="icon-btn" title="設定">⚙</button>
          <button id="close-btn" class="icon-btn" title="閉じる">✕</button>
        </div>
      </div>

      <div id="settings-panel">
        <div class="settings-section">
          <div class="settings-title">表示設定</div>
          <div class="settings-toggle-row">
            <span>🌙 ダークモード</span>
            <button id="dark-mode-btn" class="toggle-switch" aria-pressed="false">
              <span class="toggle-knob"></span>
            </button>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-title">データ管理</div>
          <button id="export-btn" class="settings-btn">📤 エクスポート（JSON）</button>
          <button id="import-btn" class="settings-btn">📥 インポート（JSON）</button>
          <input type="file" id="import-file" accept=".json" style="display:none">
        </div>
        <div class="settings-section">
          <div class="settings-title-row">
            <div class="settings-title">テンプレート管理</div>
            <button id="add-template-btn" class="add-tpl-btn">＋ 追加</button>
          </div>
          <div id="template-manager"></div>
        </div>
      </div>

      <div id="memo-list-view">
        <div id="toolbar">
          <input id="search-input" type="text" placeholder="🔍 検索...">
          <div id="tag-filter"></div>
        </div>
        <div id="memo-list"></div>
      </div>

      <div id="detail">
        <div id="sync-banner" class="sync-banner hidden">
          他のタブで更新されました
          <button id="sync-apply-btn">反映する</button>
          <button id="sync-dismiss-btn">×</button>
        </div>
        <div id="detail-header">
          <button id="back-btn" title="戻る">‹</button>
          <input id="memo-title-input" type="text" placeholder="タイトルを入力...">
          <span id="last-saved-time"></span>
        </div>
        <div id="detail-body">
          <div id="editor-toolbar">
            <button id="insert-url-btn" class="editor-btn">🔗 URL</button>
            <div class="tpl-wrap">
              <button id="template-btn" class="editor-btn">📋 テンプレート</button>
              <div id="template-menu"></div>
            </div>
            <button id="preview-btn" class="editor-btn">👁 プレビュー</button>
          </div>
          <textarea id="memo-body-input" placeholder="メモを入力...（Markdown対応）"></textarea>
          <div id="memo-preview-area"></div>
          <div id="tag-editor"></div>
          <div id="memo-meta-info"></div>
        </div>
        <div id="detail-footer">
          <button id="save-btn">保存</button>
          <button id="delete-btn">削除</button>
        </div>
      </div>
    </div>`;
  }

  // ========== スタイル ==========
  function getStyles() {
    return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :host {
      --bg:          #f5f5f4;
      --bg2:         #eeeeec;
      --bg3:         #e4e4e2;
      --hd-bg:       #2c2c2c;
      --hd-text:     #f0f0ee;
      --card:        #ffffff;
      --border:      #e4e4e2;
      --text:        #37352f;
      --text2:       #9b9a97;
      --text3:       #6b6b68;
      --primary:     #4a90e2;
      --primary-h:   #357abd;
      --primary-lt:  #e8f0fe;
      --danger:      #e53e3e;
      --danger-bg:   #fff5f5;
      --in-border:   #d4d4d2;
      --shadow-side: -3px 0 20px rgba(0,0,0,0.12);
      --r:           6px;
      --r2:          8px;

      position: fixed; top: 0; right: 0; height: 100vh;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Segoe UI', sans-serif;
      font-size: 13px; pointer-events: none;
    }

    :host(.dark) {
      --bg:          #1e1e1e;
      --bg2:         #252525;
      --bg3:         #2e2e2e;
      --hd-bg:       #111111;
      --hd-text:     #e0e0de;
      --card:        #252525;
      --border:      #363636;
      --text:        #e0e0de;
      --text2:       #888885;
      --text3:       #aaaaaa;
      --primary:     #5b9fee;
      --primary-h:   #4a90e2;
      --primary-lt:  #1a2d3d;
      --danger:      #fc8181;
      --danger-bg:   #2d1515;
      --in-border:   #404040;
      --shadow-side: -3px 0 20px rgba(0,0,0,0.4);
    }

    #sidebar {
      width: 320px; height: 100vh; background: var(--bg);
      box-shadow: var(--shadow-side);
      display: flex; flex-direction: column; overflow: hidden;
      transform: translateX(100%);
      transition: transform 0.25s cubic-bezier(0.4,0,0.2,1);
      pointer-events: all; position: relative;
    }
    #sidebar.open { transform: translateX(0); }

    #resize-handle {
      position: absolute; left: 0; top: 0; width: 5px; height: 100%;
      cursor: ew-resize; z-index: 10; transition: background 0.2s;
    }
    #resize-handle:hover { background: rgba(74,144,226,0.35); }

    /* ヘッダー */
    #header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 12px; height: 46px;
      background: var(--hd-bg); color: var(--hd-text);
      flex-shrink: 0; user-select: none;
    }
    #header h1 { font-size: 13px; font-weight: 600; letter-spacing: 0.6px; color: var(--hd-text); }
    #header-actions { display: flex; }
    .icon-btn {
      background: none; border: none; cursor: pointer; color: var(--hd-text);
      opacity: 0.65; font-size: 15px; padding: 6px 8px; border-radius: var(--r);
      line-height: 1; transition: opacity 0.15s, background 0.15s;
    }
    .icon-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); }

    /* 設定パネル */
    #settings-panel {
      display: none; overflow-y: auto; max-height: 62vh;
      border-bottom: 1px solid var(--border); background: var(--bg); flex-shrink: 0;
    }
    #settings-panel.visible { display: block; }
    .settings-section { padding: 12px 14px; border-bottom: 1px solid var(--border); }
    .settings-section:last-child { border-bottom: none; }
    .settings-title {
      font-size: 10px; font-weight: 700; color: var(--text2);
      text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px;
    }
    .settings-title-row {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;
    }
    .settings-title-row .settings-title { margin-bottom: 0; }
    .settings-toggle-row {
      display: flex; align-items: center; justify-content: space-between; padding: 2px 0;
    }
    .settings-toggle-row span { font-size: 12px; color: var(--text); }
    .settings-btn {
      width: 100%; padding: 7px 10px; margin-bottom: 5px;
      border: 1px solid var(--border); border-radius: var(--r);
      background: var(--card); cursor: pointer; font-size: 12px;
      text-align: left; color: var(--text); transition: background 0.12s;
    }
    .settings-btn:last-child { margin-bottom: 0; }
    .settings-btn:hover { background: var(--bg2); }

    .toggle-switch {
      position: relative; width: 40px; height: 22px;
      background: var(--bg3); border: 1px solid var(--border);
      border-radius: 11px; cursor: pointer; flex-shrink: 0;
      transition: background 0.2s, border-color 0.2s;
    }
    .toggle-switch.on { background: var(--primary); border-color: var(--primary); }
    .toggle-knob {
      position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
      border-radius: 50%; background: white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      transition: transform 0.2s; display: block;
    }
    .toggle-switch.on .toggle-knob { transform: translateX(18px); }

    .add-tpl-btn {
      background: none; border: 1px solid var(--primary); color: var(--primary);
      border-radius: var(--r); padding: 3px 8px; font-size: 11px;
      cursor: pointer; transition: background 0.12s;
    }
    .add-tpl-btn:hover { background: var(--primary-lt); }
    .tpl-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--r);
      margin-bottom: 4px; background: var(--card);
    }
    .tpl-name { font-size: 12px; color: var(--text); flex: 1; }
    .tpl-btns { display: flex; gap: 3px; }
    .tpl-edit-btn, .tpl-del-btn {
      background: none; border: none; cursor: pointer;
      font-size: 12px; padding: 2px 5px; border-radius: 4px; opacity: 0.5;
    }
    .tpl-edit-btn:hover { opacity: 1; background: var(--bg2); }
    .tpl-del-btn:hover { opacity: 1; background: var(--danger-bg); }
    .tpl-empty { font-size: 12px; color: var(--text2); padding: 2px 0; }
    .tpl-edit-form { display: flex; flex-direction: column; gap: 6px; }
    .tpl-name-input, .tpl-content-input {
      border: 1px solid var(--in-border); border-radius: var(--r);
      padding: 6px 8px; font-size: 12px; color: var(--text);
      background: var(--card); outline: none; font-family: inherit;
      transition: border-color 0.15s;
    }
    .tpl-name-input:focus, .tpl-content-input:focus { border-color: var(--primary); }
    .tpl-content-input { resize: vertical; min-height: 80px; }
    .tpl-edit-actions { display: flex; gap: 6px; }
    .tpl-save-btn, .tpl-cancel-btn {
      flex: 1; padding: 6px; border-radius: var(--r);
      cursor: pointer; font-size: 12px; border: none;
    }
    .tpl-save-btn { background: var(--primary); color: white; }
    .tpl-save-btn:hover { background: var(--primary-h); }
    .tpl-cancel-btn { background: var(--bg2); color: var(--text); }
    .tpl-cancel-btn:hover { background: var(--bg3); }

    /* メモ一覧ビュー */
    #memo-list-view { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
    #toolbar { padding: 10px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
    #search-input {
      width: 100%; padding: 7px 10px;
      border: 1px solid var(--in-border); border-radius: var(--r);
      font-size: 12px; outline: none; margin-bottom: 8px;
      background: var(--card); color: var(--text); transition: border-color 0.15s;
    }
    #search-input:focus { border-color: var(--primary); }
    #tag-filter { display: flex; flex-wrap: wrap; gap: 4px; }
    .tag-btn {
      padding: 3px 9px; border-radius: 20px; border: 1px solid var(--border);
      background: var(--card); cursor: pointer; font-size: 11px; color: var(--text3);
      transition: all 0.12s;
    }
    .tag-btn.active { background: var(--primary); color: white; border-color: var(--primary); }
    .tag-btn:hover:not(.active) { background: var(--bg2); }

    #memo-list { flex: 1; overflow-y: auto; padding: 8px 8px 16px; }
    .section-label {
      font-size: 10px; color: var(--text2); padding: 6px 6px 3px;
      text-transform: uppercase; letter-spacing: 0.6px;
    }
    .memo-item {
      padding: 10px 12px; border-radius: var(--r2); cursor: pointer;
      margin-bottom: 3px; border: 1px solid transparent; position: relative;
      transition: background 0.1s, border-color 0.1s;
    }
    .memo-item:hover { background: var(--bg2); border-color: var(--border); }
    .memo-item.selected { border-color: var(--primary); background: var(--primary-lt); }
    .memo-item-title {
      font-weight: 600; font-size: 13px; color: var(--text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      margin-bottom: 2px; padding-right: 56px;
    }
    .memo-item-preview {
      font-size: 11px; color: var(--text2); margin-bottom: 5px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      padding-right: 56px;
    }
    .memo-item-footer { display: flex; align-items: center; justify-content: space-between; }
    .memo-tags { display: flex; gap: 3px; flex-wrap: wrap; }
    .memo-tag {
      background: var(--primary-lt); color: var(--primary);
      padding: 1px 6px; border-radius: 10px; font-size: 10px; font-weight: 500;
    }
    .memo-date { font-size: 10px; color: var(--text2); white-space: nowrap; }
    .memo-item-actions {
      position: absolute; top: 8px; right: 8px;
      display: flex; gap: 1px; opacity: 0; transition: opacity 0.1s;
    }
    .memo-item:hover .memo-item-actions { opacity: 1; }
    .pin-btn, .list-delete-btn {
      background: none; border: none; cursor: pointer;
      font-size: 12px; padding: 3px 4px; border-radius: 4px; opacity: 0.45;
    }
    .pin-btn:hover { opacity: 1; background: var(--primary-lt); }
    .list-delete-btn:hover { opacity: 1; background: var(--danger-bg); }
    .pin-btn.pinned { opacity: 1; }
    .empty-state { text-align: center; color: var(--text2); padding: 40px 16px; font-size: 13px; }

    /* 同期バナー */
    .sync-banner {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 12px; font-size: 12px;
      background: #fff8e1; color: #7a5c00;
      border-bottom: 1px solid #ffe082; flex-shrink: 0;
    }
    .sync-banner.hidden { display: none; }
    .sync-banner button { font-size: 11px; padding: 2px 8px; cursor: pointer; border-radius: 4px; border: 1px solid #ffe082; background: #fff; }
    #sync-apply-btn { margin-left: auto; color: #7a5c00; }
    #sync-dismiss-btn { color: #999; }

    /* 詳細ビュー */
    #detail { display: none; flex-direction: column; flex: 1; overflow: hidden; }
    #detail.visible { display: flex; }
    #detail-header {
      display: flex; align-items: center; gap: 8px;
      padding: 0 12px; height: 46px;
      border-bottom: 1px solid var(--border); flex-shrink: 0; background: var(--bg);
    }
    #back-btn {
      background: none; border: none; cursor: pointer;
      font-size: 22px; color: var(--text2); padding: 0 2px; line-height: 1;
      transition: color 0.12s; flex-shrink: 0;
    }
    #back-btn:hover { color: var(--text); }
    #memo-title-input {
      flex: 1; border: none; outline: none;
      font-size: 14px; font-weight: 600; color: var(--text);
      background: transparent; min-width: 0;
    }
    #last-saved-time { font-size: 10px; color: var(--text2); white-space: nowrap; flex-shrink: 0; }

    #detail-body {
      flex: 1; display: flex; flex-direction: column;
      overflow: hidden; padding: 10px 12px; gap: 8px; background: var(--bg);
    }
    #editor-toolbar { display: flex; gap: 5px; flex-shrink: 0; }
    .tpl-wrap { position: relative; }
    .editor-btn {
      padding: 4px 10px; border: 1px solid var(--border); border-radius: var(--r);
      background: var(--card); cursor: pointer; font-size: 11px; color: var(--text3);
      transition: all 0.12s; white-space: nowrap;
    }
    .editor-btn:hover { background: var(--bg2); color: var(--text); border-color: var(--text2); }
    .editor-btn.active { background: var(--primary); color: white; border-color: var(--primary); }

    #memo-body-input {
      flex: 1; border: 1px solid var(--in-border); border-radius: var(--r2);
      padding: 10px; font-size: 13px; line-height: 1.7;
      resize: none; outline: none; font-family: inherit; overflow-y: auto;
      min-height: 0; background: var(--card); color: var(--text);
      transition: border-color 0.15s;
    }
    #memo-body-input:focus { border-color: var(--primary); }
    /* プレビュー分割表示時: textareaを縮小してプレビューと共存 */
    #memo-body-input.split-mode { flex: 0 0 110px; min-height: 110px; }

    #memo-preview-area {
      display: none; flex: 1; border: 1px solid var(--border); border-radius: var(--r2);
      padding: 10px; overflow-y: auto; font-size: 13px; line-height: 1.7;
      color: var(--text); background: var(--card); min-height: 0;
    }
    #memo-preview-area.visible { display: block; }
    #memo-preview-area h1 { font-size: 17px; font-weight: 700; margin: 10px 0 4px; }
    #memo-preview-area h2 { font-size: 15px; font-weight: 600; margin: 8px 0 4px; }
    #memo-preview-area h3 { font-size: 13px; font-weight: 600; margin: 6px 0 4px; }
    #memo-preview-area ul { padding-left: 20px; margin: 4px 0; }
    #memo-preview-area hr { border: none; border-top: 1px solid var(--border); margin: 8px 0; }
    #memo-preview-area pre {
      background: var(--bg2); padding: 8px; border-radius: var(--r); overflow-x: auto; margin: 4px 0;
    }
    #memo-preview-area code { background: var(--bg2); padding: 1px 5px; border-radius: 3px; font-size: 11px; }
    #memo-preview-area pre code { background: none; padding: 0; }
    #memo-preview-area a { color: var(--primary); }
    #memo-preview-area strong { font-weight: 600; }

    #tag-editor {
      flex-shrink: 0; display: flex; flex-wrap: wrap;
      gap: 4px; align-items: center; min-height: 24px;
    }
    .tag-chip {
      display: flex; align-items: center; gap: 3px;
      background: var(--primary-lt); color: var(--primary);
      padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500;
    }
    .tag-remove {
      cursor: pointer; font-size: 13px; line-height: 1;
      color: var(--primary); background: none; border: none; padding: 0; opacity: 0.7;
    }
    .tag-remove:hover { color: var(--danger); opacity: 1; }
    #tag-add-input {
      border: 1px solid var(--in-border); border-radius: 12px;
      padding: 2px 10px; font-size: 11px; outline: none; width: 90px;
      background: var(--card); color: var(--text); transition: border-color 0.15s;
    }
    #tag-add-input:focus { border-color: var(--primary); }

    #memo-meta-info { font-size: 10px; color: var(--text2); flex-shrink: 0; }

    #detail-footer {
      display: flex; gap: 8px; padding: 10px 12px;
      border-top: 1px solid var(--border); flex-shrink: 0; background: var(--bg);
    }
    #save-btn {
      flex: 1; padding: 8px; background: var(--primary); color: white;
      border: none; border-radius: var(--r); cursor: pointer;
      font-size: 13px; font-weight: 500; transition: background 0.12s;
    }
    #save-btn:hover { background: var(--primary-h); }
    #delete-btn {
      padding: 8px 16px; background: transparent; color: var(--danger);
      border: 1px solid currentColor; border-radius: var(--r);
      cursor: pointer; font-size: 13px; transition: background 0.12s;
    }
    #delete-btn:hover { background: var(--danger-bg); }

    /* テンプレートドロップダウン */
    #template-menu {
      display: none; position: absolute; top: calc(100% + 4px); left: 0;
      background: var(--card); border: 1px solid var(--border);
      border-radius: var(--r2); box-shadow: 0 4px 16px rgba(0,0,0,0.1);
      z-index: 100; min-width: 150px; overflow: hidden;
    }
    #template-menu.visible { display: block; }
    .template-item {
      padding: 9px 14px; cursor: pointer; font-size: 12px; color: var(--text);
      transition: background 0.1s;
    }
    .template-item:hover { background: var(--bg2); }
    .template-empty { padding: 8px 14px; font-size: 12px; color: var(--text2); }

    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--bg3); border-radius: 2px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--text2); opacity: 0.5; }
    `;
  }

  // ========== ウェルカムメモ ==========
  async function createWelcomeMemo() {
    const memo = {
      id: crypto.randomUUID(),
      title: '初回メモへようこそ！',
      body: `Hello World！これは記念すべき初回のメモです。\n\n## ChromeMemoの使い方\n\n### 基本操作\n- **新規メモ**: ヘッダー右上の「＋」ボタン\n- **自動保存**: 入力が止まると自動で保存されます\n- **削除**: 一覧のホバーで🗑、または詳細画面の削除ボタン\n\n### 便利な機能\n- **検索**: 検索ボックスでタイトル・本文・タグを横断検索\n- **タグ**: メモにタグを付けて分類・絞り込み\n- **ピン留め**: 📌アイコンで重要メモを先頭に固定\n- **URL挿入**: 🔗ボタンで閲覧中のURLを挿入（Cmd+Zで元に戻せます）\n- **テンプレート**: 📋ボタンから定型文を挿入。⚙️設定で自由に編集可能\n- **Markdownプレビュー**: 👁ボタンでプレビュー表示\n- **ダークモード**: ⚙️設定からON/OFF切り替え\n\n### ショートカット\n- Mac: \`Command + M\`\n- Windows: \`Alt + M\``,
      tags: ['使い方'],
      pinned: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memos.push(memo);
    await saveMemosLocal(memos);
  }

  // ========== 初期化 ==========
  async function init() {
    buildHost();
    [memos] = await Promise.all([getMemos()]);
    await Promise.all([loadTemplates(), loadDarkMode()]);

    if (memos.length === 0) await createWelcomeMemo();

    isOpen = await getSidebarOpen();
    if (isOpen) { $('sidebar').classList.add('open'); renderList(); }
    setupEvents();

    // 他タブで保存が発生した際にメモ一覧・編集画面をリアルタイム更新
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.chromememo_memos) return;
      if (isSaving) return; // 自タブの保存による発火はスキップ
      memos = changes.chromememo_memos.newValue || [];
      if (!isOpen) return;

      // 編集画面が開いている場合は同期処理
      if (currentId) {
        const updated = memos.find(m => m.id === currentId);
        if (updated) {
          if (!isDirty) {
            // 未編集ならそのまま反映
            $('memo-title-input').value = updated.title;
            $('memo-body-input').value = updated.body;
            undoStack = [{ v: updated.body, s: 0, e: 0 }]; redoStack = [];
            $('memo-meta-info').textContent = `作成: ${formatDate(updated.createdAt)}　更新: ${formatDate(updated.updatedAt)}`;
            $('last-saved-time').textContent = `保存 ${formatTime(updated.updatedAt)}`;
            renderTagEditor(updated.tags);
          } else {
            // 編集中はバナーで通知し、ユーザーの判断に委ねる
            $('sync-banner').classList.remove('hidden');
          }
        } else {
          // 他タブで削除された場合は一覧に戻る
          currentId = null; isDirty = false;
          $('sync-banner').classList.add('hidden');
          showDetail(false);
        }
      }
      renderList();
    });
  }

  chrome.runtime.onMessage.addListener(({ type }) => {
    if (type === 'TOGGLE_SIDEBAR') toggleSidebar();
  });

  init();
})();
