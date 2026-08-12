// 主題二資料來源：僅使用 Google Sheet API。
(function setupTheme2DataSource() {
  if (document.body.dataset.dashboardMode === 'multipage' && document.body.dataset.dashboardKey !== 'theme2') return;
  const theme2View = document.getElementById('theme-view-theme2');
  if (!theme2View) return;

  const DEFAULT_THEME2_API_URL = 'https://script.google.com/macros/s/AKfycbyLKI1sjAIOYpUV13bfb-jLly46ASHi3bZjSYztYZJsKL3y0VxK3d5Dyl8eQrhSpsApyw/exec';
  const DEFAULT_THEME2_API_KEY = 'SGF_THEME2_2026_UI_FLOW_8fK2mP7x';
  let theme2ApiUrl = localStorage.getItem('sgf_theme2_gas_url') || DEFAULT_THEME2_API_URL;
  let theme2ApiKey = localStorage.getItem('sgf_theme2_api_key') || DEFAULT_THEME2_API_KEY;
  const STAGES = ['企劃', '功能', '代圖操作', '拆圖', '編輯', 'final'];
  const PIPELINE_STAGES = [...STAGES, 'completed'];
  const STAGE_LABELS = {
    企劃: '企劃需求',
    功能: '程式施工',
    代圖操作: '功能驗證',
    拆圖: '美術拆圖',
    編輯: '介面換皮',
    final: '待驗收',
    completed: '已完成'
  };
  const REQUIREMENT_BATCH_LABELS = {
    1: '第一批',
    2: '第二批',
    3: '第三批'
  };
  let items = [];
  let theme2ProjectName = 'SGF 專案';

  function isTrue(value) { return String(value).toUpperCase() === 'TRUE'; }
  function firstStage(row) {
    const firstIncomplete = STAGES.find(stage => !isTrue(row[stage]));
    return firstIncomplete || 'completed';
  }
  function batchLabel(value) {
    const batch = String(value || '').trim();
    if (!batch) return '未分批';
    return REQUIREMENT_BATCH_LABELS[batch] || batch.toUpperCase();
  }
  function itemGroup(item) {
    return item.mechanism || item.category || '未分類';
  }
  function searchableText(item) {
    return `${item.name} ${item.mechanism || ''} ${item.category || ''} ${item.description || ''} ${item.sequence || ''}`.toLowerCase();
  }
  function expectedDateValue(item) {
    return String(item.expectedDate || '').trim() || '__undetermined__';
  }
  function expectedDateLabel(value) {
    return value === '__undetermined__' ? '未定' : value;
  }
  function normalizeRow(row, index) {
    const hasWorkflow = STAGES.some(stage => row[stage] !== '');
    const usesNewColumns = Object.prototype.hasOwnProperty.call(row, '機制') || Object.prototype.hasOwnProperty.call(row, '項目');
    const category = row['機制'] || row['分類'] || '未分類';
    const sequence = row['序號'] || '';
    const name = row['項目'] || row['項目名稱'] || (sequence ? `${category} · ${sequence}` : category);
    if (!hasWorkflow || (!row['機制'] && !row['項目'] && !row['分類'] && !row['項目名稱'])) return null;
    const batch = String(row['製作批次'] || row['優先'] || '').trim();
    const criticalFields = [
      ['企劃開表', '企劃開表'],
      ['期望完成', '期望完成'],
      ['介面截圖路徑', '介面截圖路徑'],
      ['拆圖歸檔路徑', '拆圖歸檔路徑']
    ];
    const missingFields = criticalFields.filter(([key]) => !row[key]).map(([, label]) => label);
    const gyazoUrl = row['截圖'] || row['圖片網址'] || row['Gyazo'] || row['P'] || '';
    return {
      rowIndex: index + 2,
      id: `${category}-${name}-${index}`,
      name,
      category,
      mechanism: usesNewColumns ? category : (row['第二層節點'] || row['機制分類'] || ''),
      description: row['項目說明'] || '',
      sequence,
      batch,
      // 新版 A 欄字母只作為內部批次代碼；畫面統一顯示 B 欄「機制」。
      batchLabel: usesNewColumns ? (category || '未分批') : batchLabel(batch),
      stage: firstStage(row),
      stageLabel: STAGE_LABELS[firstStage(row)] || '已完成',
      plannedDate: row['企劃開表'],
      expectedDate: row['期望完成'],
      artSubmitDate: row['美術提交'],
      screenshotPath: row['介面截圖路徑'],
      artUploadPath: row['美術上傳路徑'],
      archivePath: row['拆圖歸檔路徑'],
      gyazoUrl,
      notes: row['備註'] || '',
      checklist: Object.fromEntries(STAGES.map(stage => [stage, isTrue(row[stage])])),
      missingFields
    };
  }

  function count(predicate) { return items.filter(predicate).length; }
  function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }
  function renderPipeline(filteredItems = items) {
    const buttons = [...theme2View.querySelectorAll('[data-theme2-stage]')];
    const activeStage = document.getElementById('theme2-stage-filter')?.value || '全部階段';
    const stageCounts = Object.fromEntries(PIPELINE_STAGES.map(stage => [stage, filteredItems.filter(item => item.stage === stage).length]));
    const maxCount = Math.max(0, ...Object.values(stageCounts));
    buttons.forEach(button => {
      const stage = button.dataset.theme2Stage;
      const stageCount = stageCounts[stage];
      const strong = button.querySelector('strong');
      if (strong) strong.textContent = stageCount;
      button.classList.toggle('is-bottleneck', maxCount > 0 && stageCount === maxCount);
      button.classList.toggle('is-empty', stageCount === 0);
      button.classList.toggle('is-active', activeStage === stage);
      button.setAttribute('aria-pressed', String(activeStage === stage));
    });
  }

  function renderFlowMap(filteredItems = items) {
    const container = document.getElementById('theme2-flow-map');
    if (!container) return;
    setText('theme2-flow-count', `目前顯示 ${filteredItems.length} / ${items.length} 項`);
    // 流程圖根節點先以專案名稱呈現；未來可改由設定或 Google Sheet 欄位帶入。
    const projectName = theme2ProjectName;
    const fallbackFlowBranches = [
      { label: '入口與帳號', kind: 'system', icon: '⌂', description: '玩家進入遊戲、管理個人資料與調整系統設定的入口。', categories: ['登入訊息', '個人資訊', '側邊資訊', '設定介面'] },
      { label: '核心機制', kind: 'mechanism', icon: '◆', description: '承接大廳後的主要功能與長線遊玩內容。', categories: ['任務', '商城', '通行證', '亂世征途'] },
      { label: '對戰流程', kind: 'mechanism', icon: '◇', description: '從配對、選擇、戰鬥到結算的主要遊玩路徑。', categories: ['對戰撮合', '戰鬥選擇', '對戰介面', '結算', '對戰重播', '練習模式'] },
      { label: '資訊瀏覽', kind: 'shared', icon: '▣', description: '玩家查找武將、招式、排行榜與房間資訊的相關畫面。', categories: ['招式表(標題調整)', '武將快速選擇', '武將圖鑑 武將列表', '排行榜', '建立房間'] }
    ];
    const categoryMap = new Map();
    filteredItems.forEach(item => {
      const category = item.category || '未分類';
      if (!categoryMap.has(category)) categoryMap.set(category, []);
      categoryMap.get(category).push(item);
    });
    // 三層結構：專案 → 合併後的機制分類 → UI 項目。
    const flowGroupMap = new Map();
    filteredItems.forEach(item => {
      const flowGroup = itemGroup(item);
      item.flowGroup = flowGroup;
      if (!flowGroupMap.has(flowGroup)) flowGroupMap.set(flowGroup, []);
      flowGroupMap.get(flowGroup).push(item);
    });
    const flowBranches = flowGroupMap.size ? [...flowGroupMap.entries()].map(([label, branchItems]) => {
      const categories = [label];
      return {
        label,
        kind: 'mechanism',
        icon: '◆',
        description: `${label} 底下的 UI 畫面項目與進度。`,
        categories,
        categoryGroups: new Map([[label, branchItems]])
      };
    }) : fallbackFlowBranches;
    // 依 Google Sheet 的截圖欄位建立 Gyazo 圖片預覽。
    const getGyazoId = value => {
      const match = String(value || '').match(/gyazo\.com\/(?:public\/)?([a-zA-Z0-9]+)/i);
      return match ? match[1] : '';
    };
    const getCategoryCard = (category, group) => {
      const completedSteps = group.reduce((sum, item) => sum + STAGES.filter(stage => item.checklist[stage]).length, 0);
      const progress = Math.round((completedSteps / (group.length * STAGES.length)) * 100);
      const missingCount = group.reduce((sum, item) => sum + item.missingFields.length, 0);
      const stageCounts = {};
      group.forEach(item => { stageCounts[item.stage] = (stageCounts[item.stage] || 0) + 1; });
      const currentStage = Object.entries(stageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
      const itemCards = group.map(item => {
        const itemProgress = Math.round((STAGES.filter(stage => item.checklist[stage]).length / STAGES.length) * 100);
        const itemState = item.missingFields.length > 0 ? 'has-missing' : itemProgress === 100 ? 'is-complete' : '';
        const itemGyazoId = getGyazoId(item.gyazoUrl);
        const itemPreviewUrl = itemGyazoId ? `https://i.gyazo.com/${itemGyazoId}.jpg` : '';
        const itemPreview = itemGyazoId
          ? `<span class="ui-flow-item-thumb"><img src="${escapeHtml(itemPreviewUrl)}" data-gyazo-id="${escapeHtml(itemGyazoId)}" data-original-url="${escapeHtml(item.gyazoUrl)}" alt="${escapeHtml(item.name)} 預覽" loading="lazy" referrerpolicy="no-referrer"></span>`
          : '<span class="ui-flow-item-thumb is-empty">無預覽</span>';
        const openOriginal = itemGyazoId ? `<span class="ui-flow-item-open" data-original-url="${escapeHtml(item.gyazoUrl)}" role="button" tabindex="0" title="開啟原圖" aria-label="開啟 ${escapeHtml(item.name)} 原圖"><i class="fa-solid fa-arrow-up-right-from-square"></i></span>` : '';
        const sequenceText = item.sequence ? `<small class="ui-flow-item-sequence">${escapeHtml(item.sequence)}</small>` : '';
        const descriptionText = item.description ? `<small class="ui-flow-item-description">${escapeHtml(item.description)}</small>` : '';
        return `<button class="ui-flow-item ${itemState}" data-theme2-item-id="${escapeHtml(item.id)}" type="button">${itemPreview}${openOriginal}<span class="ui-flow-item-copy">${sequenceText}<strong>${escapeHtml(item.name || category)}</strong>${descriptionText}</span><b class="ui-flow-item-stage">${escapeHtml(item.stageLabel)}</b></button>`;
      }).join('');
      const categoryState = missingCount > 0 ? 'has-missing' : progress === 100 ? 'is-complete' : '';
      const preview = '';
      return `<article class="ui-flow-category ${categoryState}"><button class="ui-flow-category-toggle" type="button" aria-expanded="false"><span class="ui-flow-node-shape ui-flow-node-screen"><strong>${escapeHtml(category)}</strong><small>${group.length} 個畫面 · ${STAGE_LABELS[currentStage] || currentStage}</small></span><b>${progress}%</b><em>⌄</em></button><div class="ui-flow-category-body"><div class="ui-flow-progress"><i style="width:${progress}%"></i></div><div class="ui-flow-category-meta"><span class="${missingCount > 0 ? 'has-missing' : ''}">${missingCount > 0 ? `資料待補 ${missingCount}` : '資料完整'}</span><span>點擊畫面查看詳情</span></div>${preview}<div class="ui-flow-items">${itemCards}</div></div></article>`;
    };
    const branches = flowBranches.map(branch => {
      const getBranchGroup = category => branch.categoryGroups?.get(category) || categoryMap.get(category);
      const categories = branch.categories.filter(category => getBranchGroup(category)?.length);
      if (!categories.length) return '';
      const branchItems = categories.flatMap(category => getBranchGroup(category));
      const branchProgress = Math.round(branchItems.reduce((sum, item) => sum + STAGES.filter(stage => item.checklist[stage]).length, 0) / (branchItems.length * STAGES.length) * 100);
      return `<section class="ui-flow-branch ui-flow-branch-${branch.kind}"><button class="ui-flow-branch-node ui-flow-branch-toggle" type="button" aria-expanded="false"><span class="ui-flow-node-shape ui-flow-node-mechanism"><i>${branch.icon}</i><strong>${escapeHtml(branch.label)}</strong><small>${branchItems.length} 個畫面</small><small class="ui-flow-branch-progress">完成度 ${branchProgress}%</small></span><em>⌄</em></button><div class="ui-flow-branch-body"><p class="ui-flow-description">${escapeHtml(branch.description)}</p><div class="ui-flow-category-list">${categories.map(category => getCategoryCard(category, getBranchGroup(category))).join('')}</div></div></section>`;
    }).join('');
    const uncategorized = [];
    const extra = uncategorized.map(category => `<section class="ui-flow-branch ui-flow-branch-unassigned"><button class="ui-flow-branch-node ui-flow-branch-toggle" type="button" aria-expanded="false"><span class="ui-flow-node-shape ui-flow-node-mechanism"><i>?</i><strong>其他流程</strong><small>目前資料尚未歸類</small></span><em>⌄</em></button><div class="ui-flow-branch-body"><p class="ui-flow-description">這些資料目前尚未設定所屬的主要機制，後續可透過流程欄位重新歸類。</p><div class="ui-flow-category-list">${getCategoryCard(category, categoryMap.get(category))}</div></div></section>`).join('');
    const totalProgress = filteredItems.length ? Math.round(filteredItems.reduce((sum, item) => sum + STAGES.filter(stage => item.checklist[stage]).length, 0) / (filteredItems.length * STAGES.length) * 100) : 0;
    container.innerHTML = filteredItems.length ? `<div class="ui-flow-map"><svg class="ui-flow-connections" aria-hidden="true"></svg><div class="ui-flow-start ui-flow-root-node"><span class="ui-flow-start-icon">⌂</span><strong>${projectName}</strong><small>${filteredItems.length} 個相關畫面 · 完成度 ${totalProgress}%</small><p>所有 UI 流程的起點</p></div><div class="ui-flow-connector" aria-hidden="true">→</div><div class="ui-flow-branches">${branches}${extra}</div><div class="ui-flow-legend"><span><i class="legend-mechanism"></i>主要機制</span><span><i class="legend-screen"></i>畫面分類</span><span><i class="legend-shared"></i>共用 / 外部</span><span><i class="legend-progress"></i>完成度</span></div></div>` : '<div class="detail-empty"><strong>沒有符合條件的畫面</strong><span>請調整篩選條件</span></div>';
    container.querySelectorAll('img[data-gyazo-id]').forEach(image => {
      const id = image.dataset.gyazoId;
      const extensions = ['jpg', 'png', 'gif'];
      let attempt = 0;
      image.addEventListener('error', () => {
        attempt += 1;
        if (attempt < extensions.length) image.src = `https://i.gyazo.com/${id}.${extensions[attempt]}`;
      });
    });
    container.querySelectorAll('.ui-flow-item-open[data-original-url]').forEach(icon => icon.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      window.open(icon.dataset.originalUrl, '_blank', 'noopener,noreferrer');
    }));
    container.querySelectorAll('.ui-flow-item-open[data-original-url]').forEach(icon => icon.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      window.open(icon.dataset.originalUrl, '_blank', 'noopener,noreferrer');
    }));
    const drawConnections = () => {
      const canvas = container.querySelector('.ui-flow-map');
      const svg = container.querySelector('.ui-flow-connections');
      const start = container.querySelector('.ui-flow-start');
      if (!canvas || !svg || !start) return;
      const canvasRect = canvas.getBoundingClientRect();
      const point = (element, side) => {
        const rect = element.getBoundingClientRect();
        return {
          x: (side === 'right' ? rect.right : rect.left) - canvasRect.left,
          y: rect.top + rect.height / 2 - canvasRect.top
        };
      };
      const path = (from, to, className = '') => {
        const bend = from.x + Math.max(18, (to.x - from.x) * 0.45);
        return `<path class="${className}" d="M ${from.x} ${from.y} H ${bend} V ${to.y} H ${to.x}" />`;
      };
      const lines = [];
      const startPoint = point(start, 'right');
      container.querySelectorAll('.ui-flow-branch').forEach(branch => {
        const branchToggle = branch.querySelector('.ui-flow-branch-toggle');
        if (!branchToggle) return;
        lines.push(path(startPoint, point(branchToggle, 'left'), 'ui-flow-line ui-flow-line-main'));
      });
      svg.setAttribute('viewBox', `0 0 ${Math.max(canvas.scrollWidth, canvasRect.width)} ${Math.max(canvas.scrollHeight, canvasRect.height)}`);
      svg.innerHTML = lines.join('');
    };
    container.querySelectorAll('.ui-flow-branch-toggle').forEach(toggle => toggle.addEventListener('click', () => {
      const branch = toggle.closest('.ui-flow-branch');
      const open = branch.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      requestAnimationFrame(drawConnections);
    }));
    container.querySelectorAll('.ui-flow-category-toggle').forEach(toggle => toggle.addEventListener('click', () => {
      const category = toggle.closest('.ui-flow-category');
      const open = category.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      requestAnimationFrame(drawConnections);
    }));
    drawConnections();
    // 主題二初始時可能仍是 hidden，第一次量測會得到 0；在下一個畫面更新週期重畫。
    requestAnimationFrame(() => requestAnimationFrame(drawConnections));
    container.querySelectorAll('img').forEach(image => image.addEventListener('load', drawConnections, { once: true }));
    if (window.__theme2FlowResizeHandler) window.removeEventListener('resize', window.__theme2FlowResizeHandler);
    window.__theme2FlowResizeHandler = drawConnections;
    window.addEventListener('resize', drawConnections, { passive: true });
    container.querySelectorAll('[data-theme2-item-id]').forEach(card => card.addEventListener('click', () => {
      const item = items.find(candidate => candidate.id === card.dataset.theme2ItemId);
      if (item) renderDetail(item);
    }));
  }

  function renderDetail(item) {
    const modal = document.getElementById('theme2-detail-modal');
    const detail = document.getElementById('theme2-detail-modal-body');
    if (!modal || !detail) return;
    const missing = [...item.missingFields];
    const completeness = missing.length
      ? `<div class="detail-missing"><i class="fa-solid fa-triangle-exclamation"></i> 建議補齊：${missing.join('、')}</div>`
      : '<div class="detail-complete"><i class="fa-solid fa-circle-check"></i> 資料完整</div>';
    const pathRow = (label, path) => {
      const hasPath = Boolean(path);
      return `<div class="detail-path-row"><span><b>${label}：</b>${escapeHtml(path || '待補')}</span><button class="detail-copy-path" type="button" ${hasPath ? `data-copy-path="${escapeHtml(path)}"` : 'disabled'} title="${hasPath ? `複製${label}路徑` : `${label}尚未填寫`}" aria-label="${hasPath ? `複製${label}路徑` : `${label}尚未填寫`}"><i class="fa-regular fa-copy"></i></button></div>`;
    };
    const description = `<div class="theme2-detail-description theme2-detail-description-primary"><span>項目說明</span><p>${escapeHtml(item.description || '尚未填寫')}</p></div>`;
    const notes = item.notes ? `<div class="theme2-detail-description"><span>備註</span><p>${escapeHtml(item.notes)}</p></div>` : '';
    detail.innerHTML = `<div class="theme2-detail-content"><span class="theme2-kicker">SELECTED ITEM · SHEET ROW ${item.rowIndex}</span><h2 id="theme2-detail-modal-heading">${escapeHtml(item.name)}</h2>${description}<div class="detail-meta-grid"><div><span>機制</span><strong>${escapeHtml(item.category)}</strong></div><div><span>序號</span><strong>${escapeHtml(item.sequence || '待補')}</strong></div><div><span>目前階段</span><strong>${escapeHtml(item.stageLabel)}</strong></div><div><span>企劃開表</span><strong>${escapeHtml(item.plannedDate || '待補')}</strong></div><div><span>期望完成</span><strong>${escapeHtml(item.expectedDate || '待補')}</strong></div><div><span>美術提交</span><strong>${escapeHtml(item.artSubmitDate || '待補')}</strong></div></div>${notes}${completeness}<div class="detail-paths">${pathRow('介面截圖', item.screenshotPath)}${pathRow('美術上傳', item.artUploadPath)}${pathRow('拆圖歸檔', item.archivePath)}</div></div>`;
    detail.querySelectorAll('.detail-copy-path[data-copy-path]').forEach(button => button.addEventListener('click', async () => {
      const path = button.dataset.copyPath;
      try {
        await navigator.clipboard.writeText(path);
      } catch (error) {
        const textarea = document.createElement('textarea');
        textarea.value = path;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      button.classList.add('is-copied');
      button.innerHTML = '<i class="fa-solid fa-check"></i>';
      window.dashboardShowToast('路徑已複製', 'success');
      setTimeout(() => {
        button.classList.remove('is-copied');
        button.innerHTML = '<i class="fa-regular fa-copy"></i>';
      }, 1400);
    }));
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('body-scroll-lock');
    document.body.classList.add('body-scroll-lock');
  }

  function applyFilters() {
    const category = document.getElementById('theme2-category-filter')?.value || '全部功能分類';
    const expectedDate = document.getElementById('theme2-expected-date-filter')?.value || 'all';
    const stage = document.getElementById('theme2-stage-filter')?.value || '全部階段';
    const query = (document.getElementById('theme2-search-input')?.value || '').trim().toLowerCase();
    const filtered = items.filter(item => {
      const categoryMatch = category === '全部功能分類' || itemGroup(item) === category;
      const stageMatch = stage === '全部階段' || item.stage === stage;
      const expectedDateMatch = expectedDate === 'all' || expectedDateValue(item) === expectedDate;
      const searchMatch = !query || searchableText(item).includes(query);
      return categoryMatch && expectedDateMatch && stageMatch && searchMatch;
    });
    updateDimensionCounts({ category, expectedDate, stage, query });
    const specialCount = theme2View.querySelector('[data-theme2-count="all"]');
    if (specialCount) specialCount.textContent = filtered.length;
    // 流程分布保留各階段數量，僅套用搜尋與機制，不被階段自身過濾。
    const pipelineItems = items.filter(item => {
      const categoryMatch = category === '全部功能分類' || itemGroup(item) === category;
      const expectedDateMatch = expectedDate === 'all' || expectedDateValue(item) === expectedDate;
      const searchMatch = !query || searchableText(item).includes(query);
      return categoryMatch && expectedDateMatch && searchMatch;
    });
    renderPipeline(pipelineItems);
    renderFlowMap(filtered);
  }

  function updateDimensionCounts({ category, expectedDate, stage, query }) {
    const matchesStage = item => stage === '全部階段' || item.stage === stage;
    const matchesQuery = item => !query || searchableText(item).includes(query);
    theme2View.querySelectorAll('#theme2-category-chips .theme2-dimension-chip').forEach(chip => {
      const value = chip.dataset.selectValue;
      const total = items.filter(item => matchesStage(item) && matchesQuery(item) && (expectedDate === 'all' || expectedDateValue(item) === expectedDate) && (value === '全部功能分類' || itemGroup(item) === value)).length;
      const countEl = chip.querySelector('.theme2-chip-count');
      if (countEl) countEl.textContent = total;
    });
    theme2View.querySelectorAll('#theme2-expected-date-chips .theme2-dimension-chip').forEach(chip => {
      const value = chip.dataset.selectValue;
      const total = items.filter(item => matchesStage(item) && matchesQuery(item) && (category === '全部功能分類' || itemGroup(item) === category) && (value === 'all' || expectedDateValue(item) === value)).length;
      const countEl = chip.querySelector('.theme2-chip-count');
      if (countEl) countEl.textContent = total;
    });
  }

  function updateDashboard() {
    theme2View.querySelectorAll('[data-theme2-count]').forEach(el => {
      el.textContent = items.length;
    });
    applyFilters();
  }

  function bindTheme2Controls() {
    const categories = [...new Set(items.map(itemGroup))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    const expectedDates = [...new Set(items.map(expectedDateValue))].sort((a, b) => {
      if (a === '__undetermined__') return 1;
      if (b === '__undetermined__') return -1;
      return a.localeCompare(b, 'zh-Hant', { numeric: true });
    });
    const categorySelect = document.getElementById('theme2-category-filter');
    if (categorySelect) categorySelect.innerHTML = '<option>全部功能分類</option>' + categories.map(category => `<option>${category}</option>`).join('');
    const expectedDateSelect = document.getElementById('theme2-expected-date-filter');
    if (expectedDateSelect) expectedDateSelect.innerHTML = '<option value="all">全部時間</option>' + expectedDates.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(expectedDateLabel(value))}</option>`).join('');
    const stageSelect = document.getElementById('theme2-stage-filter');
    if (stageSelect) stageSelect.innerHTML = '<option value="全部階段">全部階段</option>' + PIPELINE_STAGES.map(stage => `<option value="${stage}">${STAGE_LABELS[stage]}</option>`).join('');

    function renderChipGroup(containerId, values, selectId) {
      const container = document.getElementById(containerId);
      const select = document.getElementById(selectId);
      if (!container || !select) return;
      const labels = values.map(value => {
        const countText = value.count === undefined ? '' : `（<b class="theme2-chip-count">${value.count}</b>）`;
        return `<button class="chip theme2-dimension-chip ${value.index === 0 ? 'active' : ''}" data-select-target="${selectId}" data-select-value="${value.value}" type="button">${value.label}${countText}</button>`;
      }).join('');
      container.innerHTML = labels;
      container.querySelectorAll('.theme2-dimension-chip').forEach(chip => chip.addEventListener('click', () => {
        select.value = chip.dataset.selectValue;
        container.querySelectorAll('.theme2-dimension-chip').forEach(item => item.classList.remove('active'));
        chip.classList.add('active');
        theme2View.querySelectorAll('.theme2-filter-chip').forEach(item => item.classList.toggle('active', item.dataset.theme2Filter === 'all'));
        applyFilters();
      }));
    }

    renderChipGroup('theme2-category-chips', [
      { label: '全部', value: '全部功能分類', index: 0, count: items.length },
      ...categories.map((category, index) => ({ label: category, value: category, index: index + 1, count: count(item => itemGroup(item) === category) }))
    ], 'theme2-category-filter');
    renderChipGroup('theme2-expected-date-chips', [
      { label: '全部', value: 'all', index: 0, count: items.length },
      ...expectedDates.map((value, index) => ({ label: expectedDateLabel(value), value, index: index + 1, count: count(item => expectedDateValue(item) === value) }))
    ], 'theme2-expected-date-filter');
    theme2View.querySelectorAll('.theme2-filter-chip').forEach(chip => chip.addEventListener('click', () => {
      theme2View.querySelectorAll('.theme2-filter-chip').forEach(item => item.classList.remove('active'));
      chip.classList.add('active');
      applyFilters();
    }));
    ['theme2-category-filter', 'theme2-expected-date-filter', 'theme2-stage-filter', 'theme2-search-input'].forEach(id => document.getElementById(id)?.addEventListener('input', applyFilters));
    theme2View.querySelector('.demo-reset-btn')?.addEventListener('click', () => {
      ['theme2-category-filter', 'theme2-expected-date-filter', 'theme2-stage-filter'].forEach(id => { const select = document.getElementById(id); if (select) select.selectedIndex = 0; });
      const search = document.getElementById('theme2-search-input');
      if (search) search.value = '';
      theme2View.querySelectorAll('.theme2-filter-chip').forEach(item => item.classList.toggle('active', item.dataset.theme2Filter === 'all'));
      theme2View.querySelectorAll('.theme2-dimension-chip').forEach(item => item.classList.toggle('active', item.dataset.selectValue === item.closest('.theme2-filter-content')?.querySelector('.theme2-dimension-chip')?.dataset.selectValue));
      applyFilters();
    });
    theme2View.querySelectorAll('[data-theme2-stage]').forEach(button => button.addEventListener('click', () => {
      const stageSelect = document.getElementById('theme2-stage-filter');
      if (stageSelect) {
        const clickedStage = button.dataset.theme2Stage;
        stageSelect.value = stageSelect.value === clickedStage ? '全部階段' : clickedStage;
        theme2View.querySelectorAll('.theme2-filter-chip').forEach(item => item.classList.toggle('active', item.dataset.theme2Filter === 'all'));
        applyFilters();
      }
    }));
  }

  function finishTheme2Load(statusText, statusIcon = 'fa-database') {
    bindTheme2Controls();
    updateDashboard();
    setTheme2ApiStatus(statusText, statusIcon, 'connected');
  }

  function setTheme2ApiStatus(text, icon, state) {
    const status = theme2View.querySelector('.theme2-api-status');
    if (!status) return;
    status.classList.remove('is-loading', 'is-connected', 'is-error');
    status.classList.add(`is-${state}`);
    status.setAttribute('title', `主題二 API 設定・${text}`);
    status.setAttribute('aria-label', `主題二 API 設定，${text}`);
    const label = status.querySelector('.theme2-api-status-label');
    if (label) label.textContent = text;
  }

  async function loadTheme2Api() {
    const response = await fetch(`${theme2ApiUrl}?key=${encodeURIComponent(theme2ApiKey)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Theme 2 API ${response.status}`);
    const payload = await response.json();
    if (payload.error || !Array.isArray(payload.items)) throw new Error(payload.error || 'Theme 2 API 回傳格式不正確');
    theme2ProjectName = payload.projectName || 'SGF 專案';
    items = payload.items.map(normalizeRow).filter(Boolean);
    finishTheme2Load('Google Sheet API', 'fa-cloud');
  }

  function closeDetailModal() {
    const modal = document.getElementById('theme2-detail-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('body-scroll-lock');
  }

  function closeStageHelpModal() {
    const modal = document.getElementById('theme2-stage-help-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('body-scroll-lock');
  }

  const stageHelpModal = document.getElementById('theme2-stage-help-modal');
  const openTheme2Help = () => {
    if (!stageHelpModal) return;
    stageHelpModal.classList.add('open');
    stageHelpModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('body-scroll-lock');
  };
  document.getElementById('theme2-stage-help-btn')?.addEventListener('click', openTheme2Help);
  document.getElementById('theme2-help-btn')?.addEventListener('click', openTheme2Help);
  document.getElementById('theme2-schedule-btn')?.addEventListener('click', () => scheduleBtn?.click());
  document.getElementById('theme2-stage-help-close')?.addEventListener('click', closeStageHelpModal);
  stageHelpModal?.addEventListener('click', event => {
    if (event.target.id === 'theme2-stage-help-modal') closeStageHelpModal();
  });

  document.getElementById('theme2-detail-close')?.addEventListener('click', closeDetailModal);
  document.getElementById('theme2-detail-modal')?.addEventListener('click', event => {
    if (event.target.id === 'theme2-detail-modal') closeDetailModal();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeDetailModal();
      closeStageHelpModal();
    }
  });

  const theme2SetupModal = document.getElementById('theme2-setup-modal');
  const theme2UrlInput = document.getElementById('theme2-gas-url');
  const theme2KeyInput = document.getElementById('theme2-api-key');
  const closeTheme2Config = () => theme2SetupModal?.classList.remove('open');
  document.getElementById('theme2-config-btn')?.addEventListener('click', () => {
    if (!theme2SetupModal) return;
    if (theme2UrlInput) theme2UrlInput.value = theme2ApiUrl;
    if (theme2KeyInput) theme2KeyInput.value = theme2ApiKey;
    theme2SetupModal.classList.add('open');
  });
  document.getElementById('theme2-close-config-btn')?.addEventListener('click', closeTheme2Config);
  document.getElementById('theme2-cancel-config-btn')?.addEventListener('click', closeTheme2Config);
  theme2SetupModal?.addEventListener('click', event => {
    if (event.target === theme2SetupModal) closeTheme2Config();
  });
  document.getElementById('theme2-save-config-btn')?.addEventListener('click', () => {
    const url = theme2UrlInput?.value.trim() || '';
    const key = theme2KeyInput?.value.trim() || '';
    if (!url || !key) {
      window.dashboardShowToast('請完整填寫主題二 API 網址與金鑰', 'error');
      return;
    }
    localStorage.setItem('sgf_theme2_gas_url', url);
    localStorage.setItem('sgf_theme2_api_key', key);
    theme2ApiUrl = url;
    theme2ApiKey = key;
    window.dashboardShowToast('主題二 API 設定已儲存，正在重新連線', 'success');
    sessionStorage.setItem('sgf_active_theme_once', 'theme2');
    window.location.reload();
  });

  loadTheme2Api().catch(error => {
    console.error('Theme 2 Google Sheet API load failed', error);
    setTheme2ApiStatus('API 連線失敗', 'fa-triangle-exclamation', 'error');
    const flowMap = document.getElementById('theme2-flow-map');
    if (flowMap) flowMap.innerHTML = '<div class="detail-empty"><i class="fa-solid fa-triangle-exclamation"></i><strong>無法連接 Google Sheet API</strong><span>請確認 Apps Script 部署、API 網址與存取金鑰。</span></div>';
  });
})();
