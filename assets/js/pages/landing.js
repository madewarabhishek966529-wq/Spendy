// ============================================================================
// Spendy — Landing Page Entry Script
// ============================================================================

import { applyStoredTheme } from '../utils/theme.js';
import { initAuth } from '../services/authService.js';

applyStoredTheme();

// If someone with an active session lands on the marketing page (e.g. from
// a bookmark), send them straight into the app instead of showing the pitch.
const session = await initAuth();
if (session?.user) {
  window.location.href = '/pages/dashboard.html';
}
