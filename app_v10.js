// NodeList & HTMLCollection 相容性 Polyfill
if (window.NodeList && !NodeList.prototype.forEach) {
  NodeList.prototype.forEach = Array.prototype.forEach;
}
if (window.HTMLCollection && !HTMLCollection.prototype.forEach) {
  HTMLCollection.prototype.forEach = Array.prototype.forEach;
}

// 專案全域狀態管理
let appState = {
  gasUrl: localStorage.getItem('sgf_gas_url') || 'https://script.google.com/macros/s/AKfycbzj2EVoj-PzVjctoE0CzODST_M-5CGiYdQAo4oJTJthfpIO6Dxzcsysv-s1UO4Ywd0j/exec',
  apiKey: localStorage.getItem('sgf_api_key') || 'SGF_SECURE_TOKEN_2026',
  tasks: [],
  milestones: [], // 新增：專案時程里程碑
  weeksList: [],
  activeOwnerFilters: [], // 負責人篩選名單，空陣列代表「全部 (all)」
  activeStatusFilter: 'pending', // 首頁預設顯示狀態：進行中
  activeTimeFilter: 'current',   // 首頁預設時間篩選：當週焦點
  activeSpecialFilter: 'all',    // 預設特殊篩選：無 (不做過濾)
  activeGroupFilter: 'all',      // 新增：只顯示單一分類 (專注模式)
  timelineFilterMode: 'history', // 編輯抽屜時間軸篩選：'history' (歷程) 或 'all' (全部)
  searchQuery: '',
  expandedGroups: new Set()
};

let drawerOriginalState = null;

// DOM 元素選取
const setupModal = document.getElementById('setup-modal');
const gasUrlInput = document.getElementById('gas-url');
const apiKeyInput = document.getElementById('api-key');
const saveConfigBtn = document.getElementById('save-config-btn');
const configBtn = document.getElementById('config-btn');
const refreshBtn = document.getElementById('refresh-btn');
const searchInput = document.getElementById('search-input');
const taskAccordion = document.getElementById('task-accordion');

// 專案時程里程碑相關 DOM
const scheduleBtn = document.getElementById('schedule-btn');
const scheduleModal = document.getElementById('schedule-modal');
const closeScheduleBtn = document.getElementById('close-schedule-btn');
const scheduleListContainer = document.getElementById('schedule-list-container');
const scheduleYearSelect = document.getElementById('schedule-year-select');
const scheduleMonthSelect = document.getElementById('schedule-month-select');
const scheduleWeekSelect = document.getElementById('schedule-week-select');
const ownerChips = document.getElementById('owner-chips');
const statusChips = document.getElementById('status-chips');
const timeChips = document.getElementById('time-chips');
const specialChips = document.getElementById('special-chips');
const filteredCount = document.getElementById('filtered-count');

// Stats DOM
const statTotalTasks = document.getElementById('stat-total-tasks');
const statCompletedTasks = document.getElementById('stat-completed-tasks');
const statPendingTasks = document.getElementById('stat-pending-tasks');
const statOverallProgress = document.getElementById('stat-overall-progress');

// Drawer DOM
const editDrawer = document.getElementById('edit-drawer');
const closeDrawerBtn = document.getElementById('close-drawer-btn');
const editForm = document.getElementById('edit-form');
const editRowNum = document.getElementById('edit-row-num');
const editTaskName = document.getElementById('edit-task-name');
const editTaskId = document.getElementById('edit-task-name-input');
const editOwnerSelect = document.getElementById('edit-owner-select');
const editGroup = document.getElementById('edit-group');
const editProgressVal = document.getElementById('edit-progress-val');
const editDetail = document.getElementById('edit-detail');
const editIsDone = document.getElementById('edit-is-done');
const editTaskLink = document.getElementById('edit-task-link');
const btnOpenTaskLink = document.getElementById('btn-open-task-link');
const btnCancelEdit = document.getElementById('btn-cancel-edit') || document.getElementById('btn-abandon-changes');

// 新建任務項目所屬 DOM 與變量
const addTaskBtn = document.getElementById('add-task-btn');
const drawerTitleText = document.getElementById('drawer-title-text');
const drawerReadonlySection = document.getElementById('drawer-readonly-section');
let isCreateMode = false; // 新建任務模式標記




// 初始化載入
window.addEventListener('DOMContentLoaded', () => {
  setupGlobalScrollLockObserver(); // 初始化全域背景滾動鎖定監聽器
  updateNonsenseQuote(); // 初始化隨機拉出一句廢話體
  if (!appState.gasUrl) {
    showSetupModal();
  } else {
    gasUrlInput.value = appState.gasUrl;
    apiKeyInput.value = appState.apiKey;
    loadData();
  }
  setupEventListeners();
});

