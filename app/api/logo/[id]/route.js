import { db, check } from '@/lib/db';
import { fetchImage } from '@/lib/logos';

export const dynamic = 'force-dynamic';

// Fallback for a logo that hasn't been saved to storage yet: fetches it from
// ESPN on the server and passes it along.
export async function GET(_req, { params }) {
  const { id } = await params;
  const m = check(await db().from('members').select('team_logo').eq('id', Number(id)).limit(1))[0];
  const img = await fetchImage(m?.team_logo);
  if (img.error) return new Response(null, { status: 404 });
  return new Response(img.buf, {
    headers: { 'Content-Type': img.type, 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' },
  });
}
