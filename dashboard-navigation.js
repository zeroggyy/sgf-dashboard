const NAV_DASHBOARD_PAGES = Object.freeze({
  sgf: { label: 'SGF 企劃進度控制台', href: 'index.html' },
  theme2: { label: 'SGF 介面進度控制台', href: 'ui-progress.html' },
  theme3: { label: 'SGF 音效語音進度控制台', href: 'sound-voice-progress.html' }
});

// 多視圖主題管理：各主題保有獨立 DOM、版面與互動，不再改寫 SGF 主題內容。
(function setupIndependentThemeViews() {
  const drawer = document.getElementById('theme-drawer');
  const backdrop = document.getElementById('theme-drawer-backdrop');
  const closeBtn = document.getElementById('theme-drawer-close');
  const options = document.querySelectorAll('#theme-options .theme-option');
  const toggles = document.querySelectorAll('[data-theme-toggle]');
  const views = {
    sgf: document.querySelector('.theme-view-sgf'),
    theme2: document.getElementById('theme-view-theme2'),
    theme3: document.getElementById('theme-view-theme3')
  };
  const isMultiPage = document.body.dataset.dashboardMode === 'multipage';
  if (!drawer || !backdrop || !options.length || (!isMultiPage && !views.sgf)) return;

  function setDrawerOpen(open) {
    drawer.classList.toggle('open', open);
    backdrop.classList.toggle('open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    backdrop.setAttribute('aria-hidden', String(!open));
    toggles.forEach(toggle => toggle.setAttribute('aria-expanded', String(open)));
    document.body.classList.toggle('body-scroll-lock', open);
  }

  function setActiveTheme(themeKey) {
    if (!isMultiPage) {
      Object.entries(views).forEach(([key, view]) => {
        if (!view) return;
        view.hidden = key !== themeKey;
        view.setAttribute('aria-hidden', String(key !== themeKey));
      });
    }
    options.forEach(option => option.classList.toggle('active', option.dataset.theme === themeKey));
    const sgfLabel = document.getElementById('current-theme-label');
    if (sgfLabel) sgfLabel.textContent = NAV_DASHBOARD_PAGES[themeKey]?.label || NAV_DASHBOARD_PAGES.sgf.label;
    document.documentElement.dataset.activeTheme = themeKey;
    setDrawerOpen(false);
    if (themeKey === 'theme2') {
      requestAnimationFrame(() => requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))));
    }
  }

  toggles.forEach(toggle => toggle.addEventListener('click', () => setDrawerOpen(true)));
  closeBtn?.addEventListener('click', () => setDrawerOpen(false));
  backdrop.addEventListener('click', () => setDrawerOpen(false));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setDrawerOpen(false); });
  options.forEach(option => option.addEventListener('click', () => {
    // 過渡期間保留單頁切換；獨立頁面啟用後改由集中設定的網址導覽。
    if (document.body.dataset.dashboardMode === 'multipage') {
      const target = option.dataset.dashboardHref || NAV_DASHBOARD_PAGES[option.dataset.theme]?.href;
      if (target && !location.pathname.endsWith(target)) location.href = target;
      return;
    }
    setActiveTheme(option.dataset.theme);
  }));

  document.querySelectorAll('#theme-view-theme3').forEach(view => {
    view.querySelectorAll('.demo-reset-btn').forEach(button => button.addEventListener('click', () => {
      view.querySelectorAll('select').forEach(select => { select.selectedIndex = 0; });
      view.querySelectorAll('.theme2-filter-chip').forEach((chip, index) => chip.classList.toggle('active', index === 0));
      view.querySelectorAll('input[type="search"]').forEach(input => { input.value = ''; });
    }));
  });

  const initialTheme = isMultiPage
    ? document.body.dataset.dashboardKey || 'sgf'
    : sessionStorage.getItem('sgf_active_theme_once') || 'sgf';
  sessionStorage.removeItem('sgf_active_theme_once');
  setActiveTheme(isMultiPage || views[initialTheme] ? initialTheme : 'sgf');
})();