// 設定事件監聽器
function setupEventListeners() {
  // 設定 API Button
  configBtn.addEventListener('click', showSetupModal);
  saveConfigBtn.addEventListener('click', saveConfiguration);
  
  // 關閉與取消設定視窗
  const closeModalBtn = document.getElementById('close-modal-btn');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      setupModal.classList.remove('open');
    });
  }
  const cancelConfigBtn = document.getElementById('cancel-config-btn');
  if (cancelConfigBtn) {
    cancelConfigBtn.addEventListener('click', () => {
      setupModal.classList.remove('open');
    });
  }
  
  // 重新整理 (改為自動排序試算表並重新載入)
  refreshBtn.addEventListener('click', runSortAndLoad);
  
  // 取消專注分類
  const clearGroupFilterBtn = document.getElementById('clear-group-filter-btn');
  if (clearGroupFilterBtn) {
    clearGroupFilterBtn.addEventListener('click', () => {
      appState.activeGroupFilter = 'all';
      renderTasks();
    });
  }
  
  // 使用說明 Modal 點擊打開與關閉
  const helpBtnEl = document.getElementById('help-btn');
  const helpModalEl = document.getElementById('help-modal');
  const closeHelpBtnEl = document.getElementById('close-help-btn');
  
  console.log("SGF 偵錯：嘗試載入說明視窗節點：", { helpBtnEl, helpModalEl, closeHelpBtnEl });
  
  if (helpBtnEl && helpModalEl && closeHelpBtnEl) {
    helpBtnEl.addEventListener('click', () => {
      console.log("SGF 偵錯：點擊了使用說明按鈕");
      helpModalEl.classList.add('open');
    });
    closeHelpBtnEl.addEventListener('click', () => {
      helpModalEl.classList.remove('open');
    });
    helpModalEl.addEventListener('click', (e) => {
      if (e.target === helpModalEl) {
        helpModalEl.classList.remove('open');
      }
    });
  } else {
    console.warn("SGF 偵錯警告：找不到說明視窗相關的 DOM 節點！");
  }

  // 時程里程碑 Modal 點擊打開與關閉
  if (scheduleBtn && scheduleModal && closeScheduleBtn) {
    scheduleBtn.addEventListener('click', () => {
      // 1. 初始化週別選單並預設選中當週
      initScheduleWeekSelectOptions();
      
      // 2. 預設切換至當前年月
      const today = new Date();
      const curYear = today.getFullYear();
      const curMonth = ("0" + (today.getMonth() + 1)).slice(-2);
      
      if (scheduleYearSelect) scheduleYearSelect.value = curYear.toString();
      if (scheduleMonthSelect) scheduleMonthSelect.value = curMonth;
      
      // 3. 渲染 (自動抓取當前 Select 值，預設會是當週)
      renderMilestones();
      
      scheduleModal.classList.add('open');
    });
    
    closeScheduleBtn.addEventListener('click', () => {
      scheduleModal.classList.remove('open');
    });
    
    scheduleModal.addEventListener('click', (e) => {
      if (e.target === scheduleModal) {
        scheduleModal.classList.remove('open');
      }
    });
    
    // 監聽年月下拉變更：自動重置週別為「整月」，並即時渲染
    if (scheduleYearSelect) {
      scheduleYearSelect.addEventListener('change', () => {
        if (scheduleWeekSelect) scheduleWeekSelect.value = 'all';
        renderMilestones();
      });
    }
    if (scheduleMonthSelect) {
      scheduleMonthSelect.addEventListener('change', () => {
        if (scheduleWeekSelect) scheduleWeekSelect.value = 'all';
        renderMilestones();
      });
    }
    // 監聽週下拉變更：即時渲染
    if (scheduleWeekSelect) {
      scheduleWeekSelect.addEventListener('change', () => {
        renderMilestones();
      });
    }

    // 監聽上一週 / 下一週按鈕切換週別
    const schedulePrevWeekBtn = document.getElementById('schedule-prev-week-btn');
    const scheduleNextWeekBtn = document.getElementById('schedule-next-week-btn');
    if (schedulePrevWeekBtn) {
      schedulePrevWeekBtn.addEventListener('click', () => {
        if (scheduleWeekSelect && scheduleWeekSelect.selectedIndex > 0) {
          scheduleWeekSelect.selectedIndex -= 1;
          scheduleWeekSelect.dispatchEvent(new Event('change'));
        }
      });
    }
    if (scheduleNextWeekBtn) {
      scheduleNextWeekBtn.addEventListener('click', () => {
        if (scheduleWeekSelect && scheduleWeekSelect.selectedIndex < scheduleWeekSelect.options.length - 1) {
          scheduleWeekSelect.selectedIndex += 1;
          scheduleWeekSelect.dispatchEvent(new Event('change'));
        }
      });
    }
  }
  
  // 搜尋過濾
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      appState.searchQuery = e.target.value.toLowerCase().trim();
      renderTasks();
    });
  }

  // 新建任務項目按鈕點擊事件
  if (addTaskBtn) {
    addTaskBtn.addEventListener('click', () => {
      isCreateMode = true;
      
      // 1. 修改抽屜 UI 至新建狀態
      if (drawerTitleText) {
        drawerTitleText.innerHTML = '<i class="fa-solid fa-circle-plus"></i> 新建專案項目';
      }
      if (drawerReadonlySection) {
        drawerReadonlySection.style.display = 'none';
      }
      if (editIsDone) {
        editIsDone.style.display = 'none';
        if (editIsDone.parentElement) {
          editIsDone.parentElement.style.gap = '0';
        }
      }
      if (editTaskName) {
        editTaskName.value = '';
        editTaskName.placeholder = '請輸入新建專案項目名稱...';
      }
      
      // 2. 清空與初始化可編輯欄位
      if (editRowNum) editRowNum.value = '';
      if (editTaskId) editTaskId.value = '';
      if (editTaskLink) editTaskLink.value = '';
      if (editDetail) editDetail.value = '';
      
      // 對齊 Google Sheet 下拉選單的負責人清單
      const ownersList = ["", "上0", "小麥", "Rogin", "小夏", "芳如", "姵瑾", "neko", "AruV", "龍強", "企劃"];
      if (editOwnerSelect) {
        editOwnerSelect.innerHTML = ownersList.map(o => {
          const label = o === "" ? "-" : o;
          return `<option value="${o}">${label}</option>`;
        }).join('');
        editOwnerSelect.selectedIndex = 0;
      }

      // 初始化協辦人核取方塊 (新建任務時)
      const coOwnersContainer = document.getElementById('edit-co-owners-container');
      if (coOwnersContainer) {
        const members = ownersList.filter(o => o !== "" && o !== "企劃");
        coOwnersContainer.innerHTML = members.map(m => {
          return `
            <label class="drawer-checkbox-item">
              <input type="checkbox" value="${m}" class="co-owner-checkbox">
              <span>${m}</span>
            </label>
          `;
        }).join('');
      }

      // 重設摺疊狀態為收合
      const coOwnersWrapper = document.getElementById('edit-co-owners-wrapper');
      const coOwnersToggleBtn = document.getElementById('co-owners-toggle-btn');
      if (coOwnersWrapper && coOwnersToggleBtn) {
        coOwnersWrapper.style.display = 'none';
        const arrow = coOwnersToggleBtn.querySelector('.toggle-arrow');
        if (arrow) arrow.textContent = '►';
      }
      toggleCoOwnersSection();
      resetDrawerTabs();
      renderTimeline();
      
      // 4. 記錄開啟時的原始狀態 (用於髒數據防呆比對)
      drawerOriginalState = {
        taskName: '',
        taskId: '',
        owner: '',
        coOwners: '[]',
        detail: '',
        taskLink: '',
        isDone: false,
        weeks: '{}'
      };
      
      // 5. 打開抽屜
      if (editDrawer) {
        editDrawer.classList.add('open');
      }
    });
  }

  // 全部展開
  const expandAllBtn = document.getElementById('expand-all-btn');
  if (expandAllBtn) {
    expandAllBtn.addEventListener('click', () => {
      const uniqueGroups = [...new Set(appState.tasks.map(t => t.group))];
      uniqueGroups.forEach(groupName => appState.expandedGroups.add(groupName));
      renderTasks();
    });
  }

  // 全部折疊
  const collapseAllBtn = document.getElementById('collapse-all-btn');
  if (collapseAllBtn) {
    collapseAllBtn.addEventListener('click', () => {
      appState.expandedGroups.clear();
      renderTasks();
    });
  }

  // 抽屜關閉
  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener('click', () => attemptCloseDrawer(false));
  }

  // 儲存編輯表單
  if (editForm) {
    editForm.addEventListener('submit', handleFormSubmit);
  }

  // 任務狀態篩選切換
  if (statusChips) {
    statusChips.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        if (e.target.classList.contains('disabled')) return; 
        statusChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        appState.activeStatusFilter = e.target.getAttribute('data-status');
        renderTasks();
      });
    });
  }

  // 任務時間區間篩選切換
  if (timeChips) {
    timeChips.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        if (e.target.classList.contains('disabled')) return; 
        timeChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        appState.activeTimeFilter = e.target.getAttribute('data-time');
        renderTasks();
      });
    });
  }

  // 特殊條件篩選切換
  if (specialChips) {
    specialChips.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        if (e.target.classList.contains('disabled')) return; 
        
        specialChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        appState.activeSpecialFilter = e.target.getAttribute('data-special');

        // 連動時間區間篩選器
        const nonAllTimeChips = timeChips ? timeChips.querySelectorAll('.chip:not([data-time="all"])') : [];
        const allTimeChip = timeChips ? timeChips.querySelector('.chip[data-time="all"]') : null;

        // 連動任務狀態篩選器
        const nonAllStatusChips = statusChips ? statusChips.querySelectorAll('.chip:not([data-status="all"])') : [];
        const allStatusChip = statusChips ? statusChips.querySelector('.chip[data-status="all"]') : null;

        const isForceAllFilter = (appState.activeSpecialFilter === 'priority' || appState.activeSpecialFilter === 'andy');

        if (isForceAllFilter) {
          // A. 強制時間篩選切換為「全部週別」
          appState.activeTimeFilter = 'all';
          if (timeChips) {
            timeChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
          }
          if (allTimeChip) allTimeChip.classList.add('active');
          nonAllTimeChips.forEach(c => c.classList.add('disabled'));

          // B. 強制狀態篩選切換為「全部」
          appState.activeStatusFilter = 'all';
          if (statusChips) {
            statusChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
          }
          if (allStatusChip) allStatusChip.classList.add('active');
          nonAllStatusChips.forEach(c => c.classList.add('disabled'));
        } else {
          // 解鎖所有的時間與狀態晶片
          nonAllTimeChips.forEach(c => c.classList.remove('disabled'));
          nonAllStatusChips.forEach(c => c.classList.remove('disabled'));

          // 僅當切換回「無特殊篩選 (all)」時，才強制恢復預設的「當週焦點」和「進行中」
          if (appState.activeSpecialFilter === 'all') {
            appState.activeTimeFilter = 'current';
            if (timeChips) {
              timeChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
              const currentChip = timeChips.querySelector('.chip[data-time="current"]');
              if (currentChip) currentChip.classList.add('active');
            }

            appState.activeStatusFilter = 'pending';
            if (statusChips) {
              statusChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
              const pendingChip = statusChips.querySelector('.chip[data-status="pending"]');
              if (pendingChip) pendingChip.classList.add('active');
            }
          }
        }

        renderTasks();
      });
    });
  }

  // 點擊半透明暗化背景 (editDrawer 本身) 時，安全觸發關閉與髒數據檢測
  editDrawer.addEventListener('click', (e) => {
    if (e.target === editDrawer) {
      attemptCloseDrawer(false);
    }
  });

  // 監聽專案連結輸入框的變更，動態切換前往按鈕狀態
  editTaskLink.addEventListener('input', (e) => {
    if (e.target.value.trim() !== "") {
      btnOpenTaskLink.classList.remove('disabled');
    } else {
      btnOpenTaskLink.classList.add('disabled');
    }
  });



  // 前往專案連結按鈕
  btnOpenTaskLink.addEventListener('click', () => {
    if (btnOpenTaskLink.classList.contains('disabled')) return;
    const url = editTaskLink.value.trim();
    if (url) {
      // 防呆：若網址無 http 協定首碼，自動補齊
      const targetUrl = url.match(/^https?:\/\//i) ? url : `https://${url}`;
      window.open(targetUrl, '_blank');
    }
  });

  // 放棄修改按鈕點擊 (主動宣告放棄，直接強制關閉不詢問)
  if (btnCancelEdit) {
    btnCancelEdit.addEventListener('click', () => {
      attemptCloseDrawer(true);
    });
  }

  // 當主辦人下拉選單變動時，連動禁用/啟用協辦人核取方塊與隱藏邏輯
  if (editOwnerSelect) {
    editOwnerSelect.addEventListener('change', () => {
      toggleCoOwnersSection();
      const selectedOwner = editOwnerSelect.value;
      const coOwnersContainer = document.getElementById('edit-co-owners-container');
      if (coOwnersContainer) {
        const checkboxes = coOwnersContainer.querySelectorAll('.co-owner-checkbox');
        checkboxes.forEach(cb => {
          const labelEl = cb.closest('.drawer-checkbox-item');
          if (!labelEl) return;
          const textSpan = labelEl.querySelector('span');
          const memberName = cb.value;
          
          if (memberName === selectedOwner) {
            cb.checked = false;
            cb.disabled = true;
            labelEl.classList.add('disabled');
            if (textSpan) textSpan.textContent = `${memberName} (已負責)`;
          } else {
            cb.disabled = false;
            labelEl.classList.remove('disabled');
            if (textSpan) textSpan.textContent = memberName;
          }
        });
      }
    });
  }

  // 支援區塊摺疊展開邏輯
  const coOwnersToggleBtn = document.getElementById('co-owners-toggle-btn');
  const coOwnersWrapper = document.getElementById('edit-co-owners-wrapper');
  if (coOwnersToggleBtn && coOwnersWrapper) {
    coOwnersToggleBtn.addEventListener('click', () => {
      const isHidden = coOwnersWrapper.style.display === 'none';
      coOwnersWrapper.style.display = isHidden ? 'block' : 'none';
      const arrow = coOwnersToggleBtn.querySelector('.toggle-arrow');
      if (arrow) {
        arrow.textContent = isHidden ? '▼' : '►';
      }
    });
  }



  // 編輯抽屜左側時間軸內部篩選按鈕邏輯
  const btnFilterHistory = document.getElementById('btn-timeline-filter-history');
  const btnFilterAll = document.getElementById('btn-timeline-filter-all');
  if (btnFilterHistory && btnFilterAll) {
    btnFilterHistory.addEventListener('click', () => {
      appState.timelineFilterMode = 'history';
      btnFilterHistory.classList.add('active');
      btnFilterAll.classList.remove('active');
      applyTimelineFilter();
    });
    btnFilterAll.addEventListener('click', () => {
      appState.timelineFilterMode = 'all';
      btnFilterAll.classList.add('active');
      btnFilterHistory.classList.remove('active');
      applyTimelineFilter();
    });
  }
}

