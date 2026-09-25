import { db, check } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Serves a member's fantasy team logo through this app. Custom ESPN logos
// often sit on http:// links or hosts that refuse to load inside other
// websites, so the server fetches the image and passes it along.
export async function GET(_req, { params }) {
  const { id } = await params;
  const m = check(await db().from('members').select('team_logo').eq('id', Number(id)).limit(1))[0];
  const src = m?.team_logo;
  if (!src || !/^https?:\/\//i.test(src)) return new Response(null, { status: 404 });

  const { ESPN_S2, ESPN_SWID } = process.env;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36',
    Accept: 'image/avif,image/webp,image/png,image/*;q=0.8',
    Referer: 'https://fantasy.espn.com/',
  };
  if (ESPN_S2 && ESPN_SWID && /espn/i.test(new URL(src).host)) headers.Cookie = `espn_s2=${ESPN_S2}; SWID=${ESPN_SWID}`;

  // Try the https version first, then the link exactly as ESPN gave it.
  const tries = [...new Set([src.replace(/^http:\/\//i, 'https://'), src])];
  for (const url of tries) {
    try {
      const res = await fetch(url, { headers, redirect: 'follow', cache: 'no-store' });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.startsWith('image/')) continue;
      return new Response(res.body, {
        headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' },
      });
    } catch {}
  }
  return new Response(null, { status: 404 });
}
