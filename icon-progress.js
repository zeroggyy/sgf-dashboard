(function setupIconProgress() {
  const view = document.getElementById('theme-view-theme4');
  if (!view) return;

  const API_URL_KEY = 'sgf_icon_gas_url';
  const API_KEY_KEY = 'sgf_icon_api_key';
  const DEFAULT_ICON_API_URL = 'https://script.google.com/macros/s/AKfycbz_AJC4Z8rwobLVT8oVSUwToCJYZaDNIBLMnABbAznU7lIbl3iBQqQQ1p2GIqpYUHdU/exec';
  const DEFAULT_ICON_API_KEY = 'sgf_icon_65eWYhLc08GZ0v1I3Hi1FWc2iiVjd_bHMdFomhyUxtc';
  const CACHE_KEY = 'sgf_icon_single_sheet_payload_v2';
  const STAGES = [
    ['planning', '待企劃需求'],
    ['art', '待美術完稿'],
    ['export', '待輸出切圖'],
    ['review', '待企劃驗收'],
    ['returned', '退回修改中'],
    ['completed', '已結案']
  ];
  const STAGE_LABELS = Object.fromEntries(STAGES);
  const BOOLEAN_FIELDS = [
    '多狀態', '企劃需求完成', '美術完稿完成',
    '輸出切圖完成', '退回修改中', '企劃驗收完成'
  ];
  const PROGRESS_BOOLEAN_FIELDS = [
    '企劃需求完成', '美術完稿完成', '輸出切圖完成',
    '退回修改中', '企劃驗收完成'
  ];

  let apiUrl = localStorage.getItem(API_URL_KEY) || DEFAULT_ICON_API_URL;
  let apiKey = localStorage.getItem(API_KEY_KEY) || DEFAULT_ICON_API_KEY;
  let items = [];
  let selectedItem = null;
  let editing = false;
  let openCategory = '';
  let workFilter = 'all';

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const trueValue = value => String(value).trim().toUpperCase() === 'TRUE';
  const showToast = (message, type = 'info') => window.dashboardShowToast?.(message, type);
  const gyazoId = value => String(value || '').match(/gyazo\.com\/(?:public\/)?([a-z0-9]+)/i)?.[1] || '';

  function dateValue(value) {
    const matched = String(value || '').trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (!matched) return null;
    const date = new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function startOfToday() {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  function isArtAction(item) {
    return ['returned', 'art', 'export'].includes(item.stage);
  }

  function dueState(item) {
    if (!isArtAction(item)) return '';
    const target = dateValue(item.raw['目標日']);
    if (!target) return '';
    const days = Math.round((target - startOfToday()) / 86400000);
    if (days < 0) return 'overdue';
    if (days <= 7) return 'due-soon';
    return '';
  }

  function actionOf(item) {
    if (item.stage === 'returned') return '處理退回修改';
    if (item.stage === 'art') return '開始美術製作';
    if (item.stage === 'export') return '輸出正式切圖';
    if (item.stage === 'planning') return '等待企劃需求';
    if (item.stage === 'review') return '等待企劃驗收';
    return '已完成';
  }

  function priorityOf(item) {
    const due = dueState(item);
    if (item.stage === 'returned') return 0;
    if (due === 'overdue') return 1;
    if (due === 'due-soon') return 2;
    if (item.stage === 'art') return 3;
    if (item.stage === 'export') return 4;
    if (item.stage === 'review') return 5;
    if (item.stage === 'planning') return 6;
    return 7;
  }

  function compareWorkItems(a, b) {
    const priorityDifference = priorityOf(a) - priorityOf(b);
    if (priorityDifference) return priorityDifference;
    const aDate = dateValue(a.raw['目標日']);
    const bDate = dateValue(b.raw['目標日']);
    if (aDate && bDate && aDate.getTime() !== bDate.getTime()) return aDate - bDate;
    if (aDate && !bDate) return -1;
    if (!aDate && bDate) return 1;
    return a.index - b.index;
  }

  function stageOf(row) {
    if (trueValue(row['退回修改中'])) return 'returned';
    if (!trueValue(row['企劃需求完成'])) return 'planning';
    if (!trueValue(row['美術完稿完成'])) return 'art';
    if (!trueValue(row['輸出切圖完成'])) return 'export';
    if (!trueValue(row['企劃驗收完成'])) return 'review';
    return 'completed';
  }

  function missingOf(row) {
    const missing = [];
    if (!row['Icon ID']) missing.push('Icon ID');
    if (!row['項目名稱']) missing.push('項目名稱');
    if (row['語系'] && !row['群組']) missing.push('群組');
    if (row['群組'] && !row['語系']) missing.push('語系');
    if (!row['主要尺寸']) missing.push('主要尺寸');
    if (trueValue(row['多狀態']) && !row['狀態種類']) missing.push('狀態種類');
    if (trueValue(row['退回修改中']) && !row['退回原因']) missing.push('退回原因');
    if (stageOf(row) === 'completed' && !row['檔名']) missing.push('檔名');
    if (trueValue(row['輸出切圖完成']) && !row['輸出路徑']) missing.push('輸出路徑');
    return missing;
  }

  function rebuild(payload) {
    const source = Array.isArray(payload.items) ? payload.items : [];
    items = source.map((raw, index) => ({
      raw,
      index,
      id: String(raw['Icon ID'] || '').trim(),
      name: raw['項目名稱'] || raw['Icon ID'] || `未命名 ${index + 1}`,
      type: raw['類型'] || '未分類',
      subtype: raw['子類型'] || '未分類',
      locale: String(raw['語系'] || '').trim(),
      group: String(raw['群組'] || '').trim(),
      stage: stageOf(raw),
      missing: missingOf(raw),
      variants: []
    }));

    const byGroup = new Map();
    items.forEach(item => {
      if (!item.group) return;
      if (!byGroup.has(item.group)) byGroup.set(item.group, []);
      byGroup.get(item.group).push(item);
    });
    items.forEach(item => {
      item.variants = item.group ? byGroup.get(item.group) || [] : [];
    });

    populateFilters();
    applyFilters();
  }

  function unique(field) {
    return [...new Set(items.map(item => item.raw[field]).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b), 'zh-Hant', { numeric: true }));
  }

  function fillSelect(id, values, allLabel) {
    const select = $(id);
    const current = select.value;
    select.innerHTML = `<option value="all">${allLabel}</option>` + values
      .map(value => `<option value="${esc(value)}">${esc(value)}</option>`)
      .join('');
    if ([...select.options].some(option => option.value === current)) select.value = current;
  }

  function populateFilters() {
    fillSelect('icon-type-filter', unique('類型'), '全部類型');
    fillSelect('icon-subtype-filter', unique('子類型'), '全部子類型');
    fillSelect('icon-locale-filter', unique('語系'), '全部語系');
    fillSelect('icon-stage-filter', STAGES.map(([, label]) => label), '全部階段');
  }

  function renderStats() {
    const configs = [
      ['returned', '需要修改', '退回項目優先處理', 'is-alert'],
      ['art', '待製作', '企劃需求已完成', ''],
      ['export', '待切圖', '美術完稿待輸出', ''],
      ['due-soon', '即將到期', '目標日在 7 天內', 'is-warning'],
      ['overdue', '已逾期', '超過目標日', 'is-alert']
    ];
    $('icon-stats').innerHTML = configs.map(([filter, label, description, className]) => {
      const active = workFilter === filter;
      const count = filter === 'due-soon' || filter === 'overdue'
        ? items.filter(item => dueState(item) === filter).length
        : items.filter(item => item.stage === filter).length;
      return `<button class="icon-stat ${className} ${active ? 'active' : ''}" data-work-filter="${filter}" type="button" aria-pressed="${active}" title="${active ? `取消「${esc(label)}」篩選` : `只顯示「${esc(label)}」`}"><span>${esc(label)}</span><strong>${count}</strong><small>${active ? '篩選中' : esc(description)}</small></button>`;
    }).join('');

    $('icon-stats').querySelectorAll('[data-work-filter]').forEach(button => {
      button.addEventListener('click', () => {
        workFilter = workFilter === button.dataset.workFilter ? 'all' : button.dataset.workFilter;
        $('icon-stage-filter').value = 'all';
        applyFilters();
      });
    });
  }

  function applyFilters() {
    const query = $('icon-search-input').value.trim().toLowerCase();
    const type = $('icon-type-filter').value;
    const subtype = $('icon-subtype-filter').value;
    const stage = $('icon-stage-filter').value;
    const locale = $('icon-locale-filter').value;
    const special = $('icon-special-filters').querySelector('.active')?.dataset.filter || 'all';

    const filtered = items.filter(item => {
      const raw = item.raw;
      const haystack = [
        item.id, item.name, item.group, item.locale, raw['檔名'],
        raw['使用位置'], raw['使用備註'], raw['備註']
      ].join(' ').toLowerCase();
      return (!query || haystack.includes(query)) &&
        (type === 'all' || raw['類型'] === type) &&
        (subtype === 'all' || raw['子類型'] === subtype) &&
        (stage === 'all' || STAGE_LABELS[item.stage] === stage) &&
        (locale === 'all' || item.locale === locale) &&
        (workFilter === 'all' ||
          (['returned', 'art', 'export'].includes(workFilter) && item.stage === workFilter) ||
          (['due-soon', 'overdue'].includes(workFilter) && dueState(item) === workFilter)) &&
        (special === 'all' ||
          (special === 'returned' && item.stage === 'returned') ||
          (special === 'missing' && item.missing.length) ||
          (special === 'no-preview' && !raw['預覽圖連結']));
    }).sort(compareWorkItems);

    renderStats();
    renderGroups(filtered);
    $('icon-result-count').textContent = `${filtered.length} / ${items.length} 項`;
  }

  function renderGroups(filtered) {
    const groups = new Map();
    filtered.forEach(item => {
      const key = `${item.type}｜${item.subtype}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });

    if (!groups.size) {
      $('icon-groups').innerHTML = '<div class="icon-empty">沒有符合條件的 Icon</div>';
      return;
    }
    if (!groups.has(openCategory) && groups.size === 1) openCategory = groups.keys().next().value;

    $('icon-groups').innerHTML = [...groups.entries()].map(([key, groupItems]) => {
      const [type, subtype] = key.split('｜');
      const open = key === openCategory;
      const rows = groupItems.map(item => {
        const raw = item.raw;
        const previewUrl = raw['預覽圖連結'];
        const imageId = gyazoId(previewUrl);
        const preview = imageId
          ? `<img src="https://i.gyazo.com/${esc(imageId)}.jpg" alt="${esc(item.name)}" loading="lazy">`
          : '<i class="fa-regular fa-image"></i>';
        const due = dueState(item);
        const alertText = item.stage === 'returned'
          ? raw['退回原因'] || '退回原因待補'
          : due === 'overdue'
            ? '已超過目標日'
            : due === 'due-soon'
              ? '7 天內到期'
              : item.missing.length
                ? `待補 ${item.missing.length} 項資料`
                : item.group && item.variants.length > 1
                  ? `${item.variants.length} 個語系版本`
                  : '';
        const alertClass = item.stage === 'returned' || due === 'overdue'
          ? 'is-danger'
          : due === 'due-soon' || item.missing.length
            ? 'is-warning'
            : '';
        const previewLink = previewUrl
          ? `<a class="icon-preview-link" href="${esc(previewUrl)}" target="_blank" rel="noopener" title="另開預覽圖"><i class="fa-solid fa-arrow-up-right-from-square"></i> 預覽圖</a>`
          : '<span class="icon-preview-missing">無預覽圖</span>';
        return `<div class="icon-list-row ${item.missing.length ? 'has-missing' : ''} ${item.stage === 'returned' ? 'is-returned' : ''} ${due === 'overdue' ? 'is-overdue' : ''}" data-icon-index="${item.index}"><button class="icon-row-main" type="button" aria-label="查看 ${esc(item.name)} 詳細資料"><span class="icon-thumb">${preview}</span><span class="icon-row-id">${esc(item.id || '待填 Icon ID')}</span><strong class="icon-row-name">${esc(item.name)}</strong><span class="icon-row-locale">${esc(item.locale || '—')}</span><span class="icon-row-action">${esc(actionOf(item))}</span><span class="icon-row-due ${due}">${esc(raw['目標日'] || '未排日期')}</span><span class="icon-row-alert ${alertClass}" title="${esc(alertText)}">${esc(alertText || '—')}</span></button>${previewLink}</div>`;
      }).join('');
      return `<section class="icon-group ${open ? 'open' : ''}" data-category="${esc(key)}"><button class="icon-group-toggle" type="button"><span><strong>${esc(type)}</strong><small> · ${esc(subtype)}</small></span><small>${groupItems.length} 項</small><i class="fa-solid fa-chevron-down"></i></button><div class="icon-group-body"><div class="icon-list-head"><span>縮圖</span><span>Icon ID</span><span>項目名稱</span><span>語系</span><span>需要的動作</span><span>目標日</span><span>提醒</span><span>預覽</span></div><div class="icon-list">${rows}</div></div></section>`;
    }).join('');

    $('icon-groups').querySelectorAll('.icon-group-toggle').forEach(button => {
      button.addEventListener('click', () => {
        const group = button.closest('.icon-group');
        openCategory = group.classList.contains('open') ? '' : group.dataset.category;
        renderGroups(filtered);
      });
    });
    $('icon-groups').querySelectorAll('.icon-row-main').forEach(button => {
      button.addEventListener('click', () => {
        const row = button.closest('[data-icon-index]');
        openDetail(items.find(item => item.index === Number(row.dataset.iconIndex)));
      });
    });
  }

  const pathRow = (label, value) => `<div><b>${esc(label)}：</b>${esc(value || '待補')}</div>`;

  function openDetail(item) {
    if (!item) return;
    selectedItem = item;
    editing = false;
    renderDetail();
    $('icon-detail-modal').classList.add('open');
    $('icon-detail-modal').setAttribute('aria-hidden', 'false');
    document.body.classList.add('body-scroll-lock');
  }

  function renderDetail() {
    if (!selectedItem) return;
    if (editing) {
      renderEditor(selectedItem);
      return;
    }

    const item = selectedItem;
    const raw = item.raw;
    $('icon-detail-title').textContent = item.name;
    const imageId = gyazoId(raw['預覽圖連結']);
    const preview = imageId
      ? `<a class="icon-detail-preview" href="${esc(raw['預覽圖連結'])}" target="_blank" rel="noopener"><img src="https://i.gyazo.com/${esc(imageId)}.jpg" alt="${esc(item.name)}"></a>`
      : '';
    const progressSteps = [
      ['企劃需求完成', '企劃需求'],
      ['美術完稿完成', '美術完稿'],
      ['輸出切圖完成', '輸出切圖'],
      ['企劃驗收完成', '企劃驗收']
    ];
    const currentStepIndex = progressSteps.findIndex(([key]) => !trueValue(raw[key]));
    const progress = progressSteps.map(([key, label], index) => {
      const done = trueValue(raw[key]);
      const current = !done && index === currentStepIndex;
      const stateClass = done ? 'done' : current ? 'current' : 'pending';
      const icon = done ? 'fa-circle-check' : current ? 'fa-clock' : 'fa-circle';
      const stateLabel = done ? '已完成' : current ? (item.stage === 'returned' ? '退回修改中' : '目前待處理') : '尚未開始';
      return `<div class="icon-progress-item ${stateClass}"><i class="fa-solid ${icon}"></i><span><strong>${esc(label)}</strong><small>${esc(stateLabel)}</small></span></div>`;
    }).join('');

    const localeOrder = ['繁中', '簡中', '英文', '日文'];
    const variants = [...item.variants].sort((a, b) => {
      const aIndex = localeOrder.indexOf(a.locale);
      const bIndex = localeOrder.indexOf(b.locale);
      return (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex);
    });
    const variantCards = variants.length
      ? variants.map(variant => `<article class="icon-locale-card"><b>${esc(variant.locale || '未指定語系')}</b><p>${esc(variant.name)}</p><small>${esc(variant.id)} · ${esc(STAGE_LABELS[variant.stage])}</small><button data-open-variant="${variant.index}" type="button" ${variant.index === item.index ? 'disabled' : ''}>${variant.index === item.index ? '目前項目' : '查看版本'}</button></article>`).join('')
      : '<div class="icon-empty">此項目沒有語系群組</div>';

    const stateSpecification = trueValue(raw['多狀態'])
      ? `多狀態：${raw['狀態種類'] || '種類待補'}`
      : '單一狀態';
    $('icon-detail-body').innerHTML = `<div class="icon-detail-actions"><button id="icon-edit-btn" type="button"><i class="fa-solid fa-pen"></i> 編輯此項目</button></div>${preview}<div class="icon-meta"><div><span>Icon ID</span><strong>${esc(item.id || '待填')}</strong></div><div><span>群組</span><strong>${esc(item.group || '無')}</strong></div><div><span>語系</span><strong>${esc(item.locale || '無')}</strong></div><div><span>類型</span><strong>${esc(raw['類型'] || '待補')}</strong></div><div><span>子類型</span><strong>${esc(raw['子類型'] || '待補')}</strong></div><div><span>版本規格</span><strong>${esc(stateSpecification)}</strong></div><div><span>需要的動作</span><strong>${esc(actionOf(item))}</strong></div><div><span>目標日</span><strong>${esc(raw['目標日'] || '尚未安排')}</strong></div><div><span>尺寸</span><strong>${esc([raw['主要尺寸'], raw['其他尺寸']].filter(Boolean).join(' / ') || '待補')}</strong></div><div><span>檔名</span><strong>${esc(raw['檔名'] || '待補')}</strong></div></div><section class="icon-section"><h3>製作流程</h3><div class="icon-progress-list">${progress}</div></section><section class="icon-section"><h3>使用位置</h3><div class="icon-path">${pathRow('使用位置', raw['使用位置'])}${pathRow('使用備註', raw['使用備註'])}</div></section><section class="icon-section"><h3>交付資料</h3><div class="icon-path">${pathRow('需求圖', raw['需求圖連結'])}${pathRow('預覽圖', raw['預覽圖連結'])}${pathRow('來源檔', raw['來源檔路徑'])}${pathRow('輸出', raw['輸出路徑'])}</div></section><section class="icon-section"><h3>同群組語系版本</h3><div class="icon-locale-grid">${variantCards}</div></section>`;

    $('icon-edit-btn').addEventListener('click', () => {
      editing = true;
      renderDetail();
    });
    $('icon-detail-body').querySelectorAll('[data-open-variant]').forEach(button => {
      button.addEventListener('click', () => {
        selectedItem = items.find(candidate => candidate.index === Number(button.dataset.openVariant));
        editing = false;
        renderDetail();
      });
    });
  }

  function input(label, name, value, full = false, textarea = false) {
    const control = textarea
      ? `<textarea name="${esc(name)}">${esc(value || '')}</textarea>`
      : `<input name="${esc(name)}" value="${esc(value || '')}">`;
    return `<label class="${full ? 'full' : ''}"><span>${esc(label)}</span>${control}</label>`;
  }

  function renderEditor(item) {
    const raw = item.raw;
    const multiStateEnabled = trueValue(raw['多狀態']);
    $('icon-detail-body').innerHTML = `<form id="icon-edit-form" class="icon-edit-form"><div class="icon-edit-grid">${input('類型', '類型', raw['類型'])}${input('子類型', '子類型', raw['子類型'])}${input('語系', '語系', raw['語系'])}${input('群組', '群組', raw['群組'])}${input('項目名稱', '項目名稱', raw['項目名稱'], true)}${input('使用位置', '使用位置', raw['使用位置'], true, true)}${input('檔名', '檔名', raw['檔名'])}${input('主要尺寸', '主要尺寸', raw['主要尺寸'])}${input('其他尺寸', '其他尺寸', raw['其他尺寸'])}<div class="full icon-spec-toggle"><label><input type="checkbox" name="多狀態" ${multiStateEnabled ? 'checked' : ''}> 需要多狀態版本</label><small>例如一般、按下、選取或停用版本。</small></div><div id="icon-state-types-field" class="full ${multiStateEnabled ? '' : 'is-hidden'}">${input('狀態種類', '狀態種類', raw['狀態種類'], true)}</div>${input('使用備註', '使用備註', raw['使用備註'], true, true)}${input('需求圖連結', '需求圖連結', raw['需求圖連結'], true)}${input('預覽圖連結', '預覽圖連結', raw['預覽圖連結'], true)}${input('來源檔路徑', '來源檔路徑', raw['來源檔路徑'], true)}${input('輸出路徑', '輸出路徑', raw['輸出路徑'], true)}${input('需求日', '需求日', raw['需求日'])}${input('目標日', '目標日', raw['目標日'])}${input('最終確認日', '最終確認日', raw['最終確認日'])}${input('退回原因', '退回原因', raw['退回原因'], true, true)}${input('備註', '備註', raw['備註'], true, true)}</div><div class="icon-edit-checks">${PROGRESS_BOOLEAN_FIELDS.map(key => `<label><input type="checkbox" name="${key}" ${trueValue(raw[key]) ? 'checked' : ''}> ${key}</label>`).join('')}</div><div class="icon-edit-actions"><button id="icon-edit-cancel" type="button">取消</button><button type="submit">儲存項目</button></div></form>`;
    const form = $('icon-edit-form');
    form.elements['多狀態'].addEventListener('change', event => {
      $('icon-state-types-field').classList.toggle('is-hidden', !event.currentTarget.checked);
    });
    $('icon-edit-cancel').addEventListener('click', () => {
      editing = false;
      renderDetail();
    });
    form.addEventListener('submit', saveItem);
  }

  function validateChanges(changes) {
    if (changes['語系'] && !changes['群組']) return '有語系的項目必須填寫群組';
    if (changes['群組'] && !changes['語系']) return '有群組的項目必須填寫語系';
    if (changes['多狀態'] === 'TRUE' && !changes['狀態種類']) return '多狀態項目必須填寫狀態種類';
    if (changes['退回修改中'] === 'TRUE' && !changes['退回原因']) return '退回修改中必須填寫退回原因';
    const milestones = ['企劃需求完成', '美術完稿完成', '輸出切圖完成', '企劃驗收完成'];
    for (let index = 1; index < milestones.length; index += 1) {
      if (changes[milestones[index]] === 'TRUE' && changes[milestones[index - 1]] !== 'TRUE') {
        return `${milestones[index]}前，必須先完成${milestones[index - 1]}`;
      }
    }
    return '';
  }

  async function saveItem(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const changes = Object.fromEntries(new FormData(form).entries());
    BOOLEAN_FIELDS.forEach(key => {
      changes[key] = form.elements[key].checked ? 'TRUE' : 'FALSE';
    });
    const validationError = validateChanges(changes);
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    await save({ action: 'updateIcon', iconId: selectedItem.id, changes }, () => {
      const selectedId = selectedItem.id;
      Object.assign(selectedItem.raw, changes);
      rebuild({ items: items.map(item => item.raw) });
      selectedItem = items.find(item => item.id === selectedId) || null;
      editing = false;
      if (selectedItem) renderDetail();
    });
  }

  async function save(body, onSuccess) {
    if (!apiUrl || !apiKey) {
      showToast('請先設定 Icon API', 'error');
      openConfig();
      return;
    }
    const button = $('icon-detail-body').querySelector('button[type=submit]');
    if (button) button.disabled = true;
    try {
      const response = await fetch(`${apiUrl}?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (payload.error) throw new Error(payload.error);
      showToast('已回寫 Google Sheet', 'success');
      onSuccess();
    } catch (error) {
      showToast(`儲存失敗：${error.message}`, 'error');
      if (button) button.disabled = false;
    }
  }

  async function load() {
    const initialCache = readCache();
    if (initialCache) rebuild(initialCache);
    window.dashboardSetLoading?.(!initialCache, 'Icon 進度資料載入中，請稍候…');
    setStatus('loading', '資料載入中');
    if (!apiUrl || !apiKey) {
      const cached = readCache();
      if (cached) {
        rebuild(cached);
        setStatus('error', '使用快取・API 待設定');
      } else {
        $('icon-groups').innerHTML = '<div class="icon-empty">請先設定 Icon API</div>';
        setStatus('error', 'API 尚未設定');
      }
      window.dashboardSetLoading?.(false);
      return;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(`${apiUrl}?key=${encodeURIComponent(apiKey)}`, {
        signal: controller.signal
      });
      clearTimeout(timer);
      const payload = await response.json();
      if (payload.error || !Array.isArray(payload.items)) {
        throw new Error(payload.error || 'API 格式不正確，請重新部署單表版 Apps Script');
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
      rebuild(payload);
      setStatus('ok', `已同步 ${items.length} 項`);
    } catch (error) {
      const cached = readCache();
      if (cached) {
        rebuild(cached);
        setStatus('error', `連線失敗・使用快取：${error.message}`);
      } else {
        $('icon-groups').innerHTML = `<div class="icon-empty">載入失敗：${esc(error.message)}</div>`;
        setStatus('error', `資料載入失敗：${error.message}`);
      }
    } finally {
      window.dashboardSetLoading?.(false);
    }
  }

  function readCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    } catch (error) {
      return null;
    }
  }

  function setStatus(type, text) {
    const element = $('icon-api-status');
    element.className = `icon-api-status is-${type}`;
    element.innerHTML = `<i class="fa-solid ${type === 'loading' ? 'fa-circle-notch fa-spin' : type === 'ok' ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i> ${esc(text)}`;
  }

  function closeDetail() {
    $('icon-detail-modal').classList.remove('open');
    $('icon-detail-modal').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('body-scroll-lock');
    selectedItem = null;
    editing = false;
  }

  function openConfig() {
    $('icon-api-url').value = apiUrl;
    $('icon-api-key').value = apiKey;
    $('icon-config-modal').classList.add('open');
    $('icon-config-modal').setAttribute('aria-hidden', 'false');
    document.body.classList.add('body-scroll-lock');
  }

  function closeConfig() {
    $('icon-config-modal').classList.remove('open');
    $('icon-config-modal').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('body-scroll-lock');
  }

  ['icon-search-input', 'icon-type-filter', 'icon-subtype-filter', 'icon-stage-filter', 'icon-locale-filter']
    .forEach(id => $(id).addEventListener(id === 'icon-search-input' ? 'input' : 'change', () => {
      if (id === 'icon-stage-filter' && $(id).value !== 'all') workFilter = 'all';
      applyFilters();
    }));

  $('icon-special-filters').querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => {
      $('icon-special-filters').querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
      applyFilters();
    });
  });

  $('icon-reset-btn').addEventListener('click', () => {
    $('icon-search-input').value = '';
    workFilter = 'all';
    ['icon-type-filter', 'icon-subtype-filter', 'icon-stage-filter', 'icon-locale-filter']
      .forEach(id => { $(id).value = 'all'; });
    $('icon-special-filters').querySelectorAll('button')
      .forEach(item => item.classList.toggle('active', item.dataset.filter === 'all'));
    applyFilters();
  });

  $('icon-refresh-btn').addEventListener('click', load);
  $('icon-config-btn').addEventListener('click', openConfig);
  $('icon-detail-close').addEventListener('click', closeDetail);
  $('icon-config-close').addEventListener('click', closeConfig);
  $('icon-config-cancel').addEventListener('click', closeConfig);
  $('icon-detail-modal').addEventListener('click', event => {
    if (event.target === event.currentTarget) closeDetail();
  });
  $('icon-config-modal').addEventListener('click', event => {
    if (event.target === event.currentTarget) closeConfig();
  });
  $('icon-config-form').addEventListener('submit', event => {
    event.preventDefault();
    apiUrl = $('icon-api-url').value.trim();
    apiKey = $('icon-api-key').value.trim();
    localStorage.setItem(API_URL_KEY, apiUrl);
    localStorage.setItem(API_KEY_KEY, apiKey);
    closeConfig();
    load();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if ($('icon-config-modal').classList.contains('open')) closeConfig();
    else if ($('icon-detail-modal').classList.contains('open')) closeDetail();
  });

  load();
})();