// 根據負責人是否選了「企劃」來切換顯示/隱藏支援區塊
function toggleCoOwnersSection() {
  const selectedOwner = editOwnerSelect ? editOwnerSelect.value : '';
  const coOwnersSection = document.getElementById('edit-co-owners-section');
  if (coOwnersSection) {
    if (selectedOwner === '企劃') {
      coOwnersSection.style.display = 'none';
    } else {
      coOwnersSection.style.display = 'block';
    }
  }
}

// 重設編輯抽屜時間軸篩選器至預設的「歷程」篩選
function resetDrawerTabs() {
  // 重置時間軸篩選器狀態為預設「歷程」
  appState.timelineFilterMode = 'history';
  const btnFilterHistory = document.getElementById('btn-timeline-filter-history');
  const btnFilterAll = document.getElementById('btn-timeline-filter-all');
  if (btnFilterHistory && btnFilterAll) {
    btnFilterHistory.classList.add('active');
    btnFilterAll.classList.remove('active');
  }
}

// 根據目前篩選條件（歷程 / 全部）顯示或隱藏時間軸卡片
function applyTimelineFilter() {
  const container = document.getElementById('drawer-timeline-container');
  if (!container) return;

  const timeWeeks = getTimelineWeeks();
  const lastWeekLabel = timeWeeks.last ? timeWeeks.last.label : null;
  const currentWeekLabel = timeWeeks.current ? timeWeeks.current.label : null;
  const nextWeekLabel = timeWeeks.next ? timeWeeks.next.label : null;
  const showAll = (appState.timelineFilterMode === 'all');

  container.querySelectorAll('.drawer-timeline-item').forEach(item => {
    const weekLabel = item.getAttribute('data-week-card');
    const textarea = item.querySelector('.timeline-textarea');
    const val = textarea ? textarea.value.trim() : '';
    const hasText = val !== '';
    
    // 判斷是否為核心三週（上週、當週、下週）之一
    const isCoreWeek = (weekLabel === lastWeekLabel || weekLabel === currentWeekLabel || weekLabel === nextWeekLabel);

    if (showAll || hasText || isCoreWeek) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

// 渲染左側全年歷史時間軸進度
function renderTimeline(taskObj = null) {
  const container = document.getElementById('drawer-timeline-container');
  if (!container) return;

  const timeWeeks = getTimelineWeeks();
  const lastWeekLabel = timeWeeks.last ? timeWeeks.last.label : null;
  const currentWeekLabel = timeWeeks.current ? timeWeeks.current.label : null;
  const nextWeekLabel = timeWeeks.next ? timeWeeks.next.label : null;

  container.innerHTML = appState.weeksList.map(week => {
    const isCurrent = (week.label === currentWeekLabel);
    const isLast = (week.label === lastWeekLabel);
    const isNext = (week.label === nextWeekLabel);

    let itemClass = 'drawer-timeline-item';
    let badgeHtml = '';

    if (isCurrent) {
      itemClass = 'drawer-timeline-item current-week';
      badgeHtml = '<span class="timeline-badge">當週焦點</span>';
    } else if (isLast) {
      badgeHtml = '<span class="timeline-badge" style="background-color: var(--text-muted);">上週進度</span>';
    } else if (isNext) {
      badgeHtml = '<span class="timeline-badge" style="background-color: var(--text-secondary);">下週預期</span>';
    }

    const val = (taskObj && taskObj.weeks) ? (taskObj.weeks[week.label] || '') : '';
    
    return `
      <div class="${itemClass}" data-week-card="${week.label}">
        <div class="timeline-header">
          <span>${week.label} (${week.date})</span>
          ${badgeHtml}
        </div>
        <textarea class="timeline-textarea" data-week="${week.label}" placeholder="輸入進度狀態...">${val}</textarea>
      </div>
    `;
  }).join('');
  
  // 渲染完畢後，立即套用當前的時間軸篩選條件（預設歷程，強制包含當週）
  applyTimelineFilter();
}

// 顯示設定視窗 (預填已存參數)
function showSetupModal() {
  gasUrlInput.value = appState.gasUrl;
  apiKeyInput.value = appState.apiKey;
  setupModal.classList.add('open');
}

// 儲存 API 設定
function saveConfiguration() {
  const url = gasUrlInput.value.trim();
  const key = apiKeyInput.value.trim();

  if (!url) {
    showToast('請填入 Google Apps Script 網頁應用程式 URL', 'error');
    return;
  }

  appState.gasUrl = url;
  appState.apiKey = key;
  localStorage.setItem('sgf_gas_url', url);
  localStorage.setItem('sgf_api_key', key);
  
  setupModal.classList.remove('open');
  showToast('設定已儲存，正在連線載入資料...', 'success');
  loadData();
}

// 從 API 載入資料
// 從 API 載入資料 (支援 background 背景靜態同步，避免畫面卡住)
async function loadData(isBackground = false) {
  if (!appState.gasUrl) return;

  const sortIcon = refreshBtn ? refreshBtn.querySelector('i') : null;
  const originalIconClass = sortIcon ? sortIcon.className : 'fa-solid fa-arrow-down-short-wide';

  if (!isBackground) {
    taskAccordion.innerHTML = `
      <div class="loading-state">
        <i class="fa-solid fa-circle-notch fa-spin"></i> 正在安全讀取 Google Sheet 進度...
      </div>
    `;
  } else {
    if (sortIcon) {
      sortIcon.className = 'fa-solid fa-circle-notch fa-spin';
    }
  }

  try {
    const fetchUrl = `${appState.gasUrl}?key=${encodeURIComponent(appState.apiKey)}`;
    const response = await fetch(fetchUrl);
    const result = await response.json();

    if (result.error) {
      showToast(`載入失敗: ${result.error}`, 'error');
      showSetupModal();
      return;
    }

    appState.tasks = result.tasks;
    appState.milestones = result.milestones || []; // 保存專案時程里程碑
    appState.weeksList = result.weeksList; // 這裡將會是 [{label: 'W27', date: '...'}, ...]
    
    // 初始化展開所有群組
    const uniqueGroups = [...new Set(appState.tasks.map(t => t.group))];
    uniqueGroups.forEach(g => appState.expandedGroups.add(g));

    showToast('資料已成功同步！', 'success');
    
    // 渲染統計與元件
    updateNewspaperMeta();
    renderStats();
    renderOwnerChips();
    renderTasks();
    updateNonsenseQuote(); // 重新整理或同步成功時也隨機刷一句

  } catch (err) {
    console.error(err);
    showToast('連線失敗，請檢查 API 網址或網路狀態。', 'error');
    showSetupModal();
  } finally {
    if (sortIcon) {
      sortIcon.className = originalIconClass;
    }
  }
}

// 自動執行試算表排序並重新載入資料
async function runSortAndLoad() {
  if (!appState.gasUrl) return;
  
  const sortIcon = refreshBtn.querySelector('i');
  const originalIconClass = sortIcon ? sortIcon.className : 'fa-solid fa-arrow-down-short-wide';
  
  if (sortIcon) {
    sortIcon.className = 'fa-solid fa-circle-notch fa-spin';
  }
  refreshBtn.disabled = true;

  showToast('正在向 Google Sheet 請求執行自動排序 (manualSortTasks)...', 'info');

  try {
    const postUrl = `${appState.gasUrl}?key=${encodeURIComponent(appState.apiKey)}`;
    const payload = {
      action: "sortTasks"
    };

    const response = await fetch(postUrl, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.success) {
      showToast('試算表已成功完成自動排序！正在重新載入最新資料...', 'success');
      await loadData();
    } else {
      showToast(`排序失敗: ${result.error || '未知錯誤'}`, 'error');
    }
  } catch (err) {
    console.error('Sort Error:', err);
    showToast('連線失敗，無法執行試算表排序。', 'error');
  } finally {
    if (sortIcon) {
      sortIcon.className = originalIconClass;
    }
    refreshBtn.disabled = false;
  }
}

// 渲染頂部統計卡片
function renderStats() {
  const total = appState.tasks.length;
  if (total === 0) return;

  const completed = appState.tasks.filter(t => t.isDone).length;
  const pending = total - completed;
  
  // 計算加權/平均總進度
  const totalProgressSum = appState.tasks.reduce((sum, task) => sum + (task.progress || 0), 0);
  const overallAvg = Math.round(totalProgressSum / total);

  statTotalTasks.textContent = total;
  statCompletedTasks.textContent = completed;
  statPendingTasks.textContent = pending;
  statOverallProgress.textContent = `${overallAvg}%`;
}

// 渲染負責人篩選標籤 (支援複選)
function renderOwnerChips() {
  const allNames = [];
  appState.tasks.forEach(t => {
    if (t.owner && t.owner !== '未分配' && t.owner !== '-') allNames.push(t.owner);
    if (t.coOwners) {
      t.coOwners.forEach(co => {
        if (co && co !== '未分配' && co !== '-') allNames.push(co);
      });
    }
  });
  
  const owners = ['all', 'unassigned', ...new Set(allNames)];
  
  ownerChips.innerHTML = owners.map(owner => {
    const label = owner === 'all' ? '全部' : (owner === 'unassigned' ? '未分派' : owner);
    let isActive = false;
    if (owner === 'all') {
      isActive = appState.activeOwnerFilters.length === 0;
    } else {
      isActive = appState.activeOwnerFilters.includes(owner);
    }
    const activeClass = isActive ? 'active' : '';
      
    return `<button class="chip ${activeClass}" data-owner="${owner}">${label}</button>`;
  }).join('');

  // 綁定點擊事件
  ownerChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const targetChip = e.target.closest('.chip');
      if (!targetChip) return;
      
      const owner = targetChip.getAttribute('data-owner');
      if (owner === 'all') {
        appState.activeOwnerFilters = [];
      } else if (owner === 'unassigned') {
        appState.activeOwnerFilters = ['unassigned'];
      } else if (owner === '企劃') {
        appState.activeOwnerFilters = ['企劃'];
      } else {
        appState.activeOwnerFilters = appState.activeOwnerFilters.filter(o => o !== 'unassigned' && o !== '企劃');
        if (appState.activeOwnerFilters.includes(owner)) {
          appState.activeOwnerFilters = appState.activeOwnerFilters.filter(o => o !== owner);
        } else {
          appState.activeOwnerFilters.push(owner);
        }
      }
      renderOwnerChips();
      renderTasks();
    });
  });
}

