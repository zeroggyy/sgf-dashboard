// 主題二資料來源：僅使用 Google Sheet API。
(function setupTheme2DataSource() {
  if (document.body.dataset.dashboardMode === 'multipage' && document.body.dataset.dashboardKey !== 'theme2') return;
  const theme2View = document.getElementById('theme-view-theme2');
  if (!theme2View) return;

  const DEFAULT_THEME2_API_URL = 'https://script.google.com/macros/s/AKfycbyLKI1sjAIOYpUV13bfb-jLly46ASHi3bZjSYztYZJsKL3y0VxK3d5Dyl8eQrhSpsApyw/exec';
  const DEFAULT_THEME2_API_KEY = 'SGF_THEME2_2026_UI_FLOW_8fK2mP7x';
  let theme2ApiUrl = localStorage.getItem('sgf_theme2_gas_url') || DEFAULT_THEME2_API_URL;
  let theme2ApiKey = localStorage.getItem('sgf_theme2_api_key') || DEFAULT_THEME2_API_KEY;
  const THEME2_CACHE_KEY = 'sgf_theme2_last_success_payload';
  const THEME2_REQUEST_TIMEOUT_MS = 20000;
  const THEME2_MAX_ATTEMPTS = 3;
  const STAGES = ['planning', 'function', 'placeholder', 'art', 'integration', 'final'];
  const PIPELINE_STAGES = [...STAGES, 'returned', 'completed'];
  const STAGE_FIELDS = {
    planning: ['企劃需求完成', '企劃'],
    function: ['程式功能完成', '功能'],
    placeholder: ['代圖操作確認', '代圖操作'],
    art: ['美術拆圖完成', '拆圖'],
    integration: ['企劃整合完成', '編輯'],
    final: ['最終確認完成', 'final']
  };
  const STAGE_LABELS = {
    planning: '待企劃需求',
    function: '待程式功能',
    placeholder: '待代圖操作確認',
    art: '待美術製作',
    integration: '待正式介面整合',
    final: '待製作人確認',
    returned: '退回處理中',
    completed: '已結案'
  };
  const PIPELINE_LABELS = {
    planning: '企劃需求',
    function: '程式功能',
    placeholder: '代圖確認',
    art: '美術製作',
    integration: '正式介面',
    final: '製作人確認',
    returned: '退回處理',
    completed: '已完成'
  };
  const REQUIREMENT_BATCH_LABELS = {
    1: '第一批',
    2: '第二批',
    3: '第三批'
  };
  let items = [];
  let rawSheetRows = [];
  let theme2ProjectName = 'SGF 專案';
  let openMechanismKey = '';
  let detailEditing = false;
  let artWorkFilter = 'work';
  let progressView = 'art';

  function isTrue(value) { return String(value).toUpperCase() === 'TRUE'; }
  function stageDone(row, stage) {
    return isTrue(STAGE_FIELDS[stage].map(field => row[field]).find(value => value !== undefined));
  }
  function firstStage(row) {
    if (isTrue(row['退回修改中'])) return 'returned';
    const firstIncomplete = STAGES.find(stage => !stageDone(row, stage));
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
  function normalizeRow(row, index, masterRowsBySequence) {
    const sequence = String(row['序號'] || '').trim();
    const isReference = String(row['進度主項'] || '').toUpperCase() === 'FALSE';
    const masterRow = isReference && masterRowsBySequence.get(sequence) ? masterRowsBySequence.get(sequence) : row;
    const hasWorkflow = STAGES.some(stage => STAGE_FIELDS[stage].some(field => masterRow[field] !== undefined && masterRow[field] !== ''));
    const usesNewColumns = Object.prototype.hasOwnProperty.call(row, '機制') || Object.prototype.hasOwnProperty.call(row, '項目');
    const category = row['機制'] || row['分類'] || '未分類';
    const name = row['項目'] || row['項目名稱'] || (sequence ? `${category} · ${sequence}` : category);
    if (!hasWorkflow || (!row['機制'] && !row['項目'] && !row['分類'] && !row['項目名稱'])) return null;
    const batch = String(row['製作批次'] || row['優先'] || '').trim();
    const expectedDate = masterRow['企劃整合目標日'] || masterRow['期望完成'] || '';
    const screenshotPath = masterRow['介面截圖路徑（需求／代圖）'] || masterRow['介面截圖路徑'] || masterRow['介面截圖路徑(需求)'] || '';
    const artUploadPath = masterRow['美術上傳路徑'] || '';
    const archivePath = masterRow['拆圖歸檔路徑'] || '';
    const formalPath = masterRow['正式完成路徑'] || '';
    const gyazoUrl = masterRow['網頁縮圖連結'] || masterRow['截圖'] || masterRow['圖片網址'] || masterRow['Gyazo'] || masterRow['P'] || '';
    const finalDate = masterRow['最終確認日'] || '';
    const criticalFields = [
      [masterRow['企劃開表日'] || masterRow['企劃開表'], '企劃開表日'],
      [expectedDate, '企劃整合目標日'],
      [screenshotPath, '需求／代圖路徑']
    ];
    if (stageDone(masterRow, 'art')) criticalFields.push([artUploadPath, '美術上傳路徑'], [archivePath, '拆圖歸檔路徑']);
    if (stageDone(masterRow, 'final')) criticalFields.push([formalPath && formalPath !== '1111' ? formalPath : '', '正式完成路徑'], [gyazoUrl, '網頁縮圖連結'], [finalDate, '最終確認日']);
    const missingFields = criticalFields.filter(([value]) => !String(value || '').trim()).map(([, label]) => label);
    return {
      rowIndex: index + 2,
      id: `${category}-${name}-${index}`,
      itemId: String(row['項目ID'] || '').trim(),
      sourceItemId: String(masterRow['項目ID'] || '').trim(),
      raw: row,
      masterRaw: masterRow,
      name,
      category,
      mechanism: usesNewColumns ? category : (row['第二層節點'] || row['機制分類'] || ''),
      description: row['項目說明'] || '',
      sequence,
      batch,
      // 新版 A 欄字母只作為內部批次代碼；畫面統一顯示 B 欄「機制」。
      batchLabel: usesNewColumns ? (category || '未分批') : batchLabel(batch),
      stage: firstStage(masterRow),
      stageLabel: STAGE_LABELS[firstStage(masterRow)] || '已完成',
      plannedDate: masterRow['企劃開表日'] || masterRow['企劃開表'] || '',
      expectedDate,
      artSubmitDate: masterRow['美術可用交付日'] || masterRow['美術提交'] || '',
      screenshotPath,
      artUploadPath,
      archivePath,
      formalPath,
      gyazoUrl,
      notes: row['備註'] || masterRow['備註'] || '',
      checklist: Object.fromEntries(STAGES.map(stage => [stage, stageDone(masterRow, stage)])),
      missingFields,
      isReference,
      sourceName: isReference ? (masterRow['項目'] || masterRow['項目名稱'] || sequence) : '',
      returned: isTrue(masterRow['退回修改中']),
      returnReason: masterRow['退回原因'] || '',
      returnDate: masterRow['退回日期'] || '',
      reconfirmationDate: masterRow['重新確認日期'] || '',
      finalDate
    };
  }

  function count(predicate) { return items.filter(predicate).length; }
  function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }
  function getGyazoId(value) {
    return String(value || '').match(/gyazo\.com\/(?:public\/)?([a-zA-Z0-9]+)/i)?.[1] || '';
  }
  function parseTheme2Date(value) {
    const match = String(value || '').trim().match(/^(\d{4})[.\/-](\d{1,2})(?:[.\/-](\d{1,2}))?/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3] || 1));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function theme2DueState(item) {
    if (!['art', 'returned'].includes(item.stage)) return '';
    const target = parseTheme2Date(item.expectedDate);
    if (!target) return '';
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const days = Math.ceil((target - start) / 86400000);
    if (days < 0) return 'overdue';
    if (days <= 7) return 'due-soon';
    return '';
  }
  function artActionOf(item) {
    if (item.stage === 'returned') return '處理退回修改';
    if (item.stage === 'art') return '開始美術製作';
    if (item.stage === 'integration') return '等待正式介面整合';
    if (item.stage === 'final') return '等待製作人確認';
    if (item.stage === 'completed') return '已完成';
    return '等待需求準備';
  }
  function artPriorityOf(item) {
    const due = theme2DueState(item);
    if (item.stage === 'returned') return 0;
    if (due === 'overdue') return 1;
    if (due === 'due-soon') return 2;
    if (item.stage === 'art') return 3;
    if (['planning', 'function', 'placeholder'].includes(item.stage)) return 4;
    if (item.stage === 'integration') return 5;
    if (item.stage === 'final') return 6;
    return 7;
  }
  function compareArtWork(a, b) {
    const priority = artPriorityOf(a) - artPriorityOf(b);
    if (priority) return priority;
    const aDate = parseTheme2Date(a.expectedDate);
    const bDate = parseTheme2Date(b.expectedDate);
    if (aDate && bDate && aDate.getTime() !== bDate.getTime()) return aDate - bDate;
    if (aDate && !bDate) return -1;
    if (!aDate && bDate) return 1;
    return a.rowIndex - b.rowIndex;
  }
  function matchesArtWorkFilter(item, filter = artWorkFilter) {
    if (filter === 'work') return ['art', 'returned'].includes(item.stage);
    if (filter === 'all') return true;
    if (filter === 'ready') return item.stage === 'art';
    if (filter === 'returned') return item.stage === 'returned';
    if (filter === 'due-soon') return theme2DueState(item) === 'due-soon';
    if (filter === 'overdue') return theme2DueState(item) === 'overdue';
    return true;
  }
  function renderArtWorkSummary() {
    let panel = document.getElementById('theme2-art-work-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'theme2-art-work-panel';
      panel.className = 'theme2-art-work-panel';
      const pipeline = theme2View.querySelector('.theme2-pipeline-panel');
      pipeline?.parentNode?.insertBefore(panel, pipeline);
    }
    let tabs = document.getElementById('theme2-progress-view-tabs');
    if (!tabs) {
      tabs = document.createElement('div');
      tabs.id = 'theme2-progress-view-tabs';
      tabs.className = 'theme2-progress-view-tabs';
      panel.parentNode?.insertBefore(tabs, panel);
    }
    tabs.innerHTML = `<div><span class="theme2-kicker">PROGRESS VIEW</span><h2><i class="fa-solid fa-eye"></i> 進度檢視</h2></div><div class="theme2-progress-view-actions" role="tablist" aria-label="進度檢視模式"><button class="${progressView === 'art' ? 'active' : ''}" data-progress-view="art" type="button" role="tab" aria-selected="${progressView === 'art'}"><i class="fa-solid fa-palette"></i> 美術待辦</button><button class="${progressView === 'pipeline' ? 'active' : ''}" data-progress-view="pipeline" type="button" role="tab" aria-selected="${progressView === 'pipeline'}"><i class="fa-solid fa-arrow-right-arrow-left"></i> 整體流程</button></div>`;
    const configs = [
      ['ready', '可開始製作', '目前輪到美術'],
      ['returned', '退回修改', '優先處理'],
      ['due-soon', '即將到期', '目標日 7 天內'],
      ['overdue', '已逾期', '超過目標日']
    ];
    const workCount = items.filter(item => matchesArtWorkFilter(item, 'work')).length;
    panel.innerHTML = `<div class="theme2-art-work-heading"><div><span class="theme2-kicker">ART WORK FILTER</span><h2><i class="fa-solid fa-palette"></i> 美術手上工作</h2></div><p><i class="fa-solid fa-circle-info"></i> 目前手上 ${workCount} 項；點擊條件可縮小下方清單，再次點擊可解除。</p></div><div class="theme2-art-work-stats">${configs.map(([filter, label, note]) => `<button class="theme2-art-work-stat ${artWorkFilter === filter ? 'active' : ''} ${filter === 'returned' || filter === 'overdue' ? 'is-alert' : filter === 'due-soon' ? 'is-warning' : ''}" data-art-work-filter="${filter}" type="button" aria-pressed="${artWorkFilter === filter}"><span>${label}</span><strong>${items.filter(item => matchesArtWorkFilter(item, filter)).length}</strong><small>${artWorkFilter === filter ? '篩選中' : note}</small></button>`).join('')}</div>`;
    panel.querySelectorAll('[data-art-work-filter]').forEach(button => button.addEventListener('click', () => {
      const selected = button.dataset.artWorkFilter;
      artWorkFilter = artWorkFilter === selected ? 'work' : selected;
      applyFilters();
    }));
    tabs.querySelectorAll('[data-progress-view]').forEach(button => button.addEventListener('click', () => {
      progressView = button.dataset.progressView;
      applyFilters();
    }));
    syncProgressView();
  }
  function syncProgressView() {
    const tabs = document.getElementById('theme2-progress-view-tabs');
    const artPanel = document.getElementById('theme2-art-work-panel');
    const pipelinePanel = theme2View.querySelector('.theme2-pipeline-panel');
    tabs?.querySelectorAll('[data-progress-view]').forEach(button => {
      const active = button.dataset.progressView === progressView;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    artPanel?.classList.toggle('is-view-hidden', progressView !== 'art');
    pipelinePanel?.classList.toggle('is-view-hidden', progressView !== 'pipeline');
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
      const label = button.querySelector('span');
      if (label) label.textContent = PIPELINE_LABELS[stage] || STAGE_LABELS[stage] || label.textContent;
      button.classList.toggle('is-bottleneck', maxCount > 0 && stageCount === maxCount);
      button.classList.toggle('is-empty', stageCount === 0);
      button.classList.toggle('is-active', activeStage === stage);
      button.setAttribute('aria-pressed', String(activeStage === stage));
    });
    theme2View.querySelectorAll('.stage-definition-list article').forEach((article, index) => {
      const stage = PIPELINE_STAGES[index];
      const heading = article.querySelector('b');
      if (heading && stage) heading.textContent = `${String(index + 1).padStart(2, '0')} · ${PIPELINE_LABELS[stage]}`;
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
    const getCategoryCard = (category, group) => {
      const completedSteps = group.reduce((sum, item) => sum + STAGES.filter(stage => item.checklist[stage]).length, 0);
      const progress = Math.round((completedSteps / (group.length * STAGES.length)) * 100);
      const missingCount = group.reduce((sum, item) => sum + item.missingFields.length, 0);
      const stageCounts = {};
      group.forEach(item => { stageCounts[item.stage] = (stageCounts[item.stage] || 0) + 1; });
      const currentStage = Object.entries(stageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
      const itemCards = group.map(item => {
        const itemProgress = Math.round((STAGES.filter(stage => item.checklist[stage]).length / STAGES.length) * 100);
        const itemState = [item.missingFields.length > 0 ? 'has-missing' : '', itemProgress === 100 ? 'is-complete' : '', item.returned ? 'is-returned' : '', item.isReference ? 'is-reference' : ''].filter(Boolean).join(' ');
        const itemGyazoId = getGyazoId(item.gyazoUrl);
        const itemPreviewUrl = itemGyazoId ? `https://i.gyazo.com/${itemGyazoId}.jpg` : '';
        const itemPreview = itemGyazoId
          ? `<span class="ui-flow-item-thumb"><img src="${escapeHtml(itemPreviewUrl)}" data-gyazo-id="${escapeHtml(itemGyazoId)}" data-original-url="${escapeHtml(item.gyazoUrl)}" alt="${escapeHtml(item.name)} 預覽" loading="lazy" referrerpolicy="no-referrer"></span>`
          : '<span class="ui-flow-item-thumb is-empty">無預覽</span>';
        const openOriginal = itemGyazoId ? `<span class="ui-flow-item-open" data-original-url="${escapeHtml(item.gyazoUrl)}" role="button" tabindex="0" title="開啟原圖" aria-label="開啟 ${escapeHtml(item.name)} 原圖"><i class="fa-solid fa-arrow-up-right-from-square"></i></span>` : '';
        const sequenceText = item.sequence ? `<small class="ui-flow-item-sequence">${escapeHtml(item.sequence)}</small>` : '';
        const descriptionText = item.description ? `<small class="ui-flow-item-description">${escapeHtml(item.description)}</small>` : '';
        const referenceText = item.isReference ? `<small class="ui-flow-item-reference">共用 ${escapeHtml(item.sourceName || item.sequence)} 的進度</small>` : '';
        return `<button class="ui-flow-item ${itemState}" data-theme2-item-id="${escapeHtml(item.id)}" type="button">${itemPreview}${openOriginal}<span class="ui-flow-item-copy">${sequenceText}<strong>${escapeHtml(item.name || category)}</strong>${descriptionText}${referenceText}</span><b class="ui-flow-item-stage">${escapeHtml(item.stageLabel)}</b></button>`;
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

  function renderMechanismAccordion(filteredItems = items) {
    const container = document.getElementById('theme2-flow-map');
    if (!container) return;
    setText('theme2-flow-count', `目前顯示 ${filteredItems.length} / ${items.length} 項`);
    const groups = new Map();
    [...filteredItems].sort(compareArtWork).forEach(item => {
      const mechanism = itemGroup(item);
      if (!groups.has(mechanism)) groups.set(mechanism, []);
      groups.get(mechanism).push(item);
    });
    if (!groups.size) {
      container.innerHTML = progressView === 'art'
        ? '<div class="detail-empty theme2-art-work-empty"><i class="fa-solid fa-circle-check"></i><strong>目前沒有美術工作</strong><span>可開始製作、退回修改、即將到期與已逾期目前皆為 0。</span></div>'
        : '<div class="detail-empty"><strong>沒有符合條件的畫面</strong><span>請調整篩選條件</span></div>';
      return;
    }
    if (!groups.has(openMechanismKey)) openMechanismKey = groups.size === 1 ? groups.keys().next().value : '';
    const progressOf = group => Math.round(group.reduce((sum, item) => sum + STAGES.filter(stage => item.checklist[stage]).length, 0) / (group.length * STAGES.length) * 100);
    const summaryOf = group => {
      const stageCounts = {};
      group.forEach(item => { stageCounts[item.stage] = (stageCounts[item.stage] || 0) + 1; });
      const [stage, count] = Object.entries(stageCounts).sort((a, b) => b[1] - a[1])[0] || ['planning', 0];
      return { stage, count, missing: group.reduce((sum, item) => sum + item.missingFields.length, 0), returned: group.filter(item => item.returned).length };
    };
    const cardOf = item => {
      const imageId = getGyazoId(item.gyazoUrl);
      const preview = imageId
        ? `<span class="mechanism-item-thumb"><img src="https://i.gyazo.com/${escapeHtml(imageId)}.jpg" data-gyazo-id="${escapeHtml(imageId)}" alt="${escapeHtml(item.name)} 預覽" loading="lazy" referrerpolicy="no-referrer"></span>`
        : '<span class="mechanism-item-thumb is-empty"><i class="fa-regular fa-image"></i><small>未提供縮圖</small></span>';
      const state = [item.missingFields.length ? 'has-missing' : '', item.returned ? 'is-returned' : '', item.isReference ? 'is-reference' : '', STAGES.every(stage => item.checklist[stage]) ? 'is-complete' : ''].filter(Boolean).join(' ');
      const dueState = theme2DueState(item);
      const dueLabel = dueState === 'overdue' ? '已逾期' : dueState === 'due-soon' ? '7 天內到期' : '';
      const flags = [item.isReference ? '共用進度' : '', item.returned ? '退回處理' : '', dueLabel, item.missingFields.length ? `待補 ${item.missingFields.length}` : ''].filter(Boolean).map(flag => `<small>${escapeHtml(flag)}</small>`).join('');
      const openImage = imageId ? `<span class="mechanism-item-open" data-original-url="${escapeHtml(item.gyazoUrl)}" role="button" tabindex="0" aria-label="開啟 ${escapeHtml(item.name)} 原圖"><i class="fa-solid fa-arrow-up-right-from-square"></i></span>` : '';
      return `<button class="mechanism-item-card ${state} ${dueState}" data-theme2-item-id="${escapeHtml(item.id)}" type="button">${preview}${openImage}<span class="mechanism-item-copy"><small class="mechanism-item-sequence">${escapeHtml(item.sequence || '待補序號')}</small><strong>${escapeHtml(item.name || item.category)}</strong><span class="mechanism-item-action"><i class="fa-solid fa-arrow-right"></i> ${escapeHtml(artActionOf(item))}</span><span class="mechanism-item-due"><b>目標</b> ${escapeHtml(item.expectedDate || '未定')}</span><span class="mechanism-item-flags">${flags}</span></span></button>`;
    };
    const accordions = [...groups.entries()].map(([mechanism, group]) => {
      const key = encodeURIComponent(mechanism);
      const open = mechanism === openMechanismKey;
      const progress = progressOf(group);
      const summary = summaryOf(group);
      const status = `${STAGE_LABELS[summary.stage] || summary.stage} ${summary.count} 項`;
      const notices = [summary.returned ? `退回 ${summary.returned}` : '', summary.missing ? `缺欄 ${summary.missing}` : ''].filter(Boolean).map(value => `<small>${value}</small>`).join('');
      return `<section class="mechanism-accordion ${open ? 'is-open' : ''}" data-mechanism-key="${key}"><button class="mechanism-accordion-toggle" type="button" aria-expanded="${open}"><span class="mechanism-accordion-title"><i class="fa-solid fa-layer-group"></i><strong>${escapeHtml(mechanism)}</strong><small>${group.length} 個項目</small></span><span class="mechanism-accordion-summary"><span><b>主要卡點</b>${escapeHtml(status)}</span><span class="mechanism-accordion-progress"><i><em style="width:${progress}%"></em></i><b>${progress}%</b></span><span class="mechanism-accordion-notices">${notices}</span></span><i class="fa-solid fa-chevron-down mechanism-accordion-chevron"></i></button><div class="mechanism-accordion-panel"><div class="mechanism-accordion-panel-head"><span>${escapeHtml(mechanism)} · UI 項目與進度</span><small>已依退回、期限與可執行狀態排序</small></div><div class="mechanism-item-grid">${[...group].sort(compareArtWork).map(cardOf).join('')}</div></div></section>`;
    }).join('');
    container.innerHTML = `<div class="mechanism-accordion-list">${accordions}</div>`;
    container.querySelectorAll('.mechanism-accordion-toggle').forEach(toggle => toggle.addEventListener('click', () => {
      const section = toggle.closest('.mechanism-accordion');
      const selected = decodeURIComponent(section.dataset.mechanismKey || '');
      openMechanismKey = section.classList.contains('is-open') ? '' : selected;
      renderMechanismAccordion(filteredItems);
    }));
    container.querySelectorAll('img[data-gyazo-id]').forEach(image => {
      const id = image.dataset.gyazoId;
      const extensions = ['jpg', 'png', 'gif']; let attempt = 0;
      image.addEventListener('error', () => { attempt += 1; if (attempt < extensions.length) image.src = `https://i.gyazo.com/${id}.${extensions[attempt]}`; });
    });
    container.querySelectorAll('.mechanism-item-open[data-original-url]').forEach(control => {
      const open = event => { event.preventDefault(); event.stopPropagation(); window.open(control.dataset.originalUrl, '_blank', 'noopener,noreferrer'); };
      control.addEventListener('click', open);
      control.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') open(event); });
    });
    container.querySelectorAll('[data-theme2-item-id]').forEach(card => card.addEventListener('click', () => {
      const item = items.find(candidate => candidate.id === card.dataset.theme2ItemId);
      if (item) renderDetail(item);
    }));
  }

  async function updateTheme2Item(itemId, changes) {
    let response;
    try {
      response = await fetch(`${theme2ApiUrl}?key=${encodeURIComponent(theme2ApiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'updateUiItem', itemId, changes })
      });
    } catch (error) {
      throw new Error('無法連線至 Google Sheet API；請確認 Apps Script 網頁應用程式已部署，且網址仍為 /exec。');
    }
    const responseText = await response.text();
    let payload;
    try {
      payload = JSON.parse(responseText);
    } catch (error) {
      throw new Error(`Apps Script 未回傳可讀取的 JSON（HTTP ${response.status}）。請重新部署包含 doPost 的新版網頁應用程式。`);
    }
    if (!response.ok || payload.error) throw new Error(payload.error || `儲存失敗（HTTP ${response.status}）`);
    return payload;
  }

  function rebuildTheme2Items(rows) {
    const masterRowsBySequence = new Map();
    rows.forEach(row => {
      const sequence = String(row['序號'] || '').trim();
      if (sequence && isTrue(row['進度主項'])) masterRowsBySequence.set(sequence, row);
    });
    items = rows.map((row, index) => normalizeRow(row, index, masterRowsBySequence)).filter(Boolean);
  }

  function applyLocalTheme2Changes(itemId, changes) {
    const targetRow = rawSheetRows.find(row => String(row['項目ID'] || '').trim() === itemId);
    if (!targetRow) return;
    Object.assign(targetRow, changes);
    rebuildTheme2Items(rawSheetRows);
    applyFilters();
  }

  function renderDetailEditor(item) {
    const detail = document.getElementById('theme2-detail-modal-body');
    if (!detail) return;
    const data = item.masterRaw;
    const textInput = (label, key, value = data[key] || '', wide = false) => `<label class="theme2-edit-field ${wide ? 'is-wide' : ''}"><span>${label}</span><input name="${escapeHtml(key)}" value="${escapeHtml(value)}" autocomplete="off"></label>`;
    const textarea = (label, key, value = data[key] || '') => `<label class="theme2-edit-field is-wide"><span>${label}</span><textarea name="${escapeHtml(key)}" rows="3">${escapeHtml(value)}</textarea></label>`;
    const check = (label, key) => `<label class="theme2-edit-check"><input type="checkbox" name="${escapeHtml(key)}" ${isTrue(data[key]) ? 'checked' : ''}><span>${label}</span></label>`;
    document.getElementById('theme2-detail-modal-heading').textContent = `編輯：${item.name || '項目詳情'}`;
    detail.innerHTML = `<form id="theme2-edit-form" class="theme2-edit-form"><div class="theme2-edit-note"><i class="fa-solid fa-pen-to-square"></i> 正在編輯主項 <b>${escapeHtml(item.itemId || '待補項目ID')}</b>；儲存後會直接回寫 Google Sheet。</div><div class="theme2-edit-grid">${textInput('群組編號', '群組編號')}${textInput('機制', '機制')}${textInput('項目', '項目')}${textInput('序號', '序號')}${textarea('項目說明', '項目說明')}${textInput('企劃開表日', '企劃開表日')}${textInput('企劃整合目標日', '企劃整合目標日')}${textInput('美術交付紀錄', '美術可用交付日')}${textInput('最終確認日', '最終確認日')}${textInput('需求／代圖路徑', '介面截圖路徑（需求／代圖）', data['介面截圖路徑（需求／代圖）'] || data['介面截圖路徑'] || '', true)}${textInput('美術上傳路徑', '美術上傳路徑', data['美術上傳路徑'] || '', true)}${textInput('拆圖歸檔路徑', '拆圖歸檔路徑', data['拆圖歸檔路徑'] || '', true)}${textInput('正式完成路徑', '正式完成路徑', data['正式完成路徑'] || '', true)}${textInput('網頁縮圖連結', '網頁縮圖連結', data['網頁縮圖連結'] || '', true)}${textarea('備註', '備註')}</div><fieldset class="theme2-edit-stages"><legend>交付流程狀態</legend>${check('企劃需求完成', '企劃需求完成')}${check('程式功能完成', '程式功能完成')}${check('代圖操作確認', '代圖操作確認')}${check('美術製作完成', '美術拆圖完成')}${check('正式介面完成', '企劃整合完成')}${check('最終確認完成', '最終確認完成')}</fieldset><fieldset class="theme2-edit-stages theme2-edit-return"><legend>製作人退回處理</legend>${check('退回修改中', '退回修改中')}${textarea('退回原因', '退回原因')}${textInput('退回日期', '退回日期')}${textInput('重新確認日期', '重新確認日期')}</fieldset><div class="theme2-edit-actions"><button id="theme2-edit-cancel" class="btn" type="button">取消</button><button id="theme2-edit-save" class="btn btn-gouga" type="submit"><i class="fa-solid fa-floppy-disk"></i> 儲存變更</button></div></form>`;
    detail.querySelector('#theme2-edit-cancel')?.addEventListener('click', () => { detailEditing = false; renderDetail(item); });
    detail.querySelector('#theme2-edit-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const saveButton = form.querySelector('#theme2-edit-save');
      const formData = new FormData(form);
      const changes = Object.fromEntries(formData.entries());
      ['企劃需求完成', '程式功能完成', '代圖操作確認', '美術拆圖完成', '企劃整合完成', '最終確認完成', '退回修改中'].forEach(key => { changes[key] = form.querySelector(`[name="${key}"]`).checked ? 'TRUE' : 'FALSE'; });
      saveButton.disabled = true;
      saveButton.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> 儲存中';
      try {
        await updateTheme2Item(item.itemId, changes);
        applyLocalTheme2Changes(item.itemId, changes);
        window.dashboardShowToast('已回寫 Google Sheet', 'success');
        detailEditing = false;
        closeDetailModal();
        loadTheme2Api().catch(error => console.warn('Theme 2 background refresh failed', error));
      } catch (error) {
        window.dashboardShowToast(`儲存失敗：${error.message}`, 'error');
        saveButton.disabled = false;
        saveButton.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 儲存變更';
      }
    });
  }

  function renderDetail(item) {
    const modal = document.getElementById('theme2-detail-modal');
    const detail = document.getElementById('theme2-detail-modal-body');
    if (!modal || !detail) return;
    if (detailEditing) { renderDetailEditor(item); modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); document.body.classList.add('body-scroll-lock'); return; }
    const missing = [...item.missingFields];
    const completeness = missing.length
      ? `<div class="detail-missing"><i class="fa-solid fa-triangle-exclamation"></i> 建議補齊：${missing.join('、')}</div>`
      : '<div class="detail-complete"><i class="fa-solid fa-circle-check"></i> 追蹤資料完整</div>';
    const pathRow = (label, path) => {
      const hasPath = Boolean(path);
      return `<div class="detail-path-row"><span><b>${label}：</b>${escapeHtml(path || '待補')}</span><button class="detail-copy-path" type="button" ${hasPath ? `data-copy-path="${escapeHtml(path)}"` : 'disabled'} title="${hasPath ? `複製${label}路徑` : `${label}尚未填寫`}" aria-label="${hasPath ? `複製${label}路徑` : `${label}尚未填寫`}"><i class="fa-regular fa-copy"></i></button></div>`;
    };
    const description = `<div class="theme2-detail-description theme2-detail-description-primary"><span>項目說明</span><p>${escapeHtml(item.description || '尚未填寫')}</p></div>`;
    const thumbnailId = getGyazoId(item.gyazoUrl);
    const thumbnail = thumbnailId ? `<a class="theme2-detail-thumbnail" href="${escapeHtml(item.gyazoUrl)}" target="_blank" rel="noopener noreferrer" title="開啟原始縮圖"><img src="https://i.gyazo.com/${escapeHtml(thumbnailId)}.jpg" data-gyazo-id="${escapeHtml(thumbnailId)}" alt="${escapeHtml(item.name)} 縮圖" loading="lazy" referrerpolicy="no-referrer"><span><i class="fa-solid fa-arrow-up-right-from-square"></i> 點擊開啟原圖</span></a>` : '';
    const notes = item.notes ? `<div class="theme2-detail-description"><span>備註</span><p>${escapeHtml(item.notes)}</p></div>` : '';
    const source = item.isReference ? `<div class="detail-reference"><i class="fa-solid fa-link"></i> 此項目共用「${escapeHtml(item.sourceName || item.sequence)}」的進度與交付資料。</div>` : '';
    const returned = item.returned ? `<div class="detail-returned"><i class="fa-solid fa-rotate-left"></i><b>製作人退回修改中</b><span>退回日期：${escapeHtml(item.returnDate || '待補')} · 重新確認：${escapeHtml(item.reconfirmationDate || '待補')}</span><p>${escapeHtml(item.returnReason || '待補退回原因')}</p></div>` : '';
    const editAction = item.isReference
      ? `<button class="theme2-detail-edit" data-edit-source-id="${escapeHtml(item.sourceItemId)}" type="button"><i class="fa-solid fa-arrow-up-right-from-square"></i> 編輯共用主項</button>`
      : '<button id="theme2-detail-edit" class="theme2-detail-edit" type="button"><i class="fa-solid fa-pen-to-square"></i> 編輯內容</button>';
    document.getElementById('theme2-detail-modal-heading').textContent = item.name || '項目詳情';
    const dueState = theme2DueState(item);
    const actionNotice = `<div class="theme2-detail-next-action ${dueState}"><span>美術下一步</span><strong>${escapeHtml(artActionOf(item))}</strong><small>目標：${escapeHtml(item.expectedDate || '未定')}${dueState === 'overdue' ? ' · 已逾期' : dueState === 'due-soon' ? ' · 7 天內到期' : ''}</small></div>`;
    detail.innerHTML = `<div class="theme2-detail-content"><div class="theme2-detail-actions">${editAction}</div>${actionNotice}${description}${thumbnail}${source}${returned}<div class="detail-meta-grid"><div><span>機制</span><strong>${escapeHtml(item.category)}</strong></div><div><span>序號</span><strong>${escapeHtml(item.sequence || '待補')}</strong></div><div><span>目前階段</span><strong>${escapeHtml(item.stageLabel)}</strong></div><div><span>企劃開表日</span><strong>${escapeHtml(item.plannedDate || '待補')}</strong></div><div><span>企劃整合目標日</span><strong>${escapeHtml(item.expectedDate || '未排期')}</strong></div><div><span>美術交付紀錄</span><strong>${escapeHtml(item.artSubmitDate || '待補')}</strong></div><div><span>最終確認日</span><strong>${escapeHtml(item.finalDate || '待確認')}</strong></div></div>${notes}${completeness}<div class="detail-paths">${pathRow('需求／代圖', item.screenshotPath)}${pathRow('美術上傳', item.artUploadPath)}${pathRow('拆圖歸檔', item.archivePath)}${pathRow('正式完成', item.formalPath && item.formalPath !== '1111' ? item.formalPath : '')}</div></div>`;
    detail.querySelector('.theme2-detail-thumbnail img')?.addEventListener('error', event => event.currentTarget.closest('.theme2-detail-thumbnail')?.remove());
    detail.querySelector('#theme2-detail-edit')?.addEventListener('click', () => { detailEditing = true; renderDetail(item); });
    detail.querySelector('[data-edit-source-id]')?.addEventListener('click', () => {
      const sourceItem = items.find(candidate => candidate.itemId === item.sourceItemId && !candidate.isReference);
      if (sourceItem) { detailEditing = true; renderDetail(sourceItem); }
      else window.dashboardShowToast('找不到此引用項目的主項', 'error');
    });
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
    const special = theme2View.querySelector('.theme2-filter-chip.active')?.dataset.theme2Filter || 'all';
    const filtered = items.filter(item => {
      const categoryMatch = category === '全部功能分類' || itemGroup(item) === category;
      const stageMatch = stage === '全部階段' || item.stage === stage;
      const expectedDateMatch = expectedDate === 'all' || expectedDateValue(item) === expectedDate;
      const searchMatch = !query || searchableText(item).includes(query);
      const specialMatch = special === 'all' || (special === 'returned' && item.returned) || (special === 'evidence' && item.missingFields.length > 0);
      const artWorkMatch = progressView === 'pipeline' || matchesArtWorkFilter(item);
      return categoryMatch && expectedDateMatch && stageMatch && searchMatch && specialMatch && artWorkMatch;
    });
    renderArtWorkSummary();
    updateDimensionCounts({ category, expectedDate, stage, query });
    theme2View.querySelector('[data-theme2-count="all"]')?.replaceChildren(document.createTextNode(items.length));
    theme2View.querySelector('[data-theme2-count="returned"]')?.replaceChildren(document.createTextNode(items.filter(item => item.returned).length));
    theme2View.querySelector('[data-theme2-count="evidence"]')?.replaceChildren(document.createTextNode(items.filter(item => item.missingFields.length > 0).length));
    // 流程分布保留各階段數量，僅套用搜尋與機制，不被階段自身過濾。
    const pipelineItems = items.filter(item => {
      const categoryMatch = category === '全部功能分類' || itemGroup(item) === category;
      const expectedDateMatch = expectedDate === 'all' || expectedDateValue(item) === expectedDate;
      const searchMatch = !query || searchableText(item).includes(query);
      const specialMatch = special === 'all' || (special === 'returned' && item.returned) || (special === 'evidence' && item.missingFields.length > 0);
      return categoryMatch && expectedDateMatch && searchMatch && specialMatch;
    });
    renderPipeline(pipelineItems);
    renderMechanismAccordion([...filtered].sort(compareArtWork));
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
      artWorkFilter = 'work';
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

  function applyTheme2Payload(payload, statusText = 'Google Sheet API', statusIcon = 'fa-cloud') {
    theme2ProjectName = payload.projectName || 'SGF 專案';
    rawSheetRows = payload.items.map(row => ({ ...row }));
    rebuildTheme2Items(rawSheetRows);
    finishTheme2Load(statusText, statusIcon);
  }

  function readTheme2Cache() {
    try {
      const cached = JSON.parse(localStorage.getItem(THEME2_CACHE_KEY) || 'null');
      return cached && cached.apiUrl === theme2ApiUrl && Array.isArray(cached.payload?.items) ? cached : null;
    } catch (error) {
      localStorage.removeItem(THEME2_CACHE_KEY);
      return null;
    }
  }

  function writeTheme2Cache(payload) {
    try {
      localStorage.setItem(THEME2_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), apiUrl: theme2ApiUrl, payload }));
    } catch (error) {
      console.warn('Theme 2 cache write failed', error);
    }
  }

  async function fetchTheme2Payload() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), THEME2_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${theme2ApiUrl}?key=${encodeURIComponent(theme2ApiKey)}`, {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Theme 2 API ${response.status}`);
      const payload = await response.json();
      if (payload.error || !Array.isArray(payload.items)) throw new Error(payload.error || 'Theme 2 API 回傳格式不正確');
      return payload;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function loadTheme2Api() {
    let lastError;
    for (let attempt = 1; attempt <= THEME2_MAX_ATTEMPTS; attempt += 1) {
      try {
        if (attempt > 1) setTheme2ApiStatus(`重新連線 ${attempt - 1}/2`, 'fa-rotate', 'loading');
        const payload = await fetchTheme2Payload();
        writeTheme2Cache(payload);
        applyTheme2Payload(payload);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < THEME2_MAX_ATTEMPTS) await new Promise(resolve => setTimeout(resolve, attempt * 900));
      }
    }
    const cached = readTheme2Cache();
    if (cached) {
      const cachedAt = new Date(cached.savedAt).toLocaleString('zh-TW', { hour12: false });
      applyTheme2Payload(cached.payload, `離線資料 ${cachedAt}`, 'fa-clock-rotate-left');
      window.dashboardShowToast('API 暫時無法連線，已顯示上次成功資料', 'error');
      return;
    }
    throw lastError || new Error('Theme 2 API 連線失敗');
  }

  function closeDetailModal() {
    const modal = document.getElementById('theme2-detail-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('body-scroll-lock');
    detailEditing = false;
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
  document.getElementById('theme2-schedule-btn')?.addEventListener('click', () => {
    document.getElementById('theme2-expected-date-chips')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.dashboardShowToast('此頁以「企劃整合目標日」追蹤時程，可直接使用上方日期篩選。', 'info');
  });
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
    localStorage.removeItem(THEME2_CACHE_KEY);
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
