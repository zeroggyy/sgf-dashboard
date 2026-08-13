(function setupIconProgress() {
  const view = document.getElementById('theme-view-theme4');
  if (!view) return;
  const API_URL_KEY = 'sgf_icon_gas_url';
  const API_KEY_KEY = 'sgf_icon_api_key';
  const CACHE_KEY = 'sgf_icon_last_success_payload';
  const STAGES = [
    ['planning', '待企劃需求'], ['art', '待美術完稿'], ['export', '待輸出切圖'],
    ['review', '待企劃驗收'], ['returned', '退回處理中'], ['completed', '已結案'], ['na', '不適用']
  ];
  const STAGE_LABELS = Object.fromEntries(STAGES);
  let apiUrl = localStorage.getItem(API_URL_KEY) || '';
  let apiKey = localStorage.getItem(API_KEY_KEY) || '';
  let icons = [], locales = [], selectedIcon = null, editing = false, openGroup = '';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const trueValue = value => String(value).toUpperCase() === 'TRUE';
  const gyazoId = value => String(value || '').match(/gyazo\.com\/(?:public\/)?([a-z0-9]+)/i)?.[1] || '';
  const showToast = (message, type = 'info') => window.dashboardShowToast?.(message, type);
  function stageOf(row) {
    const method = String(row['規格處理方式'] || '');
    if (trueValue(row['退回修改中'])) return 'returned';
    if (/不修改|系統字|特效|自動產生|不適用/.test(method) || row['目前階段'] === '不適用') return 'na';
    if (!trueValue(row['企劃需求完成'])) return row['目前階段'] === '已結案' ? 'completed' : 'planning';
    if (!trueValue(row['美術完稿完成'])) return 'art';
    if (!trueValue(row['輸出切圖完成'])) return 'export';
    if (!trueValue(row['企劃驗收完成'])) return 'review';
    return 'completed';
  }
  function missingOf(row) {
    const missing = [];
    if (!row['Icon ID']) missing.push('Icon ID');
    if (!row['項目名稱']) missing.push('項目名稱');
    if (!row['主要尺寸'] && !/系統字|特效|自動產生/.test(row['規格處理方式'] || '')) missing.push('主要尺寸');
    if (!row['檔名'] && stageOf(row) === 'completed' && !/系統字|特效|自動產生|不修改/.test(row['規格處理方式'] || '')) missing.push('檔名');
    if (!row['輸出路徑'] && trueValue(row['輸出切圖完成'])) missing.push('輸出路徑');
    return missing;
  }
  function rebuild(payload) {
    locales = Array.isArray(payload.locales) ? payload.locales : [];
    const byIcon = new Map();
    locales.forEach(locale => { const id = String(locale['Icon ID'] || '').trim(); if (!byIcon.has(id)) byIcon.set(id, []); byIcon.get(id).push(locale); });
    icons = (payload.icons || []).map((raw, index) => ({ raw, index, id: String(raw['Icon ID'] || '').trim(), name: raw['項目名稱'] || raw['Icon ID'] || `未命名 ${index + 1}`, type: raw['類型'] || '未分類', subtype: raw['子類型'] || '未分類', stage: stageOf(raw), missing: missingOf(raw), locales: byIcon.get(String(raw['Icon ID'] || '').trim()) || [] }));
    populateFilters(); applyFilters();
  }
  const unique = field => [...new Set(icons.map(item => item.raw[field]).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'zh-Hant'));
  function fillSelect(id, values, allLabel) { const select = $(id); const current = select.value; select.innerHTML = `<option value="all">${allLabel}</option>` + values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join(''); if ([...select.options].some(option => option.value === current)) select.value = current; }
  function populateFilters() { fillSelect('icon-type-filter', unique('類型'), '全部類型'); fillSelect('icon-subtype-filter', unique('子類型'), '全部子類型'); fillSelect('icon-ui-filter', unique('UI 機制'), '全部 UI 機制'); fillSelect('icon-stage-filter', STAGES.map(([, label]) => label), '全部階段'); }
  function stats() {
    const configs = [['all','Icon 總數'],['planning','待企劃需求'],['art','待美術完稿'],['export','待輸出切圖'],['review','待企劃驗收'],['returned','退回處理中'],['completed','已結案']];
    const selectedLabel = $('icon-stage-filter').value;
    $('icon-stats').innerHTML = configs.map(([stage,label]) => { const active = stage === 'all' ? selectedLabel === 'all' : selectedLabel === STAGE_LABELS[stage]; return `<button class="icon-stat ${stage === 'returned' ? 'is-alert' : ''} ${active ? 'active' : ''}" data-stat-stage="${stage}" type="button" aria-pressed="${active}" title="${active && stage !== 'all' ? `取消「${esc(label)}」篩選` : `只顯示「${esc(label)}」`}"><span>${label}</span><strong>${stage === 'all' ? icons.length : icons.filter(item => item.stage === stage).length}</strong><small>${active ? '篩選中' : '點擊篩選'}</small></button>`; }).join('');
    $('icon-stats').querySelectorAll('[data-stat-stage]').forEach(button => button.addEventListener('click', () => { const target = button.dataset.statStage === 'all' ? 'all' : STAGE_LABELS[button.dataset.statStage]; $('icon-stage-filter').value = $('icon-stage-filter').value === target && target !== 'all' ? 'all' : target; applyFilters(); }));
  }
  function applyFilters() {
    const query = $('icon-search-input').value.trim().toLowerCase(); const type = $('icon-type-filter').value; const subtype = $('icon-subtype-filter').value; const stage = $('icon-stage-filter').value; const ui = $('icon-ui-filter').value; const locale = $('icon-locale-filter').value; const special = $('icon-special-filters').querySelector('.active')?.dataset.filter || 'all';
    const filtered = icons.filter(item => {
      const raw = item.raw; const haystack = [item.id,item.name,raw['檔名'],raw['使用位置'],raw['UI 機制'],raw['備註']].join(' ').toLowerCase();
      const localeIncomplete = item.locales.some(entry => !entry['翻譯狀態'] || !trueValue(entry['語系圖完成']));
      return (!query || haystack.includes(query)) && (type === 'all' || raw['類型'] === type) && (subtype === 'all' || raw['子類型'] === subtype) && (stage === 'all' || STAGE_LABELS[item.stage] === stage) && (ui === 'all' || raw['UI 機制'] === ui) && (locale === 'all' || (locale === 'has' && item.locales.length) || (locale === 'missing' && !item.locales.length) || (locale === 'incomplete' && item.locales.length && localeIncomplete)) && (special === 'all' || (special === 'returned' && item.stage === 'returned') || (special === 'missing' && item.missing.length) || (special === 'no-preview' && !raw['預覽圖連結']));
    });
    stats(); renderGroups(filtered); $('icon-result-count').textContent = `${filtered.length} / ${icons.length} 項`;
  }
  function renderGroups(filtered) {
    const groups = new Map(); filtered.forEach(item => { const key = `${item.type}｜${item.subtype}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); });
    if (!groups.size) { $('icon-groups').innerHTML = '<div class="icon-empty">沒有符合條件的 Icon</div>'; return; }
    if (!groups.has(openGroup) && groups.size === 1) openGroup = groups.keys().next().value;
    $('icon-groups').innerHTML = [...groups.entries()].map(([key, group]) => {
      const [type, subtype] = key.split('｜'); const open = key === openGroup;
      const rows = group.map(item => { const raw = item.raw; const previewUrl = raw['預覽圖連結']; const imageId = gyazoId(previewUrl); const preview = imageId ? `<img src="https://i.gyazo.com/${esc(imageId)}.jpg" alt="${esc(item.name)}" loading="lazy">` : '<i class="fa-regular fa-image"></i>'; const flags = [item.missing.length ? `待補 ${item.missing.length}` : '', item.locales.length ? `${item.locales.length} 語系` : '', item.stage === 'returned' ? '退回' : ''].filter(Boolean); const previewLink = previewUrl ? `<a class="icon-preview-link" href="${esc(previewUrl)}" target="_blank" rel="noopener" title="另開預覽圖"><i class="fa-solid fa-arrow-up-right-from-square"></i> 預覽圖</a>` : '<span class="icon-preview-missing">無預覽圖</span>'; return `<div class="icon-list-row ${item.missing.length ? 'has-missing' : ''} ${item.stage === 'returned' ? 'is-returned' : ''}" data-icon-index="${item.index}"><button class="icon-row-main" type="button" aria-label="查看 ${esc(item.name)} 詳細資料"><span class="icon-thumb">${preview}</span><span class="icon-row-id">${esc(item.id || '待填 Icon ID')}</span><strong class="icon-row-name">${esc(item.name)}</strong><span class="icon-row-file">${esc(raw['檔名'] || '檔名待補')}</span><span class="icon-row-size">${esc(raw['主要尺寸'] || '尺寸待補')}</span><span class="icon-row-stage">${esc(STAGE_LABELS[item.stage])}</span><span class="icon-flags">${flags.map(flag => `<em>${esc(flag)}</em>`).join('')}</span></button>${previewLink}</div>`; }).join('');
      return `<section class="icon-group ${open ? 'open' : ''}" data-group="${esc(key)}"><button class="icon-group-toggle" type="button"><span><strong>${esc(type)}</strong><small> · ${esc(subtype)}</small></span><small>${group.length} 項</small><i class="fa-solid fa-chevron-down"></i></button><div class="icon-group-body"><div class="icon-list-head"><span>縮圖</span><span>Icon ID</span><span>項目名稱</span><span>檔名</span><span>尺寸</span><span>製作階段</span><span>狀態</span><span>連結</span></div><div class="icon-list">${rows}</div></div></section>`;
    }).join('');
    $('icon-groups').querySelectorAll('.icon-group-toggle').forEach(button => button.addEventListener('click', () => { const group = button.closest('.icon-group'); openGroup = group.classList.contains('open') ? '' : group.dataset.group; renderGroups(filtered); }));
    $('icon-groups').querySelectorAll('.icon-row-main').forEach(button => button.addEventListener('click', () => { const row=button.closest('[data-icon-index]'); openDetail(icons.find(item => item.index === Number(row.dataset.iconIndex))); }));
  }
  const pathRow = (label, value) => `<div><b>${label}：</b>${esc(value || '待補')}</div>`;
  function openDetail(item) { selectedIcon = item; editing = false; renderDetail(); $('icon-detail-modal').classList.add('open'); $('icon-detail-modal').setAttribute('aria-hidden','false'); document.body.classList.add('body-scroll-lock'); }
  function renderDetail() {
    if (!selectedIcon) return; const item = selectedIcon; const raw = item.raw; $('icon-detail-title').textContent = item.name;
    if (editing) { renderEditor(item); return; }
    const imageId = gyazoId(raw['預覽圖連結']); const preview = imageId ? `<a class="icon-detail-preview" href="${esc(raw['預覽圖連結'])}" target="_blank" rel="noopener"><img src="https://i.gyazo.com/${esc(imageId)}.jpg" alt="${esc(item.name)}"></a>` : '';
    const progress = [['企劃需求完成','企劃需求'],['美術完稿完成','美術完稿'],['輸出切圖完成','輸出切圖'],['企劃驗收完成','企劃驗收']].map(([key,label]) => `<div class="icon-progress-item ${trueValue(raw[key]) ? 'done' : ''}"><i class="fa-solid ${trueValue(raw[key]) ? 'fa-circle-check' : 'fa-circle'}"></i> ${label}</div>`).join('');
    const localeCards = item.locales.length ? item.locales.map(locale => `<article class="icon-locale-card"><b>${esc(locale['語言'])}</b><p>${esc(locale['顯示文字'] || '文字待補')}</p><small>${esc(locale['翻譯狀態'] || '狀態待補')} · ${trueValue(locale['語系圖完成']) ? '語系圖完成' : '語系圖待確認'}</small><button data-edit-locale="${esc(locale['語言'])}" type="button">編輯語系</button></article>`).join('') : '<div class="icon-empty">此 Icon 沒有語系資料</div>';
    $('icon-detail-body').innerHTML = `<div class="icon-detail-actions"><button id="icon-edit-btn" type="button"><i class="fa-solid fa-pen"></i> 編輯主資料</button></div>${preview}<div class="icon-meta"><div><span>Icon ID</span><strong>${esc(item.id || '待填')}</strong></div><div><span>類型</span><strong>${esc(raw['類型'] || '待補')}</strong></div><div><span>子類型</span><strong>${esc(raw['子類型'] || '待補')}</strong></div><div><span>目前階段</span><strong>${esc(STAGE_LABELS[item.stage])}</strong></div><div><span>尺寸</span><strong>${esc([raw['主要尺寸'],raw['其他尺寸']].filter(Boolean).join(' / ') || '待補')}</strong></div><div><span>檔名</span><strong>${esc(raw['檔名'] || '待補')}</strong></div></div><section class="icon-section"><h3>製作流程</h3><div class="icon-progress-list">${progress}</div></section><section class="icon-section"><h3>使用位置</h3><div class="icon-path">${pathRow('UI 機制',raw['UI 機制'])}${pathRow('使用位置',raw['使用位置'])}${pathRow('使用備註',raw['使用備註'])}</div></section><section class="icon-section"><h3>交付資料</h3><div class="icon-path">${pathRow('需求圖',raw['需求圖連結'])}${pathRow('來源檔',raw['來源檔路徑'])}${pathRow('輸出',raw['輸出路徑'])}</div></section><section class="icon-section"><h3>多國語版本</h3><div class="icon-locale-grid">${localeCards}</div></section>`;
    $('icon-edit-btn').addEventListener('click', () => { editing = true; renderDetail(); });
    $('icon-detail-body').querySelectorAll('[data-edit-locale]').forEach(button => button.addEventListener('click', () => renderLocaleEditor(button.dataset.editLocale)));
  }
  function input(label,key,value,wide=false,textarea=false){return `<label class="${wide?'wide':''}">${label}${textarea?`<textarea name="${esc(key)}" rows="3">${esc(value||'')}</textarea>`:`<input name="${esc(key)}" value="${esc(value||'')}">`}</label>`;}
  function renderEditor(item) { const raw=item.raw; $('icon-detail-body').innerHTML=`<form id="icon-edit-form" class="icon-edit-form"><div class="icon-edit-grid">${input('類型','類型',raw['類型'])}${input('子類型','子類型',raw['子類型'])}${input('項目名稱','項目名稱',raw['項目名稱'])}${input('檔名','檔名',raw['檔名'])}${input('主要尺寸','主要尺寸',raw['主要尺寸'])}${input('其他尺寸','其他尺寸',raw['其他尺寸'])}${input('格式','格式',raw['格式'])}${input('負責人','負責人',raw['負責人'])}${input('UI 機制','UI 機制',raw['UI 機制'],true,true)}${input('使用位置','使用位置',raw['使用位置'],true,true)}${input('使用備註','使用備註',raw['使用備註'],true,true)}${input('需求圖連結','需求圖連結',raw['需求圖連結'],true)}${input('預覽圖連結','預覽圖連結',raw['預覽圖連結'],true)}${input('來源檔路徑','來源檔路徑',raw['來源檔路徑'],true)}${input('輸出路徑','輸出路徑',raw['輸出路徑'],true)}${input('退回原因','退回原因',raw['退回原因'],true,true)}${input('備註','備註',raw['備註'],true,true)}</div><div class="icon-edit-checks">${['企劃需求完成','美術完稿完成','輸出切圖完成','企劃驗收完成','退回修改中'].map(key=>`<label><input type="checkbox" name="${key}" ${trueValue(raw[key])?'checked':''}> ${key}</label>`).join('')}</div><div class="icon-edit-actions"><button id="icon-edit-cancel" type="button">取消</button><button type="submit">儲存主資料</button></div></form>`; $('icon-edit-cancel').addEventListener('click',()=>{editing=false;renderDetail();}); $('icon-edit-form').addEventListener('submit',saveIcon); }
  async function saveIcon(event){event.preventDefault();const form=event.currentTarget;const changes=Object.fromEntries(new FormData(form).entries());['企劃需求完成','美術完稿完成','輸出切圖完成','企劃驗收完成','退回修改中'].forEach(key=>changes[key]=form.elements[key].checked?'TRUE':'FALSE');await save({action:'updateIcon',iconId:selectedIcon.id,changes},()=>{Object.assign(selectedIcon.raw,changes);rebuild({icons:icons.map(item=>item.raw),locales});closeDetail();});}
  function renderLocaleEditor(language){const locale=selectedIcon.locales.find(entry=>entry['語言']===language);$('icon-detail-body').innerHTML=`<form id="icon-locale-form" class="icon-edit-form"><h3>${esc(language)} 語系資料</h3><div class="icon-edit-grid">${input('顯示文字','顯示文字',locale['顯示文字'],true,true)}${input('翻譯狀態','翻譯狀態',locale['翻譯狀態'])}${input('語系圖連結','語系圖連結',locale['語系圖連結'],true)}${input('最後確認日','最後確認日',locale['最後確認日'])}${input('備註','備註',locale['備註'],true,true)}</div><div class="icon-edit-checks"><label><input type="checkbox" name="語系圖完成" ${trueValue(locale['語系圖完成'])?'checked':''}> 語系圖完成</label></div><div class="icon-edit-actions"><button id="icon-locale-cancel" type="button">取消</button><button type="submit">儲存語系資料</button></div></form>`;$('icon-locale-cancel').addEventListener('click',renderDetail);$('icon-locale-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const changes=Object.fromEntries(new FormData(form).entries());changes['語系圖完成']=form.elements['語系圖完成'].checked?'TRUE':'FALSE';await save({action:'updateIconLocale',iconId:selectedIcon.id,language,changes},()=>{Object.assign(locale,changes);renderDetail();});});}
  async function save(body,onSuccess){if(!apiUrl||!apiKey){showToast('請先設定 Icon API','error');openConfig();return;}const button=$('icon-detail-body').querySelector('button[type=submit]');if(button)button.disabled=true;try{const response=await fetch(`${apiUrl}?key=${encodeURIComponent(apiKey)}`,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)});const payload=await response.json();if(payload.error)throw new Error(payload.error);showToast('已回寫 Google Sheet','success');onSuccess();}catch(error){showToast(`儲存失敗：${error.message}`,'error');if(button)button.disabled=false;}}
  async function load(){setStatus('loading','資料載入中');if(!apiUrl||!apiKey){const cached=readCache();if(cached){rebuild(cached);setStatus('error','使用快取・API 待設定');}else{$('icon-groups').innerHTML='<div class="icon-empty">請先設定 Icon API</div>';setStatus('error','API 尚未設定');}return;}try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);const response=await fetch(`${apiUrl}?key=${encodeURIComponent(apiKey)}`,{cache:'no-store',signal:controller.signal});clearTimeout(timer);const payload=await response.json();if(payload.error||!Array.isArray(payload.icons)||!Array.isArray(payload.locales))throw new Error(payload.error||'API 格式不正確');localStorage.setItem(CACHE_KEY,JSON.stringify(payload));rebuild(payload);setStatus('ok',`已同步 ${icons.length} 項`);}catch(error){const cached=readCache();if(cached){rebuild(cached);setStatus('error','連線失敗・使用快取');}else{$('icon-groups').innerHTML=`<div class="icon-empty">載入失敗：${esc(error.message)}</div>`;setStatus('error','資料載入失敗');}}}
  function readCache(){try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'null');}catch{return null;}}function setStatus(type,text){const el=$('icon-api-status');el.className=`icon-api-status is-${type}`;el.innerHTML=`<i class="fa-solid ${type==='loading'?'fa-circle-notch fa-spin':type==='ok'?'fa-circle-check':'fa-triangle-exclamation'}"></i> ${esc(text)}`;}
  function closeDetail(){$('icon-detail-modal').classList.remove('open');$('icon-detail-modal').setAttribute('aria-hidden','true');document.body.classList.remove('body-scroll-lock');selectedIcon=null;editing=false;}
  function openConfig(){$('icon-api-url').value=apiUrl;$('icon-api-key').value=apiKey;$('icon-config-modal').classList.add('open');$('icon-config-modal').setAttribute('aria-hidden','false');}
  function closeConfig(){$('icon-config-modal').classList.remove('open');$('icon-config-modal').setAttribute('aria-hidden','true');}
  ['icon-search-input','icon-type-filter','icon-subtype-filter','icon-stage-filter','icon-ui-filter','icon-locale-filter'].forEach(id=>$(id).addEventListener(id==='icon-search-input'?'input':'change',applyFilters));
  $('icon-special-filters').addEventListener('click',event=>{const button=event.target.closest('[data-filter]');if(!button)return;$('icon-special-filters').querySelectorAll('button').forEach(item=>item.classList.toggle('active',item===button));applyFilters();});
  $('icon-reset-btn').addEventListener('click',()=>{$('icon-search-input').value='';['icon-type-filter','icon-subtype-filter','icon-stage-filter','icon-ui-filter','icon-locale-filter'].forEach(id=>$(id).value='all');$('icon-special-filters').querySelectorAll('button').forEach(item=>item.classList.toggle('active',item.dataset.filter==='all'));applyFilters();});
  $('icon-refresh-btn').addEventListener('click',load);$('icon-config-btn').addEventListener('click',openConfig);$('icon-detail-close').addEventListener('click',closeDetail);$('icon-config-close').addEventListener('click',closeConfig);$('icon-config-cancel').addEventListener('click',closeConfig);
  $('icon-config-form').addEventListener('submit',event=>{event.preventDefault();apiUrl=$('icon-api-url').value.trim();apiKey=$('icon-api-key').value.trim();localStorage.setItem(API_URL_KEY,apiUrl);localStorage.setItem(API_KEY_KEY,apiKey);closeConfig();load();});
  [$('icon-detail-modal'),$('icon-config-modal')].forEach(modal=>modal.addEventListener('click',event=>{if(event.target===modal){modal=== $('icon-detail-modal')?closeDetail():closeConfig();}}));document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeDetail();closeConfig();}});load();
})();