// 渲染任務清單（依群組展開）
function renderTasks() {
  if (appState.tasks.length === 0) {
    taskAccordion.innerHTML = '<div class="loading-state">目前無資料</div>';
    return;
  }

  // 取得時間週別資訊以便進行時間過濾
  const timeWeeks = getTimelineWeeks();
  const currentWeekLabel = timeWeeks.current ? timeWeeks.current.label : null;
  const lastWeekLabel = timeWeeks.last ? timeWeeks.last.label : null;
  const nextWeekLabel = timeWeeks.next ? timeWeeks.next.label : null;

  // 1. 複合過濾任務 (負責人 + 搜尋關鍵字 + 任務狀態 + 時間區間)
  console.log("【除錯】包含 '!' 或群組有 'Andy' 的任務：", appState.tasks.filter(t => t.taskName.includes('!') || t.taskName.includes('Andy') || t.group.includes('Andy')));
  
  const filteredTasks = appState.tasks.filter(task => {
    let matchesOwner = false;
    if (appState.activeOwnerFilters.length === 0) {
      matchesOwner = true;
    } else {
      const hasUnassignedFilter = appState.activeOwnerFilters.includes('unassigned');
      if (hasUnassignedFilter) {
        matchesOwner = !task.owner || task.owner === '未分配' || task.owner === '-' || task.owner.trim() === '';
      } else {
        const taskPeople = [task.owner, ...(task.coOwners || [])];
        matchesOwner = appState.activeOwnerFilters.every(filterName => taskPeople.includes(filterName));
      }
    }
    
    const matchesSearch = task.taskName.toLowerCase().includes(appState.searchQuery) || 
                          task.detail.toLowerCase().includes(appState.searchQuery);
                          
    // 4. 特殊條件過濾
    const isAndyFilter = appState.activeSpecialFilter === 'andy';
    const isPriorityFilter = appState.activeSpecialFilter === 'priority';
    const isDashFilter = appState.activeSpecialFilter === 'dash';
    const isSpecialActive = isAndyFilter || isPriorityFilter; // dash 不需要繞過時間/狀態限制
    
    // 狀態過濾 (當特殊篩選 Andy 時，不限制狀態，全顯)
    const isTaskCompleted = task.isDone;
    let matchesStatus = true;
    if (!isAndyFilter) {
      if (appState.activeStatusFilter === 'pending') {
        matchesStatus = !isTaskCompleted;
      } else if (appState.activeStatusFilter === 'completed') {
        matchesStatus = isTaskCompleted;
      }
    }

    // 時間週別過濾 (當有啟用限制繞過之「特殊篩選」時，自動繞過時間區間限制，顯示全域符合項目)
    let matchesTime = true;
    if (!isSpecialActive) {
      if (appState.activeTimeFilter === 'current' && currentWeekLabel) {
        matchesTime = task.weeks[currentWeekLabel] && task.weeks[currentWeekLabel].toString().trim() !== "";
      } else if (appState.activeTimeFilter === 'last' && lastWeekLabel) {
        matchesTime = task.weeks[lastWeekLabel] && task.weeks[lastWeekLabel].toString().trim() !== "";
      } else if (appState.activeTimeFilter === 'next' && nextWeekLabel) {
        matchesTime = task.weeks[nextWeekLabel] && task.weeks[nextWeekLabel].toString().trim() !== "";
      }
    }

    let matchesSpecial = true;
    if (isPriorityFilter) {
      matchesSpecial = task.taskName.trim().startsWith('>');
    } else if (isAndyFilter) {
      // 匹配 ID (B 欄) 為 !!，或項目所屬的分組 (group) 包含 !! 或 包含 "等Andy確認"
      const idMatch = task.taskId && task.taskId.trim() === '!!';
      const groupMatch = task.group.includes('!!') || task.group.includes('等Andy確認');
      matchesSpecial = idMatch || groupMatch;
    } else if (isDashFilter) {
      // 動態抓取當前時間篩選下，該任務所顯示的進度內容（排除週別標籤前綴）
      let currentProgressText = '';
      if (appState.activeTimeFilter === 'current' && currentWeekLabel) {
        currentProgressText = task.weeks[currentWeekLabel] || '';
      } else if (appState.activeTimeFilter === 'last' && lastWeekLabel) {
        currentProgressText = task.weeks[lastWeekLabel] || '';
      } else if (appState.activeTimeFilter === 'next' && nextWeekLabel) {
        currentProgressText = task.weeks[nextWeekLabel] || '';
      } else {
        // 全部週別時，尋找有填資料的最後一週的純值
        const nonEmptyWeeks = Object.entries(task.weeks).filter(([_, val]) => val !== '');
        if (nonEmptyWeeks.length > 0) {
          const [_, lastVal] = nonEmptyWeeks[nonEmptyWeeks.length - 1];
          currentProgressText = lastVal || '';
        }
      }

      // 判斷該進度內容是否任一行以「-」開頭 (採高相容性 charAt 判斷)
      const lines = currentProgressText.split('\n');
      matchesSpecial = lines.some(line => {
        const trimmed = line.trim();
        return trimmed.charAt(0) === '-';
      });
    }

    const matchesGroup = appState.activeGroupFilter === 'all' || task.group === appState.activeGroupFilter;

    return matchesOwner && matchesSearch && matchesStatus && matchesTime && matchesSpecial && matchesGroup;
  });

  filteredCount.textContent = `共 ${filteredTasks.length} 項`;

  // 2. 依照 group 分組
  const groupsMap = {};
  filteredTasks.forEach(task => {
    if (!groupsMap[task.group]) {
      groupsMap[task.group] = [];
    }
    groupsMap[task.group].push(task);
  });

  // 如果沒有符合結果
  if (Object.keys(groupsMap).length === 0) {
    taskAccordion.innerHTML = '<div class="loading-state"><i class="fa-solid fa-face-frown"></i> 沒有符合篩選條件的任務</div>';
    return;
  }

  // 3. 生成 HTML
  let html = '';
  for (const groupName in groupsMap) {
    const tasksInGroup = groupsMap[groupName];
    const isExpanded = appState.expandedGroups.has(groupName);
    const expandedClass = isExpanded ? 'expanded' : '';
    
    // 計算該群組的平均進度
    const groupProgressSum = tasksInGroup.reduce((sum, t) => sum + (t.progress || 0), 0);
    const groupAvg = Math.round(groupProgressSum / tasksInGroup.length);

    html += `
      <div class="accordion-group ${expandedClass}" data-group="${groupName}">
        <div class="accordion-header">
          <div class="accordion-title-wrapper">
            <i class="fa-solid fa-chevron-right accordion-chevron"></i>
            <span class="group-name">${groupName}</span>
            <span class="task-count-badge">
              ${tasksInGroup.length} 項任務
            </span>
            ${appState.activeGroupFilter === 'all' ? `
              <span class="btn-focus-group" data-group="${groupName.replace(/"/g, '&quot;')}" title="只專注看此分類">
                <i class="fa-solid fa-eye"></i> 專注
              </span>
            ` : ''}
          </div>
          <div class="group-progress-cell">
            <div class="progress-bar-container group-progress-bar">
              <div class="progress-bar-fill" style="width: ${groupAvg}%"></div>
            </div>
            <span class="group-progress-percent">${groupAvg}%</span>
          </div>
        </div>
        <div class="accordion-body">
    `;
 
     groupsMap[groupName].forEach(task => {
       // 動態抓取對應週別的進度內容 (與當前時間過濾連動)
       let currentProgressText = '';
       
       if (appState.activeTimeFilter === 'current' && currentWeekLabel) {
         currentProgressText = task.weeks[currentWeekLabel] || '';
       } else if (appState.activeTimeFilter === 'last' && lastWeekLabel) {
         currentProgressText = task.weeks[lastWeekLabel] || '';
       } else if (appState.activeTimeFilter === 'next' && nextWeekLabel) {
         currentProgressText = task.weeks[nextWeekLabel] || '';
       } else {
         // 全部週別時，尋找有填資料的最後一週
         const nonEmptyWeeks = Object.entries(task.weeks).filter(([_, val]) => val !== '');
         if (nonEmptyWeeks.length > 0) {
           const [lastWeek, lastVal] = nonEmptyWeeks[nonEmptyWeeks.length - 1];
           currentProgressText = `${lastWeek}: ${lastVal}`;
         }
       }
 
       const checkedAttr = task.isDone ? 'checked' : '';
       const doneClass = task.isDone ? 'task-done' : '';
       
       // 檢測是否為高優先項目 (開頭為 >) 或 等 Andy 確認項目 (為 !!)
       const isPriority = task.taskName.trim().startsWith('>');
       const isAndy = task.taskName.trim() === '!!';
       
       let displayName = task.taskName;
       let priorityClass = '';
       let priorityBadge = '';
       
       if (isPriority) {
         displayName = task.taskName.replace(/^>\s*/, ''); // 去除 > 與隨後的空格
         priorityClass = 'task-priority-high';
         priorityBadge = '<span class="badge-priority">優先</span>';
       } else if (isAndy) {
         displayName = '等 Andy 確認';
         priorityClass = 'task-priority-andy';
         priorityBadge = '<span class="badge-andy">待確認</span>';
       }
        const linkIcon = task.taskLink ? ` <a href="${task.taskLink}" target="_blank" class="task-link-icon" title="查看專案超連結" onclick="event.stopPropagation();"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : '';

        html += `
          <div class="task-item ${doneClass} ${priorityClass}" data-row="${task.rowNumber}">
            <div class="checkbox-cell">
              <input type="checkbox" ${checkedAttr} disabled class="task-checkbox" data-row="${task.rowNumber}">
            </div>
            <div class="task-name-cell">${priorityBadge}${displayName}${linkIcon}</div>
            <div class="owner-cell" title="支援">
              ${(function() {
                if (task.coOwners && task.coOwners.length > 0) {
                  const tooltipText = `支援: ${task.coOwners.join(', ')}`;
                  return `<span class="byline-tag owner-tooltip" data-tooltip="${tooltipText}">■ ${task.owner} <i class="fa-solid fa-user-group team-icon"></i></span>`;
                } else {
                  return `<span class="byline-tag">■ ${task.owner}</span>`;
                }
              })()}
            </div>
           <div class="detail-cell" title="${currentProgressText}">${currentProgressText || '<span style="color: var(--text-muted);">無進度狀態</span>'}</div>
           <div class="task-progress-only-cell">
             <span class="task-progress-percent-only">${task.progress}%</span>
           </div>
           <div class="actions-cell">
             <button class="btn-icon btn-edit" data-row="${task.rowNumber}" title="修改此項目">
               <i class="fa-solid fa-pen"></i>
             </button>
           </div>
         </div>
       `;
    });

    html += `
        </div>
      </div>
    `;
  }

  taskAccordion.innerHTML = html;

  // 顯示或隱藏分類專注提示欄
  const groupFilterIndicator = document.getElementById('group-filter-indicator');
  const focusedGroupName = document.getElementById('focused-group-name');
  if (groupFilterIndicator && focusedGroupName) {
    if (appState.activeGroupFilter !== 'all') {
      focusedGroupName.textContent = appState.activeGroupFilter;
      groupFilterIndicator.style.display = 'flex';
    } else {
      groupFilterIndicator.style.display = 'none';
    }
  }

  // 綁定 [專注] 按鈕事件
  taskAccordion.querySelectorAll('.btn-focus-group').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止事件冒泡，防止手風琴收折
      const targetGroup = btn.getAttribute('data-group');
      appState.activeGroupFilter = targetGroup;
      
      // 自動展開被鎖定的分類，以利閱讀
      appState.expandedGroups.add(targetGroup);
      
      renderTasks();
    });
  });

  // 綁定手風琴展開收合
  taskAccordion.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', (e) => {
      // 避免點擊標頭內的進度條也觸發
      if (e.target.closest('.progress-bar-container')) return;
      
      const groupDiv = header.closest('.accordion-group');
      const groupName = groupDiv.getAttribute('data-group');
      
      if (groupDiv.classList.contains('expanded')) {
        groupDiv.classList.remove('expanded');
        appState.expandedGroups.delete(groupName);
      } else {
        groupDiv.classList.add('expanded');
        appState.expandedGroups.add(groupName);
      }
    });
  });

  // 綁定編輯按鈕開啟抽屜
  taskAccordion.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const rowNum = btn.getAttribute('data-row');
      openDrawer(rowNum);
    });
  });
}

// 更新本地資料狀態
function updateLocalTask(rowNum, updates) {
  const task = appState.tasks.find(t => t.rowNumber == rowNum);
  if (task) {
    Object.assign(task, updates);
  }
}

// 根據今天日期判定上週、當週、下週
function getTimelineWeeks() {
  const today = new Date();
  const currentYear = today.getFullYear(); // 2026
  
  let currentIndex = -1;

  for (let i = 0; i < appState.weeksList.length; i++) {
    const week = appState.weeksList[i];
    if (!week.date) continue;

    // 解析 "06/29 - 07/05"
    const parts = week.date.split('-');
    if (parts.length !== 2) continue;

    try {
      const [startStr, endStr] = parts.map(p => p.trim());
      const [startMonth, startDay] = startStr.split('/').map(Number);
      const [endMonth, endDay] = endStr.split('/').map(Number);

      // 建立該週的開始與結束日期物件
      const startDate = new Date(currentYear, startMonth - 1, startDay, 0, 0, 0);
      const endDate = new Date(currentYear, endMonth - 1, endDay, 23, 59, 59);

      // 如果跨年度 (例如 12/28 - 01/03)
      if (endMonth < startMonth) {
        endDate.setFullYear(currentYear + 1);
      }

      if (today >= startDate && today <= endDate) {
        currentIndex = i;
        break;
      }
    } catch (e) {
      console.error('Error parsing date:', week.date, e);
    }
  }

  // 備用防呆：如果今天日期不落在任何週區間內，預設以最後一週為當週，或者第一週
  if (currentIndex === -1 && appState.weeksList.length > 0) {
    currentIndex = 0; // 預設第一週
  }

  return {
    last: currentIndex > 0 ? appState.weeksList[currentIndex - 1] : null,
    current: currentIndex !== -1 ? appState.weeksList[currentIndex] : null,
    next: currentIndex < appState.weeksList.length - 1 ? appState.weeksList[currentIndex + 1] : null
  };
}

// 開啟編輯抽屜並載入資料
function openDrawer(rowNum) {
  isCreateMode = false;
  
  // 還原 UI 至編輯狀態
  if (drawerTitleText) {
    drawerTitleText.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> 編輯任務進度';
  }
  if (drawerReadonlySection) {
    drawerReadonlySection.style.display = 'block';
  }
  if (editIsDone) {
    editIsDone.style.display = 'block';
    if (editIsDone.parentElement) {
      editIsDone.parentElement.style.gap = '0.6rem';
    }
  }

  const task = appState.tasks.find(t => t.rowNumber == rowNum);
  if (!task) return;

  editRowNum.value = rowNum;
  editTaskName.value = task.taskName; // 改為 value 以填充可編輯的專案名稱框
  editTaskId.value = task.taskId || ''; // 填入 B 欄真正的 ID 內容
  editGroup.textContent = task.group;
  
  // 對齊 Google Sheet 下拉選單的標準負責人清單與順序 (包含數字 0 的 "上0")
  const ownersList = ["", "上0", "小麥", "Rogin", "小夏", "芳如", "姵瑾", "neko", "AruV", "龍強", "企劃"];
  
  editOwnerSelect.innerHTML = ownersList.map(o => {
    // 如果 task.owner 是空值、未分配或 '-'，對應選取第一項 '-'
    const isMatched = (o === "" && (task.owner === "未分配" || !task.owner || task.owner === "-")) || (o === task.owner);
    const label = o === "" ? "-" : o;
    return `<option value="${o}" ${isMatched ? 'selected' : ''}>${label}</option>`;
  }).join('');

  // 渲染支援核取方塊
  const coOwnersContainer = document.getElementById('edit-co-owners-container');
  if (coOwnersContainer) {
    const members = ownersList.filter(o => o !== "" && o !== "企劃");
    const taskCoOwners = task.coOwners || [];
    
    coOwnersContainer.innerHTML = members.map(m => {
      const isChecked = taskCoOwners.includes(m);
      const isMainOwner = (task.owner === m) || (m === "" && (task.owner === "未分配" || !task.owner || task.owner === "-"));
      const disabledAttr = isMainOwner ? 'disabled' : '';
      const disabledClass = isMainOwner ? 'disabled' : '';
      const checkedAttr = (isChecked && !isMainOwner) ? 'checked' : '';
      
      return `
        <label class="drawer-checkbox-item ${disabledClass}">
          <input type="checkbox" value="${m}" ${checkedAttr} ${disabledAttr} class="co-owner-checkbox">
          <span>${m}${isMainOwner ? ' (已負責)' : ''}</span>
        </label>
      `;
    }).join('');
  }

  // 重設摺疊狀態為收合
  const coOwnersWrapper = document.getElementById('edit-co-owners-wrapper');
  const coOwnersToggleBtn = document.getElementById('co-owners-toggle-btn');
  if (coOwnersWrapper && coOwnersToggleBtn) {
    coOwnersWrapper.style.display = 'none';
    const arrow = coOwnersToggleBtn.querySelector('.toggle-arrow');
    if (arrow) arrow.textContent = '►';
  }
  toggleCoOwnersSection();
  
  // 完成度僅做展示 (純文字)
  editProgressVal.textContent = `${task.progress}%`;
  editDetail.value = task.detail;
  editTaskLink.value = task.taskLink || '';
  if (editTaskLink.value.trim() !== "") {
    btnOpenTaskLink.classList.remove('disabled');
  } else {
    btnOpenTaskLink.classList.add('disabled');
  }
  editIsDone.checked = task.isDone;

  resetDrawerTabs();
  renderTimeline(task);

  // 記錄開啟時的原始狀態 (用於髒數據防呆比對)
  const currentCoOwners = Array.from(document.querySelectorAll('.co-owner-checkbox:checked')).map(cb => cb.value);
  drawerOriginalState = {
    taskName: editTaskName.value.trim(), // 專案項目名稱
    taskId: editTaskId.value.trim(),
    owner: editOwnerSelect.value,
    coOwners: JSON.stringify(currentCoOwners),
    detail: editDetail.value.trim(),
    taskLink: editTaskLink.value.trim(),
    isDone: editIsDone.checked,
    weeks: JSON.stringify(task.weeks || {})
  };

  editDrawer.classList.add('open');
}

// 關閉抽屜
function closeDrawer() {
  editDrawer.classList.remove('open');
  drawerOriginalState = null; // 清空備份狀態
}

// 比對當前輸入框是否有修改
function isDrawerDirty() {
  if (!drawerOriginalState) return false;

  const currentCoOwners = Array.from(document.querySelectorAll('.co-owner-checkbox:checked')).map(cb => cb.value);
  
  // 收集目前左側時間軸中所有週別的輸入內容
  const currentWeeks = {};
  document.querySelectorAll('.timeline-textarea').forEach(textarea => {
    const label = textarea.getAttribute('data-week');
    if (label) {
      currentWeeks[label] = textarea.value.trim();
    }
  });

  return (
    editTaskName.value.trim() !== drawerOriginalState.taskName ||
    editTaskId.value.trim() !== drawerOriginalState.taskId ||
    editOwnerSelect.value !== drawerOriginalState.owner ||
    JSON.stringify(currentCoOwners) !== drawerOriginalState.coOwners ||
    editDetail.value.trim() !== drawerOriginalState.detail ||
    editTaskLink.value.trim() !== drawerOriginalState.taskLink ||
    editIsDone.checked !== drawerOriginalState.isDone ||
    JSON.stringify(currentWeeks) !== drawerOriginalState.weeks
  );
}

// 嘗試關閉抽屜 (可觸發防呆詢問)
function attemptCloseDrawer(force = false) {
  if (force) {
    closeDrawer();
    return;
  }
  
  if (isDrawerDirty()) {
    if (confirm("您已修改內容但尚未同步變更，確定要直接放棄變更離開嗎？")) {
      closeDrawer();
    }
  } else {
    closeDrawer();
  }
}

// 處理編輯表單提交
async function handleFormSubmit(e) {
  e.preventDefault();
  const rowNum = editRowNum.value;
  const detail = editDetail.value.trim();
  const taskLink = editTaskLink.value.trim();
  const taskId = editTaskId.value.trim(); 
  const owner = editOwnerSelect.value;   
  const taskName = editTaskName.value.trim(); 
  const coOwners = Array.from(document.querySelectorAll('.co-owner-checkbox:checked')).map(cb => cb.value);

  if (!taskName) {
    showToast('專案項目名稱不可為空！', 'error');
    return;
  }
  if (!taskId) {
    showToast('ID 欄位不可為空！', 'error');
    return;
  }

  // 1. 收集進度狀態 (從左側全年歷史時間軸收集所有週別內容)
  const weeksPayload = {};
  const timelineTextareas = document.querySelectorAll('.timeline-textarea');
  timelineTextareas.forEach(textarea => {
    const weekLabel = textarea.getAttribute('data-week');
    if (weekLabel) {
      weeksPayload[weekLabel] = textarea.value.trim();
    }
  });

  if (isCreateMode) {
    // === 新增任務模式 ===
    showToast('正在新增任務到 Google Sheet...', 'info');
    const payload = {
      action: "createTask",
      detail: detail,
      taskId: taskId,
      taskName: taskName,
      owner: owner,
      coOwners: coOwners,
      taskLink: taskLink,
      weeks: weeksPayload
    };

    const success = await syncTaskToGoogleSheet(null, payload);
    if (success) {
      showToast('任務新建成功！正在背景讀取最新進度...', 'success');
      loadData(true);
      closeDrawer();
    } else {
      showToast('新建任務失敗，請檢查 API 連線。', 'error');
    }
  } else {
    // === 傳統編輯模式 ===
    const isDone = editIsDone.checked;
    const task = appState.tasks.find(t => t.rowNumber == rowNum);
    if (!task) return;
    
    const updatedWeeks = { ...task.weeks, ...weeksPayload };

    // 更新本地狀態
    updateLocalTask(rowNum, {
      detail: detail,
      taskId: taskId,
      taskName: taskName,
      owner: owner,
      coOwners: coOwners,
      isDone: isDone,
      taskLink: taskLink,
      weeks: updatedWeeks
    });

    // 重新渲染畫面
    renderStats();
    renderTasks();
    attemptCloseDrawer(true);

    // 送出 POST 到 Google Apps Script 同步
    showToast('正在將變更同步到 Google Sheet...', 'info');
    const payload = {
      action: "updateTask",
      rowNumber: rowNum,
      detail: detail,
      taskId: taskId,     
      taskName: taskName, 
      owner: owner,       
      coOwners: coOwners,
      isDone: isDone,     
      taskLink: taskLink, 
      weeks: weeksPayload 
    };

    const success = await syncTaskToGoogleSheet(rowNum, payload);
    if (success) {
      showToast('同步成功！正在背景更新最新狀態...', 'success');
      loadData(true); 
    } else {
      showToast('同步失敗，請檢查 API 設定並點擊手動同步。', 'error');
      loadData(true); 
    }
  }
}

// 透過 POST 請求將資料寫回 Google Apps Script
async function syncTaskToGoogleSheet(rowNum, payload) {
  try {
    const postUrl = `${appState.gasUrl}?key=${encodeURIComponent(appState.apiKey)}`;
    
    // 由於 GAS Web App 限制，直接使用 POST 需要發送 JSON payload
    const response = await fetch(postUrl, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain' // 使用 text/plain 可以避免觸發複雜的 CORS preflight 限制
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    return result.success === true;
  } catch (err) {
    console.error('Sync Error:', err);
    return false;
  }
}

// 提示框小工具
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// 動態更新日本報紙發行資訊 (Masthead Meta)
function updateNewspaperMeta() {
  const timeWeeks = getTimelineWeeks();
  const currentWeek = timeWeeks.current ? timeWeeks.current.label : 'W--';
  document.getElementById('meta-current-week').textContent = currentWeek;

  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const dayName = weekdays[today.getDay()];
  
  document.getElementById('meta-today-date').textContent = `${mm}月${dd}日 (${dayName})`;
}

// 50 句精選網路流行廢話文學 (Nonsense Quotes)
const NONSENSE_QUOTES = [
  "「你要記住身為一個過來人，我已經過來了。」",
  "「沒有什麼困難是沒有困難的，你要記住：你的後背就在你的背後。」",
  "「財富的累積就是要靠累積財富。」",
  "「當你撐不住的時候，你一定要撐住！！除非撐不住。」",
  "「聽君一席話，如聽一席話。」",
  "「我上次這麼無語的時候，還是上次。」",
  "「如果你沒說錯的話，那就是沒說錯的話。」",
  "「只要你不肥，你就不會太胖。」",
  "「每過一分鐘，就有六十秒過去了。」",
  "「據統計，所有活著的人，目前都還沒去世。」",
  "「當你還沒醒來，你依然在睡夢中。」",
  "「如果不出意外的話，接下來應該是不會出意外的。」",
  "「如果明天不下雨，明天大概就不會下雨。」",
  "「只要你站在原地，你就不會走到別的地方去。」",
  "「如果這杯開水不燙，那它就已經涼了。」",
  "「關於明天的事，我們到了明天就會知道了。」",
  "「當你買了這個東西，你就花掉了買這個東西的錢。」",
  "「如果你覺得這句話很有道理，那它確實很有道理。」",
  "「每呼吸一分鐘，你的壽命就減少了六十秒。」",
  "「據研究顯示，人活著就是為了能繼續活著。」",
  "「只要你把眼睛閉上，你就看不見眼前的世界了。」",
  "「如果這條路沒有轉彎，它通常是直的。」",
  "「據調查，人在生氣的時候，心情往往不太好。」",
  "「只要你每天起得夠早，你今天就能起得很早。」",
  "「如果我沒猜錯的話，那我應該是猜對了。」",
  "「當你主動放棄，你就真的放棄了。」",
  "「在你變老之前，你其實一直都挺年輕的。」",
  "「據統計，所有單身的人，目前都沒有伴侶。」",
  "「只要你把這碗飯吃完，這碗飯的飯就被你吃完了。」",
  "「如果你不理我，那我們今天就沒有對話了。」",
  "「每當你踩下一腳油門，你的車就在消耗燃油。」",
  "「只要今天過完了，明天就會如期而至。」",
  "「據科學研究，所有吃過鹽的人，體內都含有鈉。」",
  "「當你抬頭看天，你的頭就往上抬了。」",
  "「如果你沒有忘記這件事，那你一定還記得。」",
  "「只要你現在不放棄，你就還在繼續努力。」",
  "「這個專案如果能按時完成，那它就不會延遲。」",
  "「當你寫完這行代碼，這行代碼就已經被寫完了。」",
  "「只要你點了重新整理，數據就會重新整理一次。」",
  "「據調查，凡是去過公司的人，都曾經去過公司。」",
  "「如果你的規格文件沒有變動，那它目前就沒有變化。」",
  "「吃麵如果不放湯，那就是乾麵了。」",
  "「當你吃飽了，你就不會覺得餓了。」",
  "「如果你有十塊錢，你再加十塊就是二十塊了。」",
  "「人在洗澡的時候，身上被水弄濕的機率高達百分之百。」",
  "「據研究，所有的貓在睡著時，都處於睡眠狀態。」",
  "「如果你不睡覺，你今晚就會一直醒著。」",
  "「這個西瓜嚐起來有一種西瓜的味道。」",
  "「只要你能解決這個問題，這個問題就被解決了。」",
  "「如果你把這杯水喝下去，你的口渴就會得到緩解。」"
];



// 從 localStorage 載入使用者自訂的廢話清單，若無則載入預設 50 句
let userNonsenseQuotes = JSON.parse(localStorage.getItem('sgf_nonsense_quotes_v2')) || [...NONSENSE_QUOTES];

// 隨機抽出一句廢話文學渲染到頁尾
function updateNonsenseQuote() {
  const footerEl = document.getElementById('footer-nonsense');
  if (footerEl) {
    if (userNonsenseQuotes.length === 0) {
      footerEl.textContent = "今天沒有廢話，請點此新增一些！";
      return;
    }
    const randomIndex = Math.floor(Math.random() * userNonsenseQuotes.length);
    footerEl.textContent = userNonsenseQuotes[randomIndex];
  }
}

// === 廢話文學副刊管理器 (Nonsense Manager) ===
const nonsenseModal = document.getElementById('nonsense-modal');
const nonsenseListContainer = document.getElementById('nonsense-list-container');
const newNonsenseInput = document.getElementById('new-nonsense-input');
const addNonsenseBtn = document.getElementById('add-nonsense-btn');
const resetNonsenseBtn = document.getElementById('reset-nonsense-btn');
const closeNonsenseModalBtn = document.getElementById('close-nonsense-modal-btn');

// 顯示廢話管理視窗
function showNonsenseModal() {
  renderNonsenseList();
  if (nonsenseModal) {
    nonsenseModal.classList.add('open');
  }
}

// 關閉廢話管理視窗
function closeNonsenseModal() {
  if (nonsenseModal) {
    nonsenseModal.classList.remove('open');
  }
  if (newNonsenseInput) {
    newNonsenseInput.value = '';
  }
}

// 渲染管理視窗內部的廢話列表
function renderNonsenseList() {
  if (!nonsenseListContainer) return;
  if (userNonsenseQuotes.length === 0) {
    nonsenseListContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem 0; font-size: 0.85rem;">目前清單空空如也，請在下方輸入新增您的每日廢話！</div>';
    return;
  }

  nonsenseListContainer.innerHTML = userNonsenseQuotes.map((quote, index) => {
    return `
      <div class="nonsense-manager-item">
        <span class="nonsense-item-text">${quote}</span>
        <button class="btn-delete-nonsense" data-index="${index}" title="刪除此句">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;
  }).join('');

  // 綁定每一列的刪除按鈕
  nonsenseListContainer.querySelectorAll('.btn-delete-nonsense').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.getAttribute('data-index'));
      deleteNonsenseQuote(idx);
    });
  });
}

