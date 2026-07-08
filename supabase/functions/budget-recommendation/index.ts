// ============================================================================
// Spendy — budget-recommendation Edge Function
// Input:  { forceRefresh?: boolean }
// Output: { budgetAmount, spent, remaining, dailySafeSpend, healthScore,
//           recommendations: string[], cached, generated_at }
//
// All figures (remaining budget, safe daily spend, health score) are
// computed deterministically here — GPT-5 is only used to phrase the
// recommendation sentences, never to do the arithmetic.
// ============================================================================

import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { authenticate } from '../_shared/authClient.ts';
import { chatJSON } from '../_shared/openai.ts';

const CACHE_FRESH_MS = 6 * 60 * 60 * 1000; // 6 hours

function firstOfMonthISO(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = await authenticate(req);
  if ('error' in auth) return errorResponse(auth.error, 401);
  const { user, userClient, adminClient } = auth;

  try {
    const { forceRefresh } = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    const { data: budget, error: budgetError } = await userClient
      .from('budgets')
      .select('budget_amount, alert_threshold_percent')
      .eq('month', firstOfMonthISO())
      .maybeSingle();
    if (budgetError) throw budgetError;

    if (!budget) {
      return jsonResponse({
        budgetAmount: 0, spent: 0, remaining: 0, dailySafeSpend: 0,
        healthScore: null, recommendations: [], cached: false,
        generated_at: new Date().toISOString(),
        message: 'Set a monthly budget to get personalized recommendations.',
      });
    }

    if (!forceRefresh) {
      const { data: cached } = await userClient
        .from('ai_reports')
        .select('metrics, insights, generated_at')
        .eq('report_type', 'budget_recommendation')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cached && Date.now() - new Date(cached.generated_at).getTime() < CACHE_FRESH_MS) {
        return jsonResponse({
          ...cached.metrics,
          recommendations: cached.insights,
          cached: true,
          generated_at: cached.generated_at,
        });
      }
    }

    const now = new Date();
    const monthStart = firstOfMonthISO(now);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const daysLeft = Math.max(daysInMonth - dayOfMonth + 1, 1);

    const { data: expenses, error: txError } = await userClient
      .from('transactions')
      .select('amount, category, transaction_date')
      .eq('type', 'expense')
      .gte('transaction_date', monthStart);
    if (txError) throw txError;

    const spent = (expenses ?? []).reduce((s, t) => s + Number(t.amount || 0), 0);
    const budgetAmount = Number(budget.budget_amount);
    const remaining = Math.max(budgetAmount - spent, 0);
    const dailySafeSpend = Number((remaining / daysLeft).toFixed(2));
    const expectedPaceSpend = budgetAmount * (dayOfMonth / daysInMonth);
    const paceRatio = expectedPaceSpend > 0 ? spent / expectedPaceSpend : 0;

    // Deterministic health score: 100 when on/under pace, drops as overspend
    // relative to expected pace grows. Floored at 0.
    const healthScore = Math.max(0, Math.min(100, Math.round(100 - Math.max(paceRatio - 1, 0) * 100)));

    const categoryTotals: Record<string, number> = {};
    for (const t of expenses ?? []) {
      const cat = (t.category as string) || 'Other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(t.amount || 0);
    }

    const ai = await chatJSON({
      system:
        'You are a supportive personal finance assistant. You are given pre-computed budget ' +
        'metrics (trust these numbers exactly, do not recompute). Write 3-5 short, specific, ' +
        'actionable recommendation sentences a student/young professional could act on today. ' +
        'Reference the actual numbers given (currency amounts, percentages, days remaining). ' +
        'If spending is on pace or under, be encouraging; if overspending, be direct but kind ' +
        'about which category to cut back on.',
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            budgetAmount, spent, remaining, dailySafeSpend, daysLeft, daysInMonth,
            paceRatio: Number(paceRatio.toFixed(2)), categoryTotals,
          }),
        },
      ],
      schemaName: 'budget_recommendations',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          recommendations: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
        },
        required: ['recommendations'],
      },
    });

    const metrics = { budgetAmount, spent, remaining, dailySafeSpend, healthScore };
    const generatedAt = new Date().toISOString();

    await adminClient.from('ai_reports').insert({
      user_id: user.id,
      report_type: 'budget_recommendation',
      period_start: monthStart,
      period_end: new Date(now.getFullYear(), now.getMonth(), daysInMonth).toISOString().slice(0, 10),
      summary: `Budget health score: ${healthScore}/100`,
      insights: ai.recommendations,
      metrics,
    });

    return jsonResponse({
      ...metrics,
      recommendations: ai.recommendations,
      cached: false,
      generated_at: generatedAt,
    });
  } catch (err) {
    console.error('[budget-recommendation]', err);
    return errorResponse(err.message || 'Failed to generate budget recommendations.', 500);
  }
});
