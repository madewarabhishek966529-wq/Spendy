// ============================================================================
// Spendy — Chart Theme Helper
// Chart.js can't read CSS variables directly inside canvas, so this pulls
// the current values of the brand/semantic tokens each time a chart is
// (re)built. Call getChartTheme() fresh after any theme change rather than
// caching it.
// ============================================================================

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function getChartTheme() {
  return {
    primary: cssVar('--spendy-primary'),
    primaryLight: cssVar('--spendy-primary-light'),
    secondary: cssVar('--spendy-secondary'),
    accent: cssVar('--spendy-accent'),
    danger: cssVar('--spendy-danger'),
    warning: cssVar('--spendy-warning'),
    textPrimary: cssVar('--text-primary'),
    textMuted: cssVar('--text-muted'),
    gridLine: cssVar('--border-glass'),
    fontBody: cssVar('--font-body').split(',')[0].replace(/['"]/g, '').trim() || 'Inter',
  };
}

/** Ten distinct, brand-adjacent colors for the fixed expense_category enum. */
export const CATEGORY_COLORS = {
  Food: '#10B981',
  Transport: '#06B6D4',
  Shopping: '#4F46E5',
  Education: '#8B5CF6',
  Medical: '#EF4444',
  Entertainment: '#F59E0B',
  Bills: '#0EA5E9',
  Rent: '#EC4899',
  Travel: '#14B8A6',
  Other: '#94A3B8',
};

/** Common Chart.js option scaffolding shared by every chart on the page. */
export function baseOptions(theme, extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    plugins: {
      legend: {
        labels: { color: theme.textMuted, font: { family: theme.fontBody, size: 12 } },
      },
      tooltip: {
        backgroundColor: theme.textPrimary,
        titleFont: { family: theme.fontBody },
        bodyFont: { family: theme.fontBody },
        padding: 10,
        cornerRadius: 8,
      },
    },
    ...extra,
  };
}