// 新增一筆廢話
function addNonsenseQuote() {
  if (!newNonsenseInput) return;
  const newText = newNonsenseInput.value.trim();
  if (!newText) {
    showToast('請輸入廢話內容！', 'error');
    return;
  }
  if (userNonsenseQuotes.includes(newText)) {
    showToast('這句廢話已經在清單中了！', 'error');
    return;
  }

  userNonsenseQuotes.push(newText);
  saveNonsenseToLocalStorage();
  renderNonsenseList();
  newNonsenseInput.value = '';
  updateNonsenseQuote();
  showToast('已成功加入廢話副刊！', 'success');
}

// 刪除一筆廢話
function deleteNonsenseQuote(index) {
  userNonsenseQuotes.splice(index, 1);
  saveNonsenseToLocalStorage();
  renderNonsenseList();
  updateNonsenseQuote();
  showToast('已刪除該字句！', 'success');
}

// 恢復預設 50 句
function resetNonsenseQuotes() {
  if (confirm('確定要捨棄自訂內容，恢復為預設的 50 句精選廢話嗎？')) {
    userNonsenseQuotes = [...NONSENSE_QUOTES];
    saveNonsenseToLocalStorage();
    renderNonsenseList();
    updateNonsenseQuote();
    showToast('已重設為預設廢話文學！', 'success');
  }
}

