// ============================================================================
// Spendy — Toast Notifications
// Usage: import { toast } from '...components/toast.js'; toast.success('Logged in');
// ============================================================================

const ICONS = {
  success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const COLORS = {
  success: 'var(--spendy-success)',
  error: 'var(--spendy-danger)',
  info: 'var(--spendy-accent)',
  warning: 'var(--spendy-warning)',
};

function ensureContainer() {
  let container = document.getElementById('spendy-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'spendy-toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    Object.assign(container.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: '9999',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      maxWidth: 'min(360px, calc(100vw - 40px))',
    });
    document.body.appendChild(container);
  }
  return container;
}

function show(message, type = 'info', duration = 4000) {
  const container = ensureContainer();
  const el = document.createElement('div');
  el.className = 'glass-card';
  Object.assign(el.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 18px',
    color: COLORS[type],
    transform: 'translateX(120%)',
    opacity: '0',
    transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.35s',
  });

  const icon = document.createElement('span');
  icon.innerHTML = ICONS[type] ?? ICONS.info;
  icon.style.flexShrink = '0';

  const text = document.createElement('span');
  text.textContent = message;
  text.style.color = 'var(--text-primary)';
  text.style.fontSize = 'var(--fs-sm)';
  text.style.fontWeight = '500';

  el.append(icon, text);
  container.appendChild(el);

  requestAnimationFrame(() => {
    el.style.transform = 'translateX(0)';
    el.style.opacity = '1';
  });

  const remove = () => {
    el.style.transform = 'translateX(120%)';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 350);
  };

  el.addEventListener('click', remove);
  setTimeout(remove, duration);
}

export const toast = {
  success: (msg, duration) => show(msg, 'success', duration),
  error: (msg, duration) => show(msg, 'error', duration),
  info: (msg, duration) => show(msg, 'info', duration),
  warning: (msg, duration) => show(msg, 'warning', duration),
};
