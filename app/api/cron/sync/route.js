import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/data';
import { syncWeek } from '@/lib/sync';

export const dynamic = 'force-dynamic';

// Vercel Cron hits this every Tuesday morning (see vercel.json) to pull the
// final scores for the current week after Monday Night Football.
export async function GET(req) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const settings = await getSettings();
  if (settings.platform === 'manual') return NextResponse.json({ skipped: 'manual scoring' });
  try {
    const result = await syncWeek(settings, settings.current_week);
    return NextResponse.json({ week: settings.current_week, ...result });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
