// 主題三：以武器為單位彙整 Google Sheet 中的音效與語音狀態。
(function setupTheme3WeaponDemo() {
  if (document.body.dataset.dashboardMode === 'multipage' && document.body.dataset.dashboardKey !== 'theme3') return;
  const view = document.getElementById('theme-view-theme3');
  if (!view) return;

  // 畫面與下拉選單依流程排序；武器主狀態另以 STATUS_PRIORITY 判斷風險。
  const STATUS_ORDER = ['未開始', '待製作', '已製作', '待修改', '已確認', '不需製作', '無內容'];
  const STATUS_PRIORITY = ['待修改', '未開始', '待製作', '已製作', '已確認', '不需製作', '無內容'];
  const EDITABLE_STATUSES = STATUS_ORDER.slice(0, 6);
  const STATUS_CLASS = { '待修改': 'revision', '未開始': 'unstarted', '待製作': 'queued', '已製作': 'produced', '已確認': 'confirmed', '不需製作': 'not-needed', '無內容': 'empty' };
  const THEME3_API_URL = 'https://script.google.com/macros/s/AKfycbxPl_rsAVtlUae_2KseF10qC_-vXlm30xQlLSbMtjsy53pHxArPggUhnSOeSlEdQHuzHQ/exec';
  const THEME3_API_KEY = 'SGF_THEME3_WEAPON_SOUND_2026_w8Kp4Xn7Qm2Vz9Ld';
  const THEME3_SUMMARY_STORAGE_KEY = 'sgf_theme3_last_summary';
  const THEME3_GET_TIMEOUT_MS = 20000;
  const THEME3_POST_TIMEOUT_MS = 35000;
  let weapons = [];

  const state = { status: '全部', query: '', selected: null, detailType: 'sound', detailStatus: '全部', detailCharacter: '全部', voiceView: 'overview', characterQuery: '', characterSort: 'id', batchMode: false, batchSelected: new Set(), batchStatus: '已確認', batchSaving: false };
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  const emptyCounts = () => STATUS_ORDER.reduce((result, status) => ({ ...result, [status]: 0 }), {});
  const countsFor = (actions, key) => STATUS_ORDER.reduce((result, status) => {
    result[status] = actions.filter(action => action[key] === status).length;
    return result;
  }, {});

  async function requestTheme3Json(url, options = {}, retries = 0, timeoutMs = THEME3_GET_TIMEOUT_MS) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(`API ${response.status}`);
        return payload;
      } catch (error) {
        lastError = error.name === 'AbortError' ? new Error(`連線超過 ${Math.round(timeoutMs / 1000)} 秒`) : error;
        if (attempt < retries) await new Promise(resolve => window.setTimeout(resolve, 800));
      } finally {
        window.clearTimeout(timer);
      }
    }
    throw lastError;
  }

  function saveSummarySnapshot(payload) {
    try {
      localStorage.setItem(THEME3_SUMMARY_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), payload }));
    } catch (error) {
      console.warn('Theme 3 summary snapshot could not be saved', error);
    }
  }

  function restoreSummarySnapshot() {
    try {
      const snapshot = JSON.parse(localStorage.getItem(THEME3_SUMMARY_STORAGE_KEY) || 'null');
      return snapshot && Array.isArray(snapshot.payload?.weapons) ? snapshot : null;
    } catch (error) {
      return null;
    }
  }
  const weaponCounts = (weapon, type) => weapon[`${type}Counts`] || countsFor(weapon.actions || [], type);
  const aggregateStatus = weapon => {
    if (!weapon.hasContent) return '無內容';
    const statuses = ['sound', 'voice'].flatMap(type => STATUS_ORDER.filter(status => status !== '不需製作' && (weaponCounts(weapon, type)[status] || 0) > 0));
    return STATUS_PRIORITY.find(status => statuses.includes(status)) || '不需製作';
  };
  const summary = (actions, key) => STATUS_ORDER.filter(status => actions.some(action => action[key] === status)).map(status => `${status} ${actions.filter(action => action[key] === status).length}`).join(' · ');
  const issueCount = weapon => weapon.actions.filter(action => action.sound === '待修改' || action.voice === '待修改').length;
  const progressStack = (weapon, key, label) => {
    const counts = weaponCounts(weapon, key);
    const trackedCount = STATUS_ORDER.filter(status => status !== '不需製作' && status !== '無內容').reduce((sum, status) => sum + (counts[status] || 0), 0);
    const confirmedCount = counts['已確認'];
    const percent = trackedCount ? Math.round((confirmedCount / trackedCount) * 100) : null;
    const stages = ['未開始', '待製作', '已製作', '待修改', '已確認'];
    const segments = stages.map(status => counts[status]
      ? `<span class="theme3-progress-segment ${STATUS_CLASS[status]}" style="flex:${counts[status]}" title="${status} ${counts[status]} 項"></span>`
      : '').join('');
    const legend = stages.filter(status => counts[status]).map(status => `<span class="${STATUS_CLASS[status]}">${status} ${counts[status]}</span>`);
    if (counts['不需製作']) legend.push(`<span class="not-needed">不需製作 ${counts['不需製作']}</span>`);
    return `<div class="theme3-progress-group"><div class="theme3-progress-heading"><b>${label}</b><strong>${percent === null ? '—' : `${percent}%`}</strong></div><div class="theme3-progress-meta">已確認 ${confirmedCount} / ${trackedCount}</div><div class="theme3-progress-stack" aria-label="${label}目前階段：${legend.join('、').replace(/<[^>]+>/g, '')}">${segments || '<span class="theme3-progress-segment not-needed" style="flex:1"></span>'}</div><div class="theme3-progress-legend">${legend.join('')}</div></div>`;
  };
  const visibleWeapons = () => weapons.filter(weapon => {
    const haystack = [weapon.name, weapon.style, ...(weapon.actions || []).flatMap(action => [action.command, action.note, action.id])].join(' ').toLowerCase();
    return (state.status === '全部' || aggregateStatus(weapon) === state.status) && haystack.includes(state.query);
  }).sort((a, b) => STATUS_PRIORITY.indexOf(aggregateStatus(a)) - STATUS_PRIORITY.indexOf(aggregateStatus(b)) || a.name.localeCompare(b.name, 'zh-Hant'));
  const pill = status => `<span class="theme3-status-pill ${STATUS_CLASS[status]}">${esc(status)}</span>`;
  const actionFor = (weaponName, actionId) => {
    const weapon = weapons.find(item => item.name === weaponName);
    return weapon ? { weapon, action: weapon.actions.find(item => item.id === actionId) } : {};
  };
  const batchRowKey = (row, isSoundView) => isSoundView ? String(row.id) : String(row.key);
  function resetBatchEdit() {
    state.batchMode = false;
    state.batchSelected.clear();
    state.batchStatus = '已確認';
    state.batchSaving = false;
  }

  function renderStats() {
    const cards = [
      ['武器總數', weapons.length, 'fa-guitar'],
      ['待修改武器', weapons.filter(weapon => aggregateStatus(weapon) === '待修改').length, 'fa-arrow-rotate-left'],
      ['已確認武器', weapons.filter(weapon => aggregateStatus(weapon) === '已確認').length, 'fa-circle-check'],
      ['追蹤動作', weapons.reduce((sum, weapon) => sum + (weapon.actionCount || (weapon.actions || []).length), 0), 'fa-list-check']
    ];
    document.getElementById('theme3-stats').innerHTML = cards.map(([label, value, icon]) => `<article><span><i class="fa-solid ${icon}"></i> ${label}</span><strong>${value}</strong></article>`).join('');
  }

  function voiceCharacterSummaries(rows) {
    const groups = new Map();
    rows.forEach(row => {
      const id = String(row.characterId || '').trim();
      if (!id) return;
      if (!groups.has(id)) groups.set(id, { id, name: row.characterName || id, rows: [], counts: emptyCounts() });
      const group = groups.get(id);
      group.rows.push(row);
      group.counts[row.voiceStatus] = (group.counts[row.voiceStatus] || 0) + 1;
    });
    return [...groups.values()].map(group => {
      const total = group.rows.length;
      const confirmed = group.counts['已確認'] || 0;
      const revision = group.counts['待修改'] || 0;
      const tracked = total - (group.counts['不需製作'] || 0) - (group.counts['無內容'] || 0);
      return { ...group, total, confirmed, revision, percent: tracked ? Math.round((confirmed / tracked) * 100) : null };
    });
  }

  function renderDetail() {
    const panel = document.getElementById('theme3-detail-panel');
    const weapon = weapons.find(item => item.name === state.selected);
    if (!weapon) { panel.hidden = true; panel.innerHTML = ''; return; }
    if (!weapon.hasContent) {
      panel.hidden = false;
      panel.innerHTML = `<div class="theme3-detail-heading"><div><span class="theme3-kicker">WEAPON DETAIL</span><h2>${esc(weapon.name)} ${pill('無內容')}</h2><p>${esc(weapon.style || '尚未填寫音效風格。')}</p></div><button id="theme3-detail-close" type="button" aria-label="關閉武器詳情">&times;</button></div><div class="theme3-empty">找不到同名武器分頁，或該分頁第 3 列起尚無動作資料。</div>`;
      panel.querySelector('#theme3-detail-close')?.addEventListener('click', () => { state.selected = null; renderDetail(); });
      return;
    }
    if (!weapon.detailLoaded) {
      panel.hidden = false;
      panel.innerHTML = '<div class="theme3-empty"><i class="fa-solid fa-circle-notch fa-spin"></i> 正在讀取此武器的動作與角色語音明細…</div>';
      return;
    }
    const isSoundView = state.detailType === 'sound';
    const detailLabel = isSoundView ? '音效' : '語音';
    const allRows = isSoundView ? weapon.actions : weapon.actions.flatMap(action => (action.voiceEntries || []).map(entry => ({ ...entry, actionId: action.id, command: action.command, discussions: action.discussions || [] })));
    const characterRows = isSoundView ? allRows : allRows.filter(row => state.detailCharacter === '全部' || row.characterId === state.detailCharacter);
    const detailRows = characterRows.filter(row => state.detailStatus === '全部' || row[isSoundView ? 'soundStatus' : 'voiceStatus'] === state.detailStatus);
    const characters = !isSoundView ? [...new Map(allRows.map(row => [row.characterId, row.characterName])).entries()] : [];
    const characterSummaries = !isSoundView ? voiceCharacterSummaries(allRows)
      .filter(character => !state.characterQuery || `${character.name} ${character.id}`.toLowerCase().includes(state.characterQuery.toLowerCase()))
      .sort((a, b) => state.characterSort === 'name'
        ? a.name.localeCompare(b.name, 'zh-Hant')
        : state.characterSort === 'progress'
          ? (a.percent ?? -1) - (b.percent ?? -1) || b.revision - a.revision
          : state.characterSort === 'id'
            ? a.id.localeCompare(b.id, 'zh-Hant', { numeric: true }) || a.name.localeCompare(b.name, 'zh-Hant')
            : b.revision - a.revision || (a.percent ?? -1) - (b.percent ?? -1) || a.name.localeCompare(b.name, 'zh-Hant'))
      : [];
    const soundSummary = Object.entries(weaponCounts(weapon, 'sound')).filter(([, count]) => count).map(([status, count]) => `${status} ${count}`).join(' · ');
    const voiceSummary = Object.entries(weaponCounts(weapon, 'voice')).filter(([, count]) => count).map(([status, count]) => `${status} ${count}`).join(' · ');
    const batchActive = state.batchMode && (isSoundView || state.voiceView === 'actions');
    const detailRowsMarkup = detailRows.map(row => {
      const rowKey = batchRowKey(row, isSoundView);
      const rowContent = `<span>${esc(isSoundView ? row.id : row.actionId)}</span><strong>${esc(isSoundView ? row.command : `${row.command}｜${row.characterName}`)}</strong><span>${pill(row[isSoundView ? 'soundStatus' : 'voiceStatus'])}</span>${isSoundView ? '' : `<span class="theme3-action-note">${esc(row.currentVoice || '—')}</span>`}`;
      return batchActive
        ? `<label class="theme3-action-row theme3-action-selectable ${state.batchSelected.has(rowKey) ? 'selected' : ''}"><input data-theme3-batch-item="${esc(rowKey)}" type="checkbox" ${state.batchSelected.has(rowKey) ? 'checked' : ''}>${rowContent}</label>`
        : `<button class="theme3-action-row theme3-action-trigger" data-theme3-action="${esc(isSoundView ? row.id : row.actionId)}" ${isSoundView ? '' : `data-theme3-voice="${esc(row.key)}"`} type="button" title="開啟編輯">${rowContent}</button>`;
    }).join('');
    const batchToolbar = batchActive ? `<div class="theme3-batch-toolbar"><div><b>快速編輯</b><span>已選 ${state.batchSelected.size} 項</span></div><div class="theme3-batch-actions"><button id="theme3-batch-select-visible" type="button">選取目前結果</button><button id="theme3-batch-clear" type="button">清除選取</button><label>變更為<select id="theme3-batch-status">${EDITABLE_STATUSES.map(status => `<option value="${status}" ${state.batchStatus === status ? 'selected' : ''}>${status}</option>`).join('')}</select></label><button id="theme3-batch-cancel" type="button">結束快速編輯</button><button id="theme3-batch-save" type="button" ${!state.batchSelected.size || state.batchSaving ? 'disabled' : ''}>${state.batchSaving ? '<i class="fa-solid fa-circle-notch fa-spin"></i> 儲存中' : `套用至 ${state.batchSelected.size} 項`}</button></div></div>` : '';
    panel.hidden = false;
    panel.innerHTML = `<div class="theme3-detail-heading"><div><span class="theme3-kicker">WEAPON DETAIL</span><h2>${esc(weapon.name)} ${pill(aggregateStatus(weapon))}</h2></div><button id="theme3-detail-close" type="button" aria-label="關閉武器詳情">&times;</button></div>
      <div class="theme3-weapon-style"><div><span class="theme3-kicker">SOUND STYLE</span><p id="theme3-weapon-style-text">${esc(weapon.style || '尚未填寫音效風格。')}</p></div><button id="theme3-edit-weapon-style" type="button"><i class="fa-solid fa-pen"></i> 編輯風格</button></div>
      <div class="theme3-detail-summary"><div><span>音效狀態</span><strong>${esc(soundSummary || '尚無資料')}</strong><small>最後更新：${esc(weapon.soundUpdatedAt || '尚無紀錄')}</small></div><div><span>語音狀態</span><strong>${esc(voiceSummary || '尚未同步角色語音')}</strong><small>最後更新：${esc(weapon.voiceUpdatedAt || '尚無紀錄')}</small></div></div>
      <div class="theme3-detail-tabs" role="tablist" aria-label="選擇音效或語音明細"><button class="${isSoundView ? 'active' : ''}" data-theme3-detail-type="sound" type="button" role="tab" aria-selected="${isSoundView}"><i class="fa-solid fa-volume-high"></i> 音效</button><button class="${!isSoundView ? 'active' : ''}" data-theme3-detail-type="voice" type="button" role="tab" aria-selected="${!isSoundView}"><i class="fa-solid fa-microphone-lines"></i> 語音</button></div>
      ${!isSoundView && state.voiceView === 'overview' ? `<div class="theme3-character-overview"><div class="theme3-detail-filter"><div><span class="theme3-kicker">CHARACTER OVERVIEW</span><b>武將語音總覽</b><small>${characterSummaries.length} / ${characters.length} 位武將；點擊武將才顯示其動作明細。</small></div><div class="theme3-character-overview-controls"><input id="theme3-character-search" type="search" value="${esc(state.characterQuery)}" placeholder="搜尋武將名稱"><label>排序<select id="theme3-character-sort"><option value="revision" ${state.characterSort === 'revision' ? 'selected' : ''}>待修改最多</option><option value="progress" ${state.characterSort === 'progress' ? 'selected' : ''}>完成度最低</option><option value="id" ${state.characterSort === 'id' ? 'selected' : ''}>編號名稱</option></select></label></div></div><div class="theme3-character-grid">${characterSummaries.map(character => `<button class="theme3-character-card ${character.revision ? 'has-revision' : ''}" data-theme3-character="${esc(character.id)}" type="button"><div><b>${esc(character.name)}</b><small>${character.total} 項語音</small></div><strong>${character.percent === null ? '—' : `${character.percent}%`}</strong><div class="theme3-character-progress"><span style="width:${character.percent || 0}%"></span></div><footer><span>已確認 ${character.confirmed} / ${character.total}</span><span class="${character.revision ? 'is-revision' : ''}">${character.revision ? `待修改 ${character.revision}` : '目前無待修改'}</span></footer></button>`).join('') || '<div class="theme3-action-empty">找不到符合條件的武將。</div>'}</div></div>` : `<div class="theme3-detail-filter"><div><span class="theme3-kicker">${isSoundView ? 'SOUND' : 'VOICE'} FILTER</span><b>${detailLabel}${isSoundView ? '動作' : '角色語音'}明細</b><small>顯示 ${detailRows.length} / ${characterRows.length} 項${!isSoundView && state.detailCharacter !== '全部' ? ` · ${esc(characters.find(([id]) => id === state.detailCharacter)?.[1] || '')}` : ''}</small></div><div class="theme3-detail-filter-controls"><button id="theme3-batch-toggle" class="theme3-batch-toggle ${batchActive ? 'active' : ''}" type="button"><i class="fa-solid fa-list-check"></i> ${batchActive ? '快速編輯中' : '快速編輯'}</button>${!isSoundView ? `<button class="theme3-back-overview" id="theme3-back-character-overview" type="button"><i class="fa-solid fa-arrow-left"></i> 武將總覽</button><label class="theme3-character-filter">角色<select id="theme3-character-filter">${characters.map(([id, name]) => `<option value="${esc(id)}" ${state.detailCharacter === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>` : ''}<div class="theme3-detail-filter-chips">${['全部', ...EDITABLE_STATUSES].map(status => `<button class="theme3-filter-chip ${state.detailStatus === status ? 'active' : ''}" data-theme3-detail-status="${status}" type="button">${status}</button>`).join('')}</div></div></div>
      ${batchToolbar}<div class="theme3-action-table ${state.detailType} ${batchActive ? 'batch-mode' : ''}"><div class="theme3-action-row theme3-action-head">${batchActive ? '<span>選取</span>' : ''}<span>動作編號</span><span>${isSoundView ? '指令' : '指令／角色'}</span><span>${detailLabel}狀態</span>${isSoundView ? '' : '<span>目前語音</span>'}</div>${detailRowsMarkup || `<div class="theme3-action-empty">${isSoundView ? '此武器目前沒有符合此狀態的動作。' : '尚無角色語音資料。請先建立角色清單，再按「同步角色語音項目」。'}</div>`}</div>`}`;
    panel.querySelector('#theme3-detail-close')?.addEventListener('click', () => { resetBatchEdit(); state.selected = null; renderDetail(); });
    panel.querySelectorAll('[data-theme3-action]').forEach(button => button.addEventListener('click', () => openActionEditor(weapon.name, button.dataset.theme3Action, button.dataset.theme3Voice || '')));
    panel.querySelector('#theme3-batch-toggle')?.addEventListener('click', () => { state.batchMode ? resetBatchEdit() : (state.batchMode = true); renderDetail(); });
    panel.querySelectorAll('[data-theme3-batch-item]').forEach(input => input.addEventListener('change', () => {
      input.checked ? state.batchSelected.add(input.dataset.theme3BatchItem) : state.batchSelected.delete(input.dataset.theme3BatchItem);
      renderDetail();
    }));
    panel.querySelector('#theme3-batch-select-visible')?.addEventListener('click', () => { detailRows.forEach(row => state.batchSelected.add(batchRowKey(row, isSoundView))); renderDetail(); });
    panel.querySelector('#theme3-batch-clear')?.addEventListener('click', () => { state.batchSelected.clear(); renderDetail(); });
    panel.querySelector('#theme3-batch-cancel')?.addEventListener('click', () => { resetBatchEdit(); renderDetail(); });
    panel.querySelector('#theme3-batch-status')?.addEventListener('change', event => { state.batchStatus = event.target.value; });
    panel.querySelector('#theme3-batch-save')?.addEventListener('click', () => saveBatchStatuses(weapon, allRows, isSoundView));
    panel.querySelectorAll('[data-theme3-detail-type]').forEach(button => button.addEventListener('click', () => { resetBatchEdit(); state.detailType = button.dataset.theme3DetailType; state.detailStatus = '全部'; state.detailCharacter = '全部'; state.voiceView = button.dataset.theme3DetailType === 'voice' ? 'overview' : 'actions'; renderDetail(); }));
    panel.querySelectorAll('[data-theme3-detail-status]').forEach(button => button.addEventListener('click', () => { state.detailStatus = button.dataset.theme3DetailStatus; renderDetail(); }));
    panel.querySelector('#theme3-character-filter')?.addEventListener('change', event => { state.detailCharacter = event.target.value; renderDetail(); });
    panel.querySelectorAll('[data-theme3-character]').forEach(button => button.addEventListener('click', () => { resetBatchEdit(); state.detailCharacter = button.dataset.theme3Character; state.detailStatus = '全部'; state.voiceView = 'actions'; renderDetail(); }));
    panel.querySelector('#theme3-back-character-overview')?.addEventListener('click', () => { resetBatchEdit(); state.voiceView = 'overview'; state.detailCharacter = '全部'; state.detailStatus = '全部'; renderDetail(); });
    panel.querySelector('#theme3-character-search')?.addEventListener('input', event => {
      const cursor = event.target.selectionStart;
      state.characterQuery = event.target.value.trim();
      renderDetail();
      requestAnimationFrame(() => {
        const search = document.getElementById('theme3-character-search');
        search?.focus();
        search?.setSelectionRange(cursor, cursor);
      });
    });
    panel.querySelector('#theme3-character-sort')?.addEventListener('change', event => { state.characterSort = event.target.value; renderDetail(); });
    panel.querySelector('#theme3-edit-weapon-style')?.addEventListener('click', () => openWeaponStyleEditor(weapon));
  }

  function openWeaponStyleEditor(weapon) {
    const container = document.querySelector('#theme3-detail-panel .theme3-weapon-style');
    if (!container) return;
    container.innerHTML = `<label><span class="theme3-kicker">SOUND STYLE</span><textarea id="theme3-weapon-style-input" rows="3" placeholder="輸入此武器的音效風格與製作方向…">${esc(weapon.style || '')}</textarea></label><div class="theme3-weapon-style-actions"><button id="theme3-cancel-weapon-style" type="button">取消</button><button id="theme3-save-weapon-style" type="button">儲存風格</button></div>`;
    const input = container.querySelector('#theme3-weapon-style-input');
    input?.focus();
    container.querySelector('#theme3-cancel-weapon-style')?.addEventListener('click', renderDetail);
    container.querySelector('#theme3-save-weapon-style')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = '儲存中…';
      try {
        await updateTheme3WeaponStyle(weapon, input?.value || '');
        weapon.style = String(input?.value || '').trim();
        window.dashboardShowToast('已更新確認總表的音效風格。', 'success');
        renderDetail();
      } catch (error) {
        console.error('Theme 3 weapon style update failed', error);
        window.dashboardShowToast(`儲存風格失敗：${error.message}`, 'error');
        button.disabled = false;
        button.textContent = '儲存風格';
      }
    });
  }

  function openActionEditor(weaponName, actionId, voiceKey = '') {
    const { weapon, action } = actionFor(weaponName, actionId);
    const modal = document.getElementById('theme3-action-modal');
    if (!weapon || !action || !modal) return;
    modal.dataset.weapon = weaponName;
    modal.dataset.action = actionId;
    modal._draft = { soundStatus: action.soundStatus, voices: {} };
    modal._discussionExpanded = false;
    (action.voiceEntries || []).forEach(entry => { modal._draft.voices[entry.key] = { status: entry.voiceStatus }; });
    document.getElementById('theme3-discussion-author').value = localStorage.getItem('sgf_theme3_discussion_author') || '';
    document.getElementById('theme3-new-discussion').value = '';
    const initialType = state.detailType === 'voice' && voiceKey ? 'voice' : 'sound';
    renderActionEditorTab(weapon, action, initialType, voiceKey || action.voiceEntries?.[0]?.key || '');
    document.querySelectorAll('[data-theme3-editor-type]').forEach(button => button.onclick = () => {
      stashActionEditorDraft(modal);
      const nextType = button.dataset.theme3EditorType;
      renderActionEditorTab(weapon, action, nextType, modal.dataset.voiceKey || action.voiceEntries?.[0]?.key || '');
    });
    document.getElementById('theme3-edit-voice-character').onchange = event => {
      stashActionEditorDraft(modal);
      renderActionEditorTab(weapon, action, 'voice', event.target.value);
    };
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function stashActionEditorDraft(modal) {
    if (!modal?._draft) return;
    if (modal.dataset.editType === 'sound') {
      modal._draft.soundStatus = document.getElementById('theme3-edit-sound-status').value;
    } else if (modal.dataset.voiceKey) {
      modal._draft.voices[modal.dataset.voiceKey] = {
        status: document.getElementById('theme3-edit-voice-status').value
      };
    }
  }

  function renderActionEditorTab(weapon, action, type, voiceKey) {
    const modal = document.getElementById('theme3-action-modal');
    const voiceEntries = action.voiceEntries || [];
    const voiceEntry = voiceEntries.find(entry => entry.key === voiceKey) || voiceEntries[0];
    if (type === 'voice' && !voiceEntry) { window.dashboardShowToast('此動作尚無角色語音資料。', 'error'); return; }
    const isSound = type === 'sound';
    modal.dataset.editType = type;
    modal.dataset.voiceKey = voiceEntry?.key || '';
    document.getElementById('theme3-action-modal-title').textContent = `${action.id}｜${action.command}${voiceEntry && !isSound ? `｜${voiceEntry.characterName}` : ''}`;
    document.querySelectorAll('[data-theme3-editor-type]').forEach(button => {
      const active = button.dataset.theme3EditorType === type;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.getElementById('theme3-edit-sound-status').innerHTML = EDITABLE_STATUSES.map(status => `<option value="${status}">${status}</option>`).join('');
    document.getElementById('theme3-edit-voice-status').innerHTML = EDITABLE_STATUSES.map(status => `<option value="${status}">${status}</option>`).join('');
    document.getElementById('theme3-edit-sound-status').value = modal._draft.soundStatus;
    document.getElementById('theme3-edit-voice-character').innerHTML = voiceEntries.map(entry => `<option value="${esc(entry.key)}" ${entry.key === voiceEntry?.key ? 'selected' : ''}>${esc(entry.characterName)}</option>`).join('');
    const voiceDraft = modal._draft.voices[voiceEntry?.key] || { status: voiceEntry?.voiceStatus };
    document.getElementById('theme3-edit-voice-status').value = voiceDraft.status;
    document.getElementById('theme3-edit-sound-field').hidden = !isSound;
    document.getElementById('theme3-voice-editor-row').hidden = isSound;
    const scopedDiscussions = (action.discussions || []).filter(entry => isSound
      ? entry.type !== '語音' || entry.type === '共用'
      : entry.type === '共用' || (entry.type === '語音' && entry.characterId === voiceEntry.characterId)).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const visibleDiscussions = modal._discussionExpanded ? scopedDiscussions : scopedDiscussions.slice(0, 3);
    document.querySelector('.theme3-discussion-section')?.classList.toggle('expanded', modal._discussionExpanded);
    document.getElementById('theme3-discussion-list').innerHTML = visibleDiscussions.map(entry => `<article><time>${esc(entry.author || '既有紀錄')}｜${esc(entry.date)}${entry.type === '共用' ? '｜共用' : ''}</time><p>${esc(entry.text)}</p></article>`).join('') || '<p class="theme3-no-discussion">尚無討論紀錄。</p>';
    if (scopedDiscussions.length > 3) {
      document.getElementById('theme3-discussion-list').insertAdjacentHTML('beforeend', `<button id="theme3-toggle-discussions" class="theme3-toggle-discussions" type="button">${modal._discussionExpanded ? '收合討論紀錄' : `顯示全部 ${scopedDiscussions.length} 筆討論`} <i class="fa-solid fa-chevron-${modal._discussionExpanded ? 'up' : 'down'}"></i></button>`);
      document.getElementById('theme3-toggle-discussions').addEventListener('click', () => { modal._discussionExpanded = !modal._discussionExpanded; renderActionEditorTab(weapon, action, type, voiceEntry?.key || ''); });
    }
  }

  function closeActionEditor() {
    const modal = document.getElementById('theme3-action-modal');
    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('body-scroll-lock');
  }

  function render() {
    const list = visibleWeapons();
    const grid = document.getElementById('theme3-weapon-grid');
    document.getElementById('theme3-result-count').textContent = `顯示 ${list.length} / ${weapons.length} 把武器`;
    grid.innerHTML = list.length ? list.map(weapon => {
      const status = aggregateStatus(weapon);
      if (!weapon.hasContent) return `<button class="theme3-weapon-card ${STATUS_CLASS[status]}" data-weapon="${esc(weapon.name)}" type="button"><div class="theme3-card-heading"><span class="theme3-kicker">尚無動作資料</span>${pill(status)}</div><h3>${esc(weapon.name)}</h3><div class="theme3-card-ready"><i class="fa-solid fa-circle-info"></i> 找不到同名分頁或可讀取的動作資料</div></button>`;
      return `<button class="theme3-weapon-card ${STATUS_CLASS[status]}" data-weapon="${esc(weapon.name)}" type="button"><div class="theme3-card-heading"><span class="theme3-kicker">${weapon.actionCount || (weapon.actions || []).length} 個動作${weapon.voiceCharacterCount ? ` · ${weapon.voiceCharacterCount} 位角色` : ''}</span>${pill(status)}</div><h3>${esc(weapon.name)}</h3><div class="theme3-card-progress">${progressStack(weapon, 'sound', '音效')}${progressStack(weapon, 'voice', '語音')}</div><div class="theme3-card-updated"><i class="fa-regular fa-clock"></i> 最後更新：${esc(weapon.lastUpdatedAt || '尚無紀錄')}</div></button>`;
    }).join('') : '<div class="theme3-empty">找不到符合條件的武器。</div>';
    grid.querySelectorAll('[data-weapon]').forEach(card => card.addEventListener('click', async () => { resetBatchEdit(); state.selected = card.dataset.weapon; state.detailType = 'sound'; state.detailStatus = '全部'; state.detailCharacter = '全部'; renderDetail(); document.getElementById('theme3-detail-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); await loadTheme3WeaponDetail(card.dataset.weapon); }));
    renderDetail();
  }

  function renderFilters() {
    const chips = ['全部', ...STATUS_ORDER];
    document.getElementById('theme3-status-chips').innerHTML = chips.map(status => {
      const count = status === '全部' ? weapons.length : weapons.filter(weapon => aggregateStatus(weapon) === status).length;
      return `<button class="theme3-filter-chip ${state.status === status ? 'active' : ''}" data-status="${status}" type="button">${status} <b>${count}</b></button>`;
    }).join('');
    view.querySelectorAll('[data-status]').forEach(chip => chip.addEventListener('click', () => { state.status = chip.dataset.status; renderFilters(); render(); }));
  }

  function setTheme3ApiStatus(text, icon, stateName) {
    const status = document.getElementById('theme3-api-status');
    if (!status) return;
    status.innerHTML = `<i class="fa-solid ${icon}"></i> ${text}`;
    status.classList.toggle('is-error', stateName === 'error');
    status.classList.toggle('is-connected', stateName === 'connected');
  }

  function normalizeApiWeapon(source) {
    const actions = Array.isArray(source.actions) ? source.actions.map(action => ({
      id: String(action.id || '').trim(),
      command: String(action.command || '').trim(),
      soundStatus: EDITABLE_STATUSES.includes(action.soundStatus) ? action.soundStatus : ({ '待確認': '未開始', '最終確認': '已確認' }[action.soundStatus] || '未開始'),
      soundNote: String(action.soundNote || '').trim(),
      voiceStatus: EDITABLE_STATUSES.includes(action.voiceStatus) ? action.voiceStatus : ({ '待確認': '未開始', '最終確認': '已確認' }[action.voiceStatus] || '未開始'),
      currentVoice: String(action.currentVoice || '').trim(),
      rowNumber: Number(action.rowNumber),
      discussions: Array.isArray(action.discussions) ? action.discussions : []
    })).filter(action => action.id || action.command) : [];
    const normalizeCounts = (input, property) => input ? ({ ...emptyCounts(), ...input }) : countsFor(actions, property);
    return {
      name: String(source.name || '未命名武器').trim(),
      style: String(source.style || '').trim(),
      hasContent: Boolean(source.hasContent),
      actionCount: Number(source.actionCount) || actions.length,
      voiceCharacterCount: Number(source.voiceCharacterCount) || 0,
      voiceRecordCount: Number(source.voiceRecordCount) || 0,
      soundUpdatedAt: String(source.soundUpdatedAt || '').trim(),
      voiceUpdatedAt: String(source.voiceUpdatedAt || '').trim(),
      lastUpdatedAt: String(source.lastUpdatedAt || '').trim(),
      soundCounts: normalizeCounts(source.soundCounts, 'soundStatus'),
      voiceCounts: normalizeCounts(source.voiceCounts, 'voiceStatus'),
      actions
    };
  }

  async function loadTheme3Api() {
    const initialSnapshot = weapons.length ? null : restoreSummarySnapshot();
    if (initialSnapshot) {
      weapons = initialSnapshot.payload.weapons.map(normalizeApiWeapon);
      renderStats();
      renderFilters();
      render();
    }
    window.dashboardSetLoading?.(!initialSnapshot, '音效／語音進度資料載入中，請稍候…');
    setTheme3ApiStatus('資料載入中', 'fa-circle-notch fa-spin', 'loading');
    try {
      const payload = await requestTheme3Json(`${THEME3_API_URL}?key=${encodeURIComponent(THEME3_API_KEY)}`);
      if (payload.error || !Array.isArray(payload.weapons)) throw new Error(payload.error || '主題三 API 回傳格式不正確');
      weapons = payload.weapons.map(normalizeApiWeapon);
      saveSummarySnapshot(payload);
      setTheme3ApiStatus('Google Sheet 已連線', 'fa-cloud', 'connected');
      renderStats();
      renderFilters();
      render();
    } catch (error) {
      console.error('Theme 3 Google Sheet API load failed', error);
      const snapshot = weapons.length ? null : restoreSummarySnapshot();
      if (snapshot) weapons = snapshot.payload.weapons.map(normalizeApiWeapon);
      setTheme3ApiStatus(weapons.length ? '連線失敗・顯示上次資料' : 'API 連線失敗', 'fa-triangle-exclamation', 'error');
      renderStats();
      renderFilters();
      if (weapons.length) {
        render();
        window.dashboardShowToast(`Google Sheet 暫時無法連線，已保留上次成功資料：${error.message}`, 'error');
      } else {
        const grid = document.getElementById('theme3-weapon-grid');
        if (grid) grid.innerHTML = '<div class="theme3-empty">無法連接 Google Sheet API，請確認 Apps Script 部署與 API Key。</div>';
      }
    } finally {
      window.dashboardSetLoading?.(false);
    }
  }

  async function loadTheme3WeaponDetail(weaponName) {
    const weapon = weapons.find(item => item.name === weaponName);
    if (!weapon || weapon.detailLoaded || weapon.detailLoading || !weapon.hasContent) return;
    weapon.detailLoading = true;
    try {
      const payload = await requestTheme3Json(`${THEME3_API_URL}?key=${encodeURIComponent(THEME3_API_KEY)}&weapon=${encodeURIComponent(weaponName)}`, { cache: 'no-store' }, 1);
      if (payload.error || !payload.weapon) throw new Error(payload.error || '武器明細回傳格式不正確');
      const detail = normalizeApiWeapon(payload.weapon);
      weapon.actions = detail.actions.map(action => ({ ...action, voiceEntries: Array.isArray(payload.weapon.actions?.find(source => String(source.id) === action.id)?.voiceEntries) ? payload.weapon.actions.find(source => String(source.id) === action.id).voiceEntries.map(entry => ({ ...entry, voiceStatus: EDITABLE_STATUSES.includes(entry.voiceStatus) ? entry.voiceStatus : ({ '待確認': '未開始', '最終確認': '已確認' }[entry.voiceStatus] || '未開始'), rowNumber: Number(entry.rowNumber) })) : [] }));
      weapon.detailLoaded = true;
      if (state.selected === weaponName) renderDetail();
    } catch (error) {
      console.error('Theme 3 weapon detail load failed', error);
      const panel = document.getElementById('theme3-detail-panel');
      if (state.selected === weaponName && panel) panel.innerHTML = `<div class="theme3-empty">無法讀取武器明細：${esc(error.message)}</div>`;
    } finally {
      weapon.detailLoading = false;
    }
  }

  async function updateTheme3Action(weapon, action, values) {
    const payload = await requestTheme3Json(`${THEME3_API_URL}?key=${encodeURIComponent(THEME3_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'updateAction',
        weaponName: weapon.name,
        actionId: action.id,
        rowNumber: action.rowNumber,
        soundStatus: values.sound,
        discussion: values.discussion
      })
    }, 0, THEME3_POST_TIMEOUT_MS);
    if (payload.error) throw new Error(payload.error || '寫入 Google Sheet 失敗');
  }

  async function updateTheme3WeaponStyle(weapon, style) {
    const payload = await requestTheme3Json(`${THEME3_API_URL}?key=${encodeURIComponent(THEME3_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'updateWeaponStyle', weaponName: weapon.name, style })
    }, 0, THEME3_POST_TIMEOUT_MS);
    if (payload.error) throw new Error(payload.error || '寫入確認總表失敗');
  }

  async function updateTheme3Voice(weapon, action, voiceEntry, values) {
    const payload = await requestTheme3Json(`${THEME3_API_URL}?key=${encodeURIComponent(THEME3_API_KEY)}`, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'updateVoiceRecord', weaponName: weapon.name, actionId: action.id, voiceKey: voiceEntry.key, voiceRowNumber: voiceEntry.rowNumber, voiceStatus: values.voice, discussion: values.discussion })
    }, 0, THEME3_POST_TIMEOUT_MS);
    if (payload.error) throw new Error(payload.error || '寫入角色語音資料失敗');
  }

  async function saveBatchStatuses(weapon, allRows, isSoundView) {
    if (state.batchSaving || !state.batchSelected.size) return;
    const selectedRows = allRows.filter(row => state.batchSelected.has(batchRowKey(row, isSoundView)));
    if (!selectedRows.length) return;
    if (!window.confirm(`確定將 ${selectedRows.length} 項${isSoundView ? '音效' : '語音'}狀態變更為「${state.batchStatus}」？`)) return;
    state.batchSaving = true;
    renderDetail();
    try {
      const items = selectedRows.map(row => ({
        rowNumber: Number(row.rowNumber),
        actionId: String(isSoundView ? row.id : row.actionId),
        key: isSoundView ? '' : String(row.key)
      }));
      const payload = await requestTheme3Json(`${THEME3_API_URL}?key=${encodeURIComponent(THEME3_API_KEY)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'batchUpdateStatuses', type: isSoundView ? 'sound' : 'voice', weaponName: weapon.name, status: state.batchStatus, items })
      }, 0, 60000);
      if (payload.error) throw new Error(payload.error || '批次更新失敗');

      if (isSoundView) {
        selectedRows.forEach(row => { row.soundStatus = state.batchStatus; });
        weapon.soundCounts = countsFor(weapon.actions, 'soundStatus');
      } else {
        const selectedKeys = new Set(selectedRows.map(row => String(row.key)));
        weapon.actions.forEach(action => (action.voiceEntries || []).forEach(entry => {
          if (selectedKeys.has(String(entry.key))) entry.voiceStatus = state.batchStatus;
        }));
        weapon.voiceCounts = countsFor(weapon.actions.flatMap(action => action.voiceEntries || []), 'voiceStatus');
      }
      const updatedCount = Number(payload.updated) || selectedRows.length;
      resetBatchEdit();
      renderStats();
      renderFilters();
      render();
      window.dashboardShowToast(`已批次更新 ${updatedCount} 項${isSoundView ? '音效' : '語音'}狀態`, 'success');
    } catch (error) {
      state.batchSaving = false;
      renderDetail();
      window.dashboardShowToast(`批次更新失敗：${error.message}`, 'error');
    }
  }

  document.getElementById('theme3-search-input')?.addEventListener('input', event => { state.query = event.target.value.trim().toLowerCase(); render(); });
  document.getElementById('theme3-reset-btn')?.addEventListener('click', () => { resetBatchEdit(); state.status = '全部'; state.query = ''; state.selected = null; const input = document.getElementById('theme3-search-input'); if (input) input.value = ''; renderFilters(); render(); });
  const theme3StatusHelpModal = document.getElementById('theme3-status-help-modal');
  const closeTheme3StatusHelp = () => {
    if (!theme3StatusHelpModal) return;
    theme3StatusHelpModal.classList.remove('open');
    theme3StatusHelpModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('body-scroll-lock');
  };
  document.getElementById('theme3-status-help-btn')?.addEventListener('click', () => {
    if (!theme3StatusHelpModal) return;
    theme3StatusHelpModal.classList.add('open');
    theme3StatusHelpModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('body-scroll-lock');
  });
  document.getElementById('theme3-status-help-close')?.addEventListener('click', closeTheme3StatusHelp);
  theme3StatusHelpModal?.addEventListener('click', event => { if (event.target === theme3StatusHelpModal) closeTheme3StatusHelp(); });
  document.getElementById('theme3-sync-voice-btn')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> 同步中…';
    try {
      const payload = await requestTheme3Json(`${THEME3_API_URL}?key=${encodeURIComponent(THEME3_API_KEY)}`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'syncVoiceMatrix' }) }, 0, 60000);
      if (payload.error) throw new Error(payload.error || '同步失敗');
      await loadTheme3Api();
      window.dashboardShowToast(payload.message || `已新增 ${payload.created || 0} 筆角色語音項目`, 'success');
    } catch (error) { window.dashboardShowToast(`同步失敗：${error.message}`, 'error'); }
    finally { button.disabled = false; button.innerHTML = '<i class="fa-solid fa-users-gear"></i> 同步角色語音項目'; }
  });
  document.getElementById('theme3-action-close')?.addEventListener('click', closeActionEditor);
  document.getElementById('theme3-action-cancel')?.addEventListener('click', closeActionEditor);
  document.getElementById('theme3-action-modal')?.addEventListener('click', event => { if (event.target.id === 'theme3-action-modal') closeActionEditor(); });
  document.getElementById('theme3-action-save')?.addEventListener('click', async () => {
    const modal = document.getElementById('theme3-action-modal');
    const { weapon, action } = actionFor(modal?.dataset.weapon, modal?.dataset.action);
    if (!weapon || !action) return;
    stashActionEditorDraft(modal);
    const editType = modal.dataset.editType || 'sound';
    const newDiscussion = document.getElementById('theme3-new-discussion').value.trim();
    const discussionAuthor = document.getElementById('theme3-discussion-author').value.trim();
    if (newDiscussion && !discussionAuthor) {
      window.dashboardShowToast('新增討論前請填寫留言人', 'error');
      return;
    }
    const saveButton = document.getElementById('theme3-action-save');
    saveButton.disabled = true;
    saveButton.textContent = '儲存中…';
    try {
      const voiceEntry = (action.voiceEntries || []).find(entry => entry.key === modal.dataset.voiceKey);
      const soundChanged = modal._draft.soundStatus !== action.soundStatus;
      const voiceChanges = (action.voiceEntries || []).filter(entry => {
        const draft = modal._draft.voices[entry.key] || {};
        return draft.status !== entry.voiceStatus;
      });
      const discussion = { author: discussionAuthor, message: newDiscussion, type: editType === 'sound' ? '音效' : '語音', characterId: editType === 'sound' ? '' : voiceEntry?.characterId || '', characterName: editType === 'sound' ? '' : voiceEntry?.characterName || '' };
      const saves = [];
      if (soundChanged || (newDiscussion && editType === 'sound')) saves.push(updateTheme3Action(weapon, action, { sound: modal._draft.soundStatus, discussion: editType === 'sound' ? discussion : {} }));
      voiceChanges.forEach(entry => {
        const draft = modal._draft.voices[entry.key];
        saves.push(updateTheme3Voice(weapon, action, entry, { voice: draft.status, discussion: editType === 'voice' && entry.key === voiceEntry?.key ? discussion : {} }));
      });
      if (newDiscussion && editType === 'voice' && !voiceChanges.some(entry => entry.key === voiceEntry?.key)) {
        const draft = modal._draft.voices[voiceEntry.key];
        saves.push(updateTheme3Voice(weapon, action, voiceEntry, { voice: draft.status, discussion }));
      }
      if (!saves.length) {
        window.dashboardShowToast('目前沒有需要儲存的變更。', 'error');
        return;
      }
      closeActionEditor();
      window.dashboardShowToast(`正在背景儲存 ${saves.length} 項變更；你可以繼續操作。`, 'success');
      Promise.all(saves).then(() => {
        if (newDiscussion) localStorage.setItem('sgf_theme3_discussion_author', discussionAuthor);
        if (soundChanged) action.soundStatus = modal._draft.soundStatus;
        voiceChanges.forEach(entry => { entry.voiceStatus = modal._draft.voices[entry.key].status; });
        if (newDiscussion) {
          action.discussions = action.discussions || [];
          action.discussions.push({
            date: new Date().toLocaleString('zh-TW', { hour12: false }),
            author: discussionAuthor,
            text: newDiscussion,
            type: discussion.type,
            characterId: discussion.characterId,
            characterName: discussion.characterName
          });
        }
        weapon.soundCounts = countsFor(weapon.actions, 'soundStatus');
        weapon.voiceCounts = countsFor(weapon.actions.flatMap(item => item.voiceEntries || []), 'voiceStatus');
        const updatedAt = new Date().toLocaleString('zh-TW', { hour12: false });
        if (soundChanged || (newDiscussion && editType === 'sound')) weapon.soundUpdatedAt = updatedAt;
        if (voiceChanges.length || (newDiscussion && editType === 'voice')) weapon.voiceUpdatedAt = updatedAt;
        weapon.lastUpdatedAt = updatedAt;
        renderStats();
        renderFilters();
        render();
        window.dashboardShowToast(`已儲存 ${saves.length} 項變更並同步至 Google Sheet`, 'success');
      }).catch(error => {
        console.error('Theme 3 Google Sheet API background update failed', error);
        window.dashboardShowToast(`背景儲存失敗：${error.message}`, 'error');
      });
    } catch (error) {
      console.error('Theme 3 Google Sheet API update failed', error);
      window.dashboardShowToast(`儲存失敗：${error.message}`, 'error');
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = '儲存全部變更';
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    closeActionEditor();
    closeTheme3StatusHelp();
  });
  renderStats();
  renderFilters();
  render();
  loadTheme3Api();
})();