// 寫入 localStorage 儲存
function saveNonsenseToLocalStorage() {
  localStorage.setItem('sgf_nonsense_quotes_v2', JSON.stringify(userNonsenseQuotes));
}

// 初始化事件監聽
const footerNonsenseEl = document.getElementById('footer-nonsense');
if (footerNonsenseEl) {
  footerNonsenseEl.addEventListener('click', showNonsenseModal);
}
if (closeNonsenseModalBtn) {
  closeNonsenseModalBtn.addEventListener('click', closeNonsenseModal);
}
if (addNonsenseBtn) {
  addNonsenseBtn.addEventListener('click', addNonsenseQuote);
}
if (resetNonsenseBtn) {
  resetNonsenseBtn.addEventListener('click', resetNonsenseQuotes);
}

// 按 Enter 也能新增
if (newNonsenseInput) {
  newNonsenseInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addNonsenseQuote();
    }
  });
}

// 點擊 Modal 外部關閉
if (nonsenseModal) {
  nonsenseModal.addEventListener('click', (e) => {
    if (e.target === nonsenseModal) {
      closeNonsenseModal();
    }
  });
}

// 渲染專案時程里程碑 (1-31日全月展示 - 點擊彈出 Mini Modal 編輯)
function renderMilestones() {
  const year = scheduleYearSelect ? scheduleYearSelect.value : new Date().getFullYear().toString();
  const month = scheduleMonthSelect ? scheduleMonthSelect.value : ("0" + (new Date().getMonth() + 1)).slice(-2);
  const weekVal = scheduleWeekSelect ? scheduleWeekSelect.value : 'all';

  // 切換到整月的時候，隱藏左右箭頭
  const schedulePrevWeekBtn = document.getElementById('schedule-prev-week-btn');
  const scheduleNextWeekBtn = document.getElementById('schedule-next-week-btn');
  if (schedulePrevWeekBtn && scheduleNextWeekBtn) {
    if (weekVal === 'all') {
      schedulePrevWeekBtn.style.display = 'none';
      scheduleNextWeekBtn.style.display = 'none';
    } else {
      schedulePrevWeekBtn.style.display = 'inline-flex';
      scheduleNextWeekBtn.style.display = 'inline-flex';
    }
  }

  console.log(`【SGF 核心偵錯】呼叫了最新 Table 版本的 renderMilestones。模式：${weekVal === 'all' ? '整月' : '週 ' + weekVal}`);

  // 1. 先清洗已有的 milestones 資料
  const sanitizedMilestones = appState.milestones.map(m => {
    let cleanDate = m.date || "";
    if (cleanDate.includes("GMT") || cleanDate.includes("台北") || isNaN(Date.parse(cleanDate)) === false) {
      const d = new Date(cleanDate);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const mStr = ("0" + (d.getMonth() + 1)).slice(-2);
        const dStr = ("0" + d.getDate()).slice(-2);
        cleanDate = `${y}/${mStr}/${dStr}`;
      }
    }
    return { ...m, date: cleanDate };
  });

  const weekdays = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  const fullMonthList = [];

  if (weekVal === 'all') {
    // 啟用年月選單
    if (scheduleYearSelect) scheduleYearSelect.removeAttribute('disabled');
    if (scheduleMonthSelect) scheduleMonthSelect.removeAttribute('disabled');

    // 2. 整月模式：計算該年月的總天數
    const yNum = parseInt(year);
    const mNum = parseInt(month);
    const daysInMonth = new Date(yNum, mNum, 0).getDate(); // 獲取當月總天數

    // 3. 生成 1 到 daysInMonth 的完整日期列表
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = ("0" + d).slice(-2);
      const dateKey = `${year}/${month}/${dStr}`; // 如 "2026/07/05"
      
      const tempDate = new Date(year, mNum - 1, d);
      const dayLabel = weekdays[tempDate.getDay()];

      const existing = sanitizedMilestones.find(m => m.date === dateKey);
      
      fullMonthList.push({
        date: dateKey,
        day: dayLabel,
        target: existing ? existing.target : "",
        rowNumber: existing ? existing.rowNumber : null
      });
    }
  } else {
    // 禁用年月選單，表示當前處於週鎖定模式
    if (scheduleYearSelect) scheduleYearSelect.setAttribute('disabled', 'true');
    if (scheduleMonthSelect) scheduleMonthSelect.setAttribute('disabled', 'true');

    // 4. 週篩選模式：尋找 appState.weeksList 中對應的週
    const targetWeek = appState.weeksList.find(w => w.label === weekVal);
    if (targetWeek && targetWeek.date) {
      const parts = targetWeek.date.split('-');
      if (parts.length === 2) {
        const startStr = parts[0].trim(); // 例如 "07/06"
        const [startM, startD] = startStr.split('/').map(Number);
        
        // 以 targetWeek 的開始日期為基準，生成連續 7 天的列表
        const startDate = new Date(parseInt(year), startM - 1, startD);
        
        for (let i = 0; i < 7; i++) {
          const temp = new Date(startDate);
          temp.setDate(startDate.getDate() + i);
          
          const y = temp.getFullYear();
          const mStr = ("0" + (temp.getMonth() + 1)).slice(-2);
          const dStr = ("0" + temp.getDate()).slice(-2);
          const dateKey = `${y}/${mStr}/${dStr}`;
          const dayLabel = weekdays[temp.getDay()];
          
          const existing = sanitizedMilestones.find(m => m.date === dateKey);
          
          fullMonthList.push({
            date: dateKey,
            day: dayLabel,
            target: existing ? existing.target : "",
            rowNumber: existing ? existing.rowNumber : null
          });
        }
      }
    }
  }

  // 取得今天日期字串 (YYYY/MM/DD) 用於高亮比對
  const today = new Date();
  const tY = today.getFullYear();
  const tM = ("0" + (today.getMonth() + 1)).slice(-2);
  const tD = ("0" + today.getDate()).slice(-2);
  const todayStr = `${tY}/${tM}/${tD}`;

  const tableHtml = `
    <table style="width: 100% !important; border-collapse: collapse !important; border: none !important; margin: 0 !important; padding: 0 !important; table-layout: fixed !important; text-align: left !important;">
      <tbody>
        ${fullMonthList.map((m, idx) => {
          const isToday = m.date === todayStr;
          
          // 今日高亮樣式
          const itemHighlightBg = isToday ? 'background: rgba(183, 28, 28, 0.04) !important;' : '';
          const textColor = isToday ? 'color: var(--accent-red) !important; font-weight: 700 !important;' : 'color: var(--text-primary) !important;';
          
          // 今日日期加上精美紅底白字，非今日則保持優雅灰褐
          const dateBgStyle = isToday 
            ? 'background: var(--accent-red) !important; color: #ffffff !important; padding: 0.15rem 0.4rem !important; border-radius: 3px !important; font-weight: 700 !important; display: inline-block !important;' 
            : 'color: var(--text-secondary) !important;';
          
          // 渲染目標或空 Placeholder
          const hasContent = !!m.target;
          const displayTarget = hasContent 
            ? m.target 
            : '<span class="milestone-placeholder" style="color: var(--text-muted) !important; text-decoration: underline !important; text-underline-offset: 4px !important; opacity: 0.5 !important; cursor: pointer !important;">點擊填寫目標...</span>';
          
          const editIcon = m.rowNumber 
            ? `<i class="fa-solid fa-pen milestone-edit-pencil" style="margin-left: 0.5rem !important; opacity: 0; font-size: 0.75rem !important; color: var(--text-secondary) !important; cursor: pointer !important; transition: opacity 0.15s ease !important;" title="修改"></i>`
            : '';

          return `
            <tr class="milestone-row" data-date="${m.date}" data-day="${m.day}" data-row="${m.rowNumber}" data-target="${m.target.replace(/"/g, '&quot;')}" style="transition: background-color 0.2s !important; ${itemHighlightBg} cursor: pointer;">
              <!-- 1. 日期 (C欄) -->
              <td style="width: 110px !important; padding: 0.8rem 0.5rem !important; font-size: 0.92rem !important; font-family: 'Playfair Display', Georgia, serif !important; text-align: left !important; vertical-align: top !important; line-height: 1.4 !important; user-select: none !important; box-sizing: border-box !important;">
                <span style="${dateBgStyle}">${m.date}</span>
              </td>
              <!-- 2. 星期 (D欄) -->
              <td style="width: 60px !important; padding: 0.8rem 0.5rem !important; font-size: 0.88rem !important; text-align: left !important; color: var(--text-secondary) !important; vertical-align: top !important; line-height: 1.4 !important; user-select: none !important; box-sizing: border-box !important;">
                ${m.day}
              </td>
              <!-- 3. 目標純文字 (F欄 - 使用絕對定位鉛筆按鈕防干擾) -->
              <td style="padding: 0.8rem 0.5rem !important; font-size: 0.92rem !important; text-align: left !important; vertical-align: top !important; line-height: 1.4 !important; box-sizing: border-box !important;">
                <div style="position: relative !important; width: 100% !important; text-align: left !important; display: block !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important;">
                  <div class="milestone-text-container" style="width: 100% !important; text-align: left !important; white-space: pre-wrap !important; word-break: break-word !important; margin: 0 !important; padding: 0 !important; padding-right: 25px !important; display: block !important; box-sizing: border-box !important; ${textColor}">${displayTarget}</div>
                  <!-- 絕對定位在右上角，徹底不對左側文字的高度與水平排布產生任何擠壓 -->
                  <div style="position: absolute !important; right: 0 !important; top: 0 !important; display: inline-block !important;">
                    ${editIcon}
                  </div>
                </div>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  scheduleListContainer.innerHTML = tableHtml;

  // 綁定點擊每行彈窗編輯事件
  bindMilestoneModalEvents();
}

