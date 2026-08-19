window.dashboardShowToast = function dashboardShowToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast show ${type}`;
  window.clearTimeout(window.dashboardToastTimer);
  window.dashboardToastTimer = window.setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
};

window.dashboardSetLoading = function dashboardSetLoading(isLoading, message = '資料載入中，請稍候…') {
  let notice = document.getElementById('dashboard-loading-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'dashboard-loading-notice';
    notice.className = 'dashboard-loading-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    notice.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i><span></span>';
    document.body.appendChild(notice);
  }
  notice.querySelector('span').textContent = message;
  notice.classList.toggle('show', Boolean(isLoading));
};
