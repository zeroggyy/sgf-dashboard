/* Planning-only workspace. One IndexedDB record atomically holds snapshot + outbox.
 * No network writes occur outside the explicit Sync action. */
(() => {
  const clone = value => structuredClone(value);
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const nativeFetch = window.fetch.bind(window);
  const scope = appState.gasUrl;
  let db, workspace, busy = false, saving = false, revision = 0;
  const ready = new Promise((resolve, reject) => {
    const request = indexedDB.open('sgf-planning-offline', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspaces');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { db = request.result; resolve(); };
  }).then(async () => {
    workspace = await new Promise((resolve, reject) => {
      const request = db.transaction('workspaces').objectStore('workspaces').get(scope);
      request.onsuccess = () => resolve(request.result || { revision: 0, queue: [], snapshot: null });
      request.onerror = () => reject(request.error);
    });
    revision = workspace.revision;
  });
  ready.catch(error => { console.error(error); });
  async function commit(next) {
    await ready;
    const expectedRevision = revision;
    if (appState.gasUrl !== scope) throw new Error('資料來源已變更，請重新開啟頁面。');
    await new Promise((resolve, reject) => {
      const tx = db.transaction('workspaces', 'readwrite');
      const store = tx.objectStore('workspaces');
      const request = store.get(scope);
      request.onsuccess = () => {
        if ((request.result?.revision || 0) !== expectedRevision) { tx.abort(); return; }
        next.revision = expectedRevision + 1;
        store.put(next, scope);
      };
      tx.oncomplete = resolve;
      tx.onabort = tx.onerror = () => reject(new Error('本機保存失敗或另一分頁已修改資料。請保留輸入、關閉其他分頁後重新載入。'));
    });
    workspace = next; revision = next.revision; status();
    if (document.getElementById('planning-pending')) renderPending();
  }
  function snapshot() { return clone({ tasks: appState.tasks, milestones: appState.milestones, weeksList: appState.weeksList }); }
  function status() {
    const el = document.getElementById('planning-offline-status');
    if (el) el.textContent = `${navigator.onLine ? '本機工作模式' : '離線中'} · ${workspace?.queue.length || 0} 筆待同步 · ${workspace?.preparedAt ? '資料準備：' + new Date(workspace.preparedAt).toLocaleString() : '尚未準備離線資料'}`;
    document.querySelectorAll('[data-offline-action]').forEach(b => b.disabled = busy);
  }
  function apply() {
    applyMainDashboardPayload(clone(workspace.snapshot));
    if (scheduleModal.classList.contains('open')) renderMilestones();
    status();
  }
  async function readRemote() {
    const response = await window.dashboardFetch(`${scope}?key=${encodeURIComponent(appState.apiKey)}&fresh=1`);
    const value = await response.json();
    if (value.error || !Array.isArray(value.tasks) || !Array.isArray(value.milestones) || !Array.isArray(value.weeksList)) throw new Error(value.error || '資料格式不正確');
    return value;
  }
  async function shell() {
    if (!('serviceWorker' in navigator)) throw new Error('此瀏覽器不支援離線頁面，請使用 HTTPS 或 localhost。');
    await navigator.serviceWorker.register('./planning-sw.js', { scope: './' });
    const reg = await navigator.serviceWorker.ready;
    await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => reject(new Error('離線頁面準備逾時')), 30000);
      channel.port1.onmessage = e => { clearTimeout(timer); e.data.ok ? resolve() : reject(new Error(e.data.error)); };
      reg.active.postMessage({ type: 'PREPARE_PLANNING' }, [channel.port2]);
    });
  }
  async function prepare() {
    await ready;
    if (workspace.queue.length) throw new Error('請先同步待處理修改；準備資料不會覆蓋本機工作。');
    const payload = await readRemote();
    await shell();
    await commit({ ...workspace, snapshot: payload, preparedAt: Date.now() });
    apply(); showToast('離線資料與頁面已準備完成，可以開始使用。', 'success');
  }
  // Replace the initial/background GET: a saved workspace always wins, never refresh
  // over pending edits. First-time users must explicitly prepare their workspace.
  loadData = async () => {
    try {
      await ready;
      if (workspace.snapshot) { apply(); return true; }
      taskAccordion.textContent = '請先按「準備離線資料」，下載企劃任務、週進度與時程。';
      status(); return false;
    } catch (error) { showToast(error.message, 'error'); return false; }
  };
  runSortAndLoad = async () => {
    appState.tasks.sort((a, b) => String(a.taskId).localeCompare(String(b.taskId), undefined, { numeric: true }));
    renderTasks(); showToast('已依 ID 排序本機清單。', 'success');
  };
  function fields(body) {
    const values = {};
    const keys = body.action === 'updateMilestone' ? ['target', 'columnH'] : ['taskName', 'taskId', 'owner', 'coOwners', 'detail', 'taskLink', 'isDone'];
    keys.forEach(key => { if (key in body) values[key] = body[key]; });
    Object.entries(body.weeks || {}).forEach(([key, value]) => values['weeks.' + key] = value);
    return values;
  }
  const valueAt = (item, key) => key.startsWith('weeks.') ? item.weeks?.[key.slice(6)] || '' : item[key];
  function patch(item, values) {
    Object.entries(values).forEach(([key, value]) => {
      if (key.startsWith('weeks.')) { item.weeks ||= {}; item.weeks[key.slice(6)] = value; }
      else item[key] = value;
    });
  }
  syncTaskToGoogleSheet = async (row, payload) => {
    if (saving) { lastTaskSyncError = '另一筆本機保存進行中，請稍後。'; return false; }
    saving = true;
    try {
      await ready;
      if (busy) throw new Error('同步進行中，請稍後再儲存。');
      if (!workspace.snapshot) throw new Error('請先準備離線資料。');
      const next = clone(workspace), body = clone(payload);
      const list = body.action === 'updateMilestone' ? next.snapshot.milestones : next.snapshot.tasks;
      let item = list.find(t => t.rowNumber == row);
      let existing = next.queue.find(op => op.localRow == row && op.kind === body.action);
      // Local creates remain one operation even when edited repeatedly.
      if (!existing && item) existing = next.queue.find(op => op.localRow == row && op.kind === 'createTask');
      if (existing?.attempted) throw new Error('此項目曾送出同步，請先完成同步或處理結果，再修改內容。');
      if (body.action === 'createTask') {
        const localRow = 'local-' + crypto.randomUUID();
        item = { ...body, rowNumber: localRow, group: '未分類', progress: 0, isDone: false };
        delete item.action; list.push(item);
        next.queue.push({ localRow, kind: body.action, body, before: {}, label: body.taskName });
        lastTaskSyncResult = { success: true, task: clone(item) };
      } else {
        if (!item) throw new Error('找不到本機項目，尚未保存。');
        const changes = fields(body), before = {};
        Object.keys(changes).forEach(key => {
          if (equal(changes[key], valueAt(item, key))) {
            delete changes[key];
            if (key.startsWith('weeks.')) delete body.weeks[key.slice(6)]; else delete body[key];
          }
        });
        if (!Object.keys(changes).length) { lastTaskSyncResult = { success: true }; return true; }
        Object.keys(changes).forEach(key => before[key] = clone(valueAt(item, key)));
        if (existing) {
          if (existing.kind === 'createTask') {
            Object.assign(existing.body, Object.fromEntries(Object.entries(changes).filter(([key]) => !key.startsWith('weeks.'))));
            existing.body.weeks = { ...existing.body.weeks, ...body.weeks };
          } else {
            existing.before = { ...before, ...existing.before };
            Object.assign(existing.body, body);
            existing.body.weeks = { ...fieldsToWeeks(existing.changes || {}), ...body.weeks };
          }
          existing.changes = { ...existing.changes, ...changes };
          existing.conflict = null;
        } else next.queue.push({ localRow: row, kind: body.action, body, before, changes, identity: body.action === 'updateMilestone' ? item.date : item.taskId, label: item.taskName || item.date });
        patch(item, changes);
        lastTaskSyncResult = { success: true };
      }
      await commit(next); planningWriteVersion++;
      lastTaskSyncError = ''; return true;
    } catch (error) { lastTaskSyncError = error.message; return false; }
    finally { saving = false; }
  };
  function fieldsToWeeks(changes) { return Object.fromEntries(Object.entries(changes).filter(([key]) => key.startsWith('weeks.')).map(([key, value]) => [key.slice(6), value])); }
  async function post(body) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await nativeFetch(`${scope}?key=${encodeURIComponent(appState.apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return result;
    } finally { clearTimeout(timer); }
  }
  async function sync() {
    await ready;
    if (!workspace.queue.length) { showToast('沒有待同步的修改。', 'info'); return; }
    const capability = await (await window.dashboardFetch(`${scope}?key=${encodeURIComponent(appState.apiKey)}&mode=capabilities`)).json();
    if (capability.planningOffline !== 'cas-v1') throw new Error('請先部署新版企劃 Apps Script（支援離線衝突核對），本機修改仍保留。');
    let completed = 0;
    for (const saved of [...workspace.queue]) {
      const next = clone(workspace), op = next.queue.find(x => x.localRow === saved.localRow && x.kind === saved.kind);
      if (op.conflict) continue;
      if (!op.wire) {
        op.wire = { ...op.body, offlineSync: { identity: op.identity, before: op.before }, requestId: `${Date.now()}_${crypto.randomUUID()}` };
      }
      op.attempted = true;
      await commit(next); // Save exact request before sending; retries replay identical bytes.
      let result;
      try { result = await post(op.wire); }
      catch (error) { await mark(op, { error: '結果待確認：' + error.message }); break; }
      if (result.code === 'CONFLICT') { await mark(op, { conflict: result.conflict, attempted: false, wire: null, error: null }); continue; }
      if (!result.success) { await mark(op, { error: result.error || '未收到成功確認，請再次同步查詢原提交。' }); break; }
      const done = clone(workspace);
      done.queue = done.queue.filter(x => !(x.localRow === op.localRow && x.kind === op.kind));
      if (op.kind === 'createTask') {
        if (!result.task) throw new Error('新增結果缺少任務資料，本機提交保留。');
        done.snapshot.tasks = done.snapshot.tasks.map(t => t.rowNumber === op.localRow ? result.task : t);
      }
      await commit(done); completed++;
    }
    apply(); renderPending();
    showToast(`已同步 ${completed} 筆，剩餘 ${workspace.queue.length} 筆。`, workspace.queue.length ? 'info' : 'success');
  }
  async function mark(op, values) {
    const next = clone(workspace);
    Object.assign(next.queue.find(x => x.localRow === op.localRow && x.kind === op.kind), values);
    await commit(next);
  }
  function renderPending() {
    const container = document.getElementById('planning-pending'); container.replaceChildren();
    for (const op of workspace.queue) {
      const row = document.createElement('div'); row.style.cssText = 'padding:.6rem;border-top:1px solid #aaa';
      const label = document.createElement('p'); label.textContent = `${op.label}：${op.conflict?.reason || op.error || '等待同步'}`; row.append(label);
      if (op.attempted && op.error) {
        const check = document.createElement('button'); check.className = 'btn'; check.textContent = '查詢提交狀態與最新 Sheet 資料';
        check.onclick = () => perform(async () => {
          const receipt = await (await window.dashboardFetch(`${scope}?key=${encodeURIComponent(appState.apiKey)}&mode=writeReceipt&requestId=${encodeURIComponent(op.wire.requestId)}`)).json();
          if (receipt.error) throw new Error(receipt.error);
          const latest = await readRemote();
          const rows = op.kind === 'updateMilestone' ? latest.milestones.filter(t => t.date === op.identity) : latest.tasks.filter(t => t.taskId === (op.body.taskId || op.identity));
          await mark(op, { receiptState: receipt.state, remoteRows: rows });
        }); row.append(check);
        if (op.receiptState) {
          const info = document.createElement('pre'); info.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere';
          info.textContent = `提交：${op.wire.requestId}\n收據狀態：${op.receiptState}\nSheet 最新資料：\n${JSON.stringify(op.remoteRows, null, 2)}`; row.append(info);
          if (op.receiptState === 'done') {
            const hint = document.createElement('p'); hint.textContent = '伺服器已完成；再次按同步即可取得原結果，不會重複寫入。'; row.append(hint);
          } else {
            const hint = document.createElement('p'); hint.textContent = '狀態不明時，需由管理者確認 Apps Script 執行已結束及每個欄位結果。若部分成功，可選重新核對，系統仍會檢查原值衝突。'; row.append(hint);
            for (const applied of [true, false]) {
              const resolve = document.createElement('button'); resolve.className = 'btn';
              resolve.textContent = applied ? '人工確認全部已寫入，結束此提交' : '人工確認執行已結束，重新核對此修改';
              resolve.onclick = () => perform(async () => {
                if (!confirm('請先核對 Apps Script 執行紀錄，確認原執行已結束，並逐欄核對 Sheet。這不是自動判定，確定已完成核對？')) return;
                if (applied) {
                  const latest = await readRemote();
                  const matches = op.kind === 'updateMilestone' ? latest.milestones.filter(t => t.date === op.identity) : latest.tasks.filter(t => t.taskId === (op.body.taskId || op.identity));
                  if (matches.length !== 1 || Object.entries(fields(op.body)).some(([key, value]) => !equal(valueAt(matches[0], key), value))) throw new Error('Sheet 值與提交內容不一致，不能標示全部成功；請重新核對。');
                  const next = clone(workspace);
                  next.queue = next.queue.filter(x => !(x.localRow === op.localRow && x.kind === op.kind));
                  const list = op.kind === 'updateMilestone' ? next.snapshot.milestones : next.snapshot.tasks;
                  const index = list.findIndex(t => t.rowNumber == op.localRow); list[index] = matches[0];
                  await commit(next); apply();
                } else await mark(op, { attempted: false, wire: null, error: null, receiptState: null, remoteRows: null });
              }); row.append(resolve);
            }
          }
        }
      }
      if (op.conflict?.fields?.length) {
        for (const field of op.conflict.fields) {
          const p = document.createElement('p'); p.textContent = `${field.field}｜原值：${JSON.stringify(field.before)}｜本機：${JSON.stringify(op.changes[field.field])}｜Sheet：${JSON.stringify(field.remote)}`; row.append(p);
        }
        for (const keepLocal of [true, false]) {
          const button = document.createElement('button'); button.className = 'btn';
          button.textContent = keepLocal ? '保留本機修改，下次同步再核對' : '衝突欄位採用 Sheet 值';
          button.onclick = () => perform(async () => {
            const next = clone(workspace), target = next.queue.find(x => x.localRow === op.localRow && x.kind === op.kind);
            const item = (op.kind === 'updateMilestone' ? next.snapshot.milestones : next.snapshot.tasks).find(t => t.rowNumber == op.localRow);
            op.conflict.fields.forEach(field => {
              target.before[field.field] = field.remote;
              if (!keepLocal) { target.changes[field.field] = field.remote; patch(item, { [field.field]: field.remote }); }
            });
            Object.assign(target.body, Object.fromEntries(Object.entries(target.changes).filter(([key]) => !key.startsWith('weeks.'))));
            target.body.weeks = fieldsToWeeks(target.changes);
            target.conflict = null; target.wire = null; target.attempted = false;
            await commit(next); apply(); renderPending();
          }); row.append(button);
        }
      }
      if (op.conflict && !op.conflict.fields?.length) {
        const hint = document.createElement('p'); hint.textContent = '請先核對 Sheet；新增任務可在本機修改 ID 後再同步。已刪除或重複識別碼需修復 Sheet，再按下方重新核對。'; row.append(hint);
        const retry = document.createElement('button'); retry.className = 'btn'; retry.textContent = '已核對，重新檢查';
        retry.onclick = () => perform(async () => { await mark(op, { conflict: null }); renderPending(); }); row.append(retry);
      }
      container.append(row);
    }
  }
  async function perform(action) {
    if (busy || saving || taskSubmitInFlight) return;
    busy = true; status();
    try { await action(); }
    catch (error) { showToast(error.message, 'error'); }
    finally { busy = false; status(); if (workspace) renderPending(); }
  }
  window.addEventListener('DOMContentLoaded', () => {
    const panel = document.createElement('section'); panel.id = 'planning-offline-panel';
    panel.style.cssText = 'margin:1rem;padding:1rem;border:2px solid currentColor;background:var(--bg-color,#fffaf0)';
    panel.innerHTML = '<p id="planning-offline-status" role="status">正在開啟本機資料…</p><div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="btn" data-offline-action id="planning-prepare">準備離線資料</button><button class="btn" data-offline-action id="planning-sync">同步 Google Sheet</button><button class="btn" data-offline-action id="planning-export">匯出本機備份</button></div><small>編輯後請按「儲存到本機」。同步前其他人看不到修改。外部文件與未下載的圖片需要網路。</small><details><summary>待同步項目與衝突處理</summary><div id="planning-pending"></div></details>';
    taskAccordion.before(panel);
    document.getElementById('planning-prepare').onclick = () => perform(prepare);
    document.getElementById('planning-sync').onclick = () => perform(sync);
    document.getElementById('planning-export').onclick = () => perform(async () => {
      await ready;
      const url = URL.createObjectURL(new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'sgf-planning-workspace.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    document.getElementById('save-task-btn').textContent = '儲存到本機';
    document.getElementById('save-milestone-modal-btn').textContent = '儲存到本機';
    refreshBtn.title = '依 ID 排序本機清單';
    ready.then(() => { status(); renderPending(); }).catch(error => showToast('無法開啟本機儲存：' + error.message, 'error'));
  });
  window.addEventListener('online', status); window.addEventListener('offline', status);
  const saveOriginalConfiguration = saveConfiguration;
  saveConfiguration = () => {
    if (!workspace || busy || saving || workspace.queue.length) { showToast('請先完成本機修改同步，再變更資料來源。', 'error'); return; }
    saveOriginalConfiguration();
    location.reload();
  };
  window.addEventListener('beforeunload', e => { if (busy || isDrawerDirty()) { e.preventDefault(); e.returnValue = ''; } });
})();
