// ============================================================================
// Spendy — Modal Component
// A single reusable overlay + dialog. Callers pass inner HTML and get back
// the mounted dialog element to wire up their own form handlers, plus a
// close() function. Closes on overlay click, Escape key, or explicit close().
// ============================================================================

import { icons } from '../utils/icons.js';

let activeOverlay = null;

/**
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.bodyHTML - inner HTML for the modal body (form, etc.)
 * @param {() => void} [opts.onClose]
 * @returns {{ dialog: HTMLElement, close: () => void }}
 */
export function openModal({ title, bodyHTML, onClose }) {
  closeModal(); // only one modal at a time

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="modal-header">
        <h2>${title}</h2>
        <button type="button" class="modal-close-btn" aria-label="Close">${icons.close}</button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  activeOverlay = overlay;

  requestAnimationFrame(() => overlay.classList.add('is-open'));

  const close = () => {
    if (!overlay.isConnected) return;
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKeydown);
    setTimeout(() => {
      overlay.remove();
      if (activeOverlay === overlay) activeOverlay = null;
      onClose?.();
    }, 200);
  };

  const onKeydown = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKeydown);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('.modal-close-btn').addEventListener('click', close);

  return { dialog: overlay.querySelector('.modal-dialog'), close };
}

export function closeModal() {
  activeOverlay?.querySelector('.modal-close-btn')?.click();
}