// 宣告迷你編輯彈窗全域變數與事件監聽
let activeEditingMilestone = null; // 儲存當前正在編輯的時程資訊 { rowNumber, date, day, target }

function bindMilestoneModalEvents() {
  const container = scheduleListContainer;
  if (!container) return;

  // 1. 懸浮顯示鉛筆圖示
  container.querySelectorAll('.milestone-row').forEach(row => {
    row.addEventListener('mouseenter', () => {
      const pencil = row.querySelector('.milestone-edit-pencil');
      if (pencil) pencil.style.opacity = '1';
    });
    row.addEventListener('mouseleave', () => {
      const pencil = row.querySelector('.milestone-edit-pencil');
      if (pencil) pencil.style.opacity = '0';
    });
    
    // 2. 點擊整列，彈出迷你編輯視窗
    row.addEventListener('click', () => {
      const rowNum = row.getAttribute('data-row');
      const dateKey = row.getAttribute('data-date');
      const dayLabel = row.getAttribute('data-day');
      const currentTarget = row.getAttribute('data-target') || "";
      
      if (rowNum === 'null' || !rowNum) return; // 試算表無此行防呆
      
      activeEditingMilestone = {
        rowNumber: parseInt(rowNum),
        date: dateKey,
        day: dayLabel,
        target: currentTarget
      };
      
      // 開啟迷你 Modal 並預填數值
      const miniModal = document.getElementById('milestone-edit-modal');
      const miniTextarea = document.getElementById('milestone-edit-textarea');
      const miniDateDisplay = document.getElementById('milestone-edit-date-display');
      
      if (miniDateDisplay) miniDateDisplay.textContent = `編輯日期：${dateKey} (${dayLabel})`;
      if (miniTextarea) miniTextarea.value = currentTarget;
      
      if (miniModal) {
        miniModal.classList.add('open');
      }
      if (miniTextarea) miniTextarea.focus();
    });
  });
}

