import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSettings } from '@/lib/data';
import { autoSync } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Vercel Cron hits this every morning (see vercel.json).
export async function GET(req) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await autoSync(await getSettings());
    revalidatePath('/', 'layout');
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
