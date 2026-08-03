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

