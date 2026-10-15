// Shared transport: no automatic POST retry; no credentials or task text in diagnostics.
(function () {
  const nativeFetch = window.fetch.bind(window);
  const inflight = new Map();
  const endpoints = new Map();
  const reliableEndpoints = new Set();
  let activeWrites = 0;
  let frozenControls = [];
  window.dashboardHasPendingWrite = () => activeWrites > 0;
  function freezeForms() {
    if (activeWrites++ > 0) return;
    frozenControls = [...document.querySelectorAll('form input, form select, form textarea')].map(element => [element, element.disabled]);
    frozenControls.forEach(([element]) => { element.disabled = true; });
  }
  function thawForms() {
    if (--activeWrites > 0) return;
    frozenControls.forEach(([element, disabled]) => { element.disabled = disabled; }); frozenControls = [];
  }
  const logKey = 'sgf_api_diagnostics_v1';
  const pendingKey = 'sgf_api_pending_v1';
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
  const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
  function record(entry) { write(logKey, [...read(logKey), { at: new Date().toISOString(), ...entry }].slice(-100)); }
  window.dashboardDownloadApiLog = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(read(logKey), null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'sgf-api-diagnostics.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  window.dashboardFetch = async function (url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const post = method === 'POST';
    const parsedUrl = new URL(url, location.href);
    const endpoint = await digest(parsedUrl.origin + parsedUrl.pathname);
    const baseUrl = new URL(parsedUrl); baseUrl.searchParams.delete('mode'); baseUrl.searchParams.delete('requestId');
    endpoints.set(endpoint, baseUrl.toString());
    let body = post ? JSON.parse(options.body || '{}') : null;
    const action = body?.action || parsedUrl.searchParams.get('mode') || parsedUrl.searchParams.get('section') || 'read';
    let fingerprint, requestId;
    if (post) {
      if (!reliableEndpoints.has(endpoint)) {
        const capabilityUrl = new URL(url); capabilityUrl.searchParams.set('mode', 'capabilities');
        const check = await window.dashboardFetch(capabilityUrl.toString());
        const capability = await check.json();
        if (capability.apiVersion !== 'reliable-v1') throw new Error('此 API 尚未部署防重複寫入版本，為保護資料已暫停寫入；請先更新 Apps Script。');
      }
      fingerprint = await digest(endpoint + JSON.stringify(body));
      const scope = await digest(endpoint + ':' + action + ':' + (body.itemId || body.iconId || body.voiceKey || body.weaponName || body.taskId || body.rowNumber || 'new'));
      const records = read(pendingKey).filter(item => item.state !== 'resolved' && (item.state !== 'done' || Date.now() - item.at < 600000));
      const existing = records.find(item => item.fingerprint === fingerprint);
      if (!existing && records.some(item => item.scope === scope && item.state === 'pending')) {
        throw new Error('這個項目有一筆結果尚未確認的提交；請先使用頁尾「連線診斷」確認寫入結果，不要改內容後重複新增。');
      }
      requestId = existing?.requestId || `${Date.now()}_${crypto.randomUUID()}`;
      body = { ...body, requestId };
      const pending = records.filter(item => item.fingerprint !== fingerprint);
      if (!write(pendingKey, [...pending, { fingerprint, requestId, endpoint, scope, action, at: Date.now(), state: 'pending', draft: body }])) throw new Error('本機儲存空間不足，無法安全保留提交草稿；尚未送出寫入。');
    }
    const key = post ? requestId : url;
    if (inflight.has(key)) return (await inflight.get(key)).clone();
    const work = (async () => {
      const start = performance.now();
      const controller = new AbortController();
      const abort = () => controller.abort();
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) abort();
      const timer = setTimeout(abort, post ? 60000 : 45000);
      let http, payload;
      if (post) freezeForms();
      try {
        const response = await nativeFetch(url, { ...options, ...(post ? { body: JSON.stringify(body) } : {}), signal: controller.signal });
        http = response.status;
        const text = await response.text();
        try { payload = JSON.parse(text); } catch { throw new Error(`API 未回傳 JSON（HTTP ${http}），不能據此判定部署有誤`); }
        if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${http}`);
        if (payload.apiVersion === 'reliable-v1') reliableEndpoints.add(endpoint);
        if (post && payload.ok !== true && payload.success !== true) throw new Error('未收到明確的儲存成功確認');
        if (post) write(pendingKey, read(pendingKey).map(item => item.requestId === requestId ? { ...item, state: 'done', draft: undefined } : item));
        record({ page: location.pathname, action, method, requestId, ms: Math.round(performance.now() - start), http, outcome: 'success', cached: payload.cached, server: payload.diagnostics });
        return new Response(text, { status: response.status, headers: { 'Content-Type': 'application/json' } });
      } catch (error) {
        record({ page: location.pathname, action, method, requestId, ms: Math.round(performance.now() - start), http, outcome: post ? 'unconfirmed' : 'failed', code: error.name === 'AbortError' ? 'timeout' : (payload?.code || 'request_error') });
        if (post) {
          const wrapped = new Error(`儲存結果待確認，內容已保留；請先查看 Sheet，避免重複新增。${error.message}（追蹤碼 ${requestId}）`);
          wrapped.requestId = requestId; wrapped.uncertain = true; throw wrapped;
        }
        throw error;
      } finally {
        if (post) thawForms();
        clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
      }
    })();
    inflight.set(key, work);
    try { return (await work).clone(); } finally { inflight.delete(key); }
  };
  function controls() {
    const details = document.createElement('details');
    details.style.cssText = 'margin:1rem;padding:.6rem;position:relative;font-size:14px';
    const summary = document.createElement('summary'); summary.textContent = '連線診斷';
    const text = document.createElement('p'); text.textContent = '最近 100 筆連線耗時與結果，不含 API 金鑰、網址或任務內容。遇到問題時可下載交付檢查。';
    const button = document.createElement('button'); button.type = 'button'; button.textContent = '下載連線紀錄'; button.onclick = window.dashboardDownloadApiLog;
    const check = document.createElement('button'); check.type = 'button'; check.textContent = '確認未完成的寫入';
    const results = document.createElement('p');
    check.onclick = async () => {
      check.disabled = true;
      const messages = [];
      try {
        for (const item of read(pendingKey).filter(item => item.state === 'pending')) {
          const endpoint = endpoints.get(item.endpoint);
          if (!endpoint) continue; // 其他控制台的收據，回該頁確認。
          try {
            const url = new URL(endpoint); url.searchParams.set('mode', 'writeReceipt'); url.searchParams.set('requestId', item.requestId);
            const response = await window.dashboardFetch(url.toString()); const result = await response.json();
            if (result.state === 'done') write(pendingKey, read(pendingKey).map(row => row.requestId === item.requestId ? { ...row, state: 'done' } : row));
            messages.push(`${item.action}：${result.state === 'done' ? '已完成，可重新整理清單' : result.state === 'started' ? '結果仍待核對，請查看 Sheet' : '查無確認收據；請核對 Sheet 與部署版本'}（${item.requestId}）`);
          } catch (error) { messages.push(`${item.action}：確認連線失敗，請稍後再查`); }
        }
        results.textContent = messages.join('；') || '此頁沒有待確認的提交。';
        for (const item of read(pendingKey).filter(item => item.state === 'pending' && endpoints.has(item.endpoint))) {
          const resolve = document.createElement('button'); resolve.type = 'button'; resolve.textContent = `人工核對後解除 ${item.action}（${item.requestId.slice(-8)}）`;
          resolve.onclick = () => {
            if (!window.confirm('請先確認 Apps Script 該次執行已結束，並核對 Sheet。若已寫入，請重新整理清單而不要再新增；若確定未寫入，才重新提交。確定已人工核對？')) return;
            write(pendingKey, read(pendingKey).map(row => row.requestId === item.requestId ? { ...row, state: 'resolved', at: 0 } : row));
            resolve.disabled = true;
          };
          results.append(resolve);
        }
      } finally { check.disabled = false; }
    };
    const drafts = document.createElement('button'); drafts.type = 'button'; drafts.textContent = '下載保留的提交草稿（含內容）';
    drafts.onclick = () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(read(pendingKey).filter(item => item.draft).map(({ action, requestId, draft }) => ({ action, requestId, draft })), null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'sgf-preserved-drafts.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    details.append(summary, text, button, check, drafts, results); document.body.append(details);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', controls); else controls();
})();
