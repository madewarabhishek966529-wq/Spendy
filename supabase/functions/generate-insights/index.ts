// ============================================================================
// Spendy — generate-insights Edge Function
// Input:  { forceRefresh?: boolean }
// Output: { summary, insights: [{ type, title, detail }], metrics, cached, generated_at }
//
// Reads the caller's own transactions (RLS-scoped), computes the hard
// numbers locally (never trust an LLM with arithmetic), sends the numeric
// summary to GPT-5 for narrative insights + advice, then caches the result
// in ai_reports via the service-role client (ai_reports has no client-side
// insert policy by design — see migration 001) so we don't re-call the
// model on every page load.
// ============================================================================

import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { authenticate } from '../_shared/authClient.ts';
import { chatJSON } from '../_shared/openai.ts';

const CACHE_FRESH_MS = 6 * 60 * 60 * 1000; // 6 hours

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function summarize(transactions: Array<Record<string, unknown>>) {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  let monthlyIncome = 0, monthlyExpense = 0, prevMonthlyExpense = 0;
  const categoryTotals: Record<string, number> = {};
  const dailyExpense: Record<string, number> = {};

  for (const t of transactions) {
    const date = new Date(t.transaction_date as string);
    const amount = Number(t.amount) || 0;

    if (date >= monthStart) {
      if (t.type === 'income') monthlyIncome += amount;
      else monthlyExpense += amount;
    }
    if (date >= prevMonthStart && date <= prevMonthEnd && t.type === 'expense') {
      prevMonthlyExpense += amount;
    }
    if (t.type === 'expense') {
      const cat = (t.category as string) || 'Other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + amount;
      const day = (t.transaction_date as string);
      dailyExpense[day] = (dailyExpense[day] || 0) + amount;
    }
  }

  const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
  const avgDailyExpense =
    Object.values(dailyExpense).reduce((s, v) => s + v, 0) / Math.max(Object.keys(dailyExpense).length, 1);

  return {
    monthlyIncome: Number(monthlyIncome.toFixed(2)),
    monthlyExpense: Number(monthlyExpense.toFixed(2)),
    prevMonthlyExpense: Number(prevMonthlyExpense.toFixed(2)),
    monthOverMonthChangePercent:
      prevMonthlyExpense > 0
        ? Number((((monthlyExpense - prevMonthlyExpense) / prevMonthlyExpense) * 100).toFixed(1))
        : null,
    topCategory: topCategory ? { name: topCategory[0], amount: Number(topCategory[1].toFixed(2)) } : null,
    categoryTotals,
    avgDailyExpense: Number(avgDailyExpense.toFixed(2)),
    transactionCount: transactions.length,
  };
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = await authenticate(req);
  if ('error' in auth) return errorResponse(auth.error, 401);
  const { user, userClient, adminClient } = auth;

  try {
    const { forceRefresh } = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    if (!forceRefresh) {
      const { data: cached } = await userClient
        .from('ai_reports')
        .select('summary, insights, metrics, generated_at')
        .eq('report_type', 'monthly')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cached && Date.now() - new Date(cached.generated_at).getTime() < CACHE_FRESH_MS) {
        return jsonResponse({ ...cached, cached: true });
      }
    }

    const { data: transactions, error: txError } = await userClient
      .from('transactions')
      .select('type, amount, category, transaction_date')
      .gte('transaction_date', isoDaysAgo(60));
    if (txError) throw txError;

    if (!transactions || transactions.length === 0) {
      return jsonResponse({
        summary: 'Add a few transactions and Spendy will start surfacing insights here.',
        insights: [],
        metrics: {},
        cached: false,
        generated_at: new Date().toISOString(),
      });
    }

    const metrics = summarize(transactions);

    const ai = await chatJSON({
      system:
        'You are a friendly, encouraging personal finance assistant for students and young ' +
        'professionals. You are given pre-computed numeric metrics (never recompute totals ' +
        'yourself — trust the numbers given). Write a short 1-2 sentence overall summary, then ' +
        '3-6 concrete insight cards. Each insight has a "type" (spending_summary, category, ' +
        'trend, saving_tip, or warning), a short "title" (max 6 words), and a "detail" sentence. ' +
        'Be specific using the actual numbers provided. Keep tone supportive, never shaming.',
      messages: [{ role: 'user', content: JSON.stringify(metrics) }],
      schemaName: 'financial_insights',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          summary: { type: 'string' },
          insights: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                type: {
                  type: 'string',
                  enum: ['spending_summary', 'category', 'trend', 'saving_tip', 'warning'],
                },
                title: { type: 'string' },
                detail: { type: 'string' },
              },
              required: ['type', 'title', 'detail'],
            },
          },
        },
        required: ['summary', 'insights'],
      },
    });

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const periodEnd = now.toISOString().slice(0, 10);

    // ai_reports has no client insert policy on purpose (see migration 001) —
    // writes only happen here, after the JWT has been verified above.
    await adminClient.from('ai_reports').insert({
      user_id: user.id,
      report_type: 'monthly',
      period_start: periodStart,
      period_end: periodEnd,
      summary: ai.summary,
      insights: ai.insights,
      metrics,
    });

    return jsonResponse({
      summary: ai.summary,
      insights: ai.insights,
      metrics,
      cached: false,
      generated_at: now.toISOString(),
    });
  } catch (err) {
    console.error('[generate-insights]', err);
    return errorResponse(err.message || 'Failed to generate insights.', 500);
  }
});