// 註冊迷你編輯 Modal 的全域按鈕事件
function setupMilestoneEditModalListeners() {
  const miniModal = document.getElementById('milestone-edit-modal');
  const miniTextarea = document.getElementById('milestone-edit-textarea');
  const closeMiniBtn = document.getElementById('close-milestone-edit-modal-btn');
  const cancelMiniBtn = document.getElementById('cancel-milestone-modal-btn');
  const saveMiniBtn = document.getElementById('save-milestone-modal-btn');
  
  if (!miniModal || !miniTextarea) return;
  
  const closeEditor = () => {
    miniModal.classList.remove('open');
    miniTextarea.value = "";
    activeEditingMilestone = null;
  };
  
  if (closeMiniBtn) closeMiniBtn.addEventListener('click', closeEditor);
  if (cancelMiniBtn) cancelMiniBtn.addEventListener('click', closeEditor);
  
  // 點擊暗化背景關閉
  miniModal.addEventListener('click', (e) => {
    if (e.target === miniModal) {
      closeEditor();
    }
  });
  
  // 儲存寫回
  const submitMilestoneChange = async () => {
    if (!activeEditingMilestone) return;
    
    const { rowNumber, date, day } = activeEditingMilestone;
    const newTarget = miniTextarea.value.trim();
    
    showToast('正在更新專案目標...', 'info');
    
    const payload = {
      rowNumber: rowNumber,
      action: "updateMilestone",
      target: newTarget
    };
    
    const success = await syncTaskToGoogleSheet(rowNumber, payload);
    if (success) {
      showToast('時程目標更新成功！', 'success');
      
      // 1. 更新本地狀態 appState.milestones
      const existingIdx = appState.milestones.findIndex(m => m.rowNumber == rowNumber);
      if (existingIdx !== -1) {
        appState.milestones[existingIdx].target = newTarget;
      } else {
        appState.milestones.push({
          rowNumber: rowNumber,
          date: date,
          day: day,
          target: newTarget
        });
      }
      
      // 2. 重新渲染大事記列表
      renderMilestones();
      
      closeEditor();
    } else {
      showToast('更新失敗，請確認 API 連線。', 'error');
    }
  };
  
  if (saveMiniBtn) saveMiniBtn.addEventListener('click', submitMilestoneChange);
  
  // 綁定 Ctrl + Enter 儲存與 Esc 取消
  miniTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      submitMilestoneChange();
    } else if (e.key === 'Escape') {
      closeEditor();
    }
  });
}

// 動態加載週別清單並預設定位當週
function initScheduleWeekSelectOptions() {
  if (!scheduleWeekSelect) return;
  
  // 1. 清空除第一項「整月」外的所有選項
  scheduleWeekSelect.innerHTML = '<option value="all">整月</option>';
  
  // 2. 動態填充 appState.weeksList 中的週別
  appState.weeksList.forEach(week => {
    if (!week.label || !week.date) return;
    const opt = document.createElement('option');
    opt.value = week.label;
    opt.textContent = `${week.label} (${week.date})`;
    scheduleWeekSelect.appendChild(opt);
  });

  // 3. 預設選中當週
  const timeWeeks = getTimelineWeeks();
  if (timeWeeks.current && timeWeeks.current.label) {
    scheduleWeekSelect.value = timeWeeks.current.label;
  } else {
    scheduleWeekSelect.value = 'all';
  }
}

// 立即執行迷你編輯 Modal 的按鈕事件綁定
setupMilestoneEditModalListeners();

// 使用 MutationObserver 全域監聽所有彈窗與抽屜的 class 變化，自動切換背景鎖定
function setupGlobalScrollLockObserver() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        // 判定畫面上是否還有任何處於開啟狀態的彈窗或抽屜
        const hasOpenModal = document.querySelector('.modal.open');
        const hasOpenDrawer = document.querySelector('.drawer.open');
        
        if (hasOpenModal || hasOpenDrawer) {
          document.body.classList.add('body-scroll-lock');
        } else {
          document.body.classList.remove('body-scroll-lock');
        }
      }
    });
  });

  // 監聽所有 modal 和 drawer 容器
  const lockableElements = document.querySelectorAll('.modal, .drawer');
  if (lockableElements && lockableElements.length > 0) {
    for (let i = 0; i < lockableElements.length; i++) {
      observer.observe(lockableElements[i], { attributes: true, attributeFilter: ['class'] });
    }
  }
}


