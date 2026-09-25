import 'server-only';
import { db, check } from './db';

const BUCKET = 'logos';
const MAX_BYTES = 4 * 1024 * 1024;
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif' };

// Downloads an image from ESPN (or wherever a logo link points). ESPN's image
// servers sometimes stall requests from data centers (408) or want a logged-in
// session, so this tries a few request styles with a timeout, sends ESPN login
// cookies when they're configured, and reports which server said no.
export async function fetchImage(src) {
  if (!src || !/^https?:\/\//i.test(src)) return { error: 'No logo link' };
  const { ESPN_S2, ESPN_SWID } = process.env;
  const host = new URL(src).host;
  const cookie = ESPN_S2 && ESPN_SWID && /espn/i.test(host) ? `espn_s2=${ESPN_S2}; SWID=${ESPN_SWID}` : null;
  const browser = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';
  const styles = [
    { 'User-Agent': browser, Accept: 'image/avif,image/webp,image/png,image/*;q=0.8', Referer: 'https://fantasy.espn.com/' },
    { 'User-Agent': browser, Accept: 'image/*' },
    { Accept: '*/*' },
  ];
  const urls = [src.replace(/^http:\/\//i, 'https://')];

  let lastError = `Couldn't download from ${host}`;
  for (const url of urls) {
    for (const base of styles) {
      const headers = cookie ? { ...base, Cookie: cookie } : base;
      try {
        const res = await fetch(url, { headers, redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(7000) });
        const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!res.ok) { lastError = `${host} answered ${res.status}`; continue; }
        if (!type.startsWith('image/')) { lastError = `${host} didn't send an image`; continue; }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_BYTES) return { error: 'Image is over 4 MB' };
        return { buf, type };
      } catch (e) {
        lastError = e.name === 'TimeoutError' ? `${host} timed out` : `${host}: ${e.cause?.code || e.message}`;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return { error: lastError + (cookie ? '' : ' (no ESPN login cookies set)') };
}

// Saves image bytes to the public "logos" bucket and returns its URL.
export async function storeLogo(memberId, buf, type) {
  const ext = EXT[type] || 'png';
  const path = `team-${memberId}-${Date.now()}.${ext}`;
  const { error } = await db().storage.from(BUCKET).upload(path, buf, { contentType: type, upsert: true, cacheControl: '31536000' });
  if (error) throw new Error(`Storage: ${error.message}`);
  return db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Copies every ESPN logo that hasn't been saved yet (or has changed) into
// storage. Uploaded photos are left alone. Returns a short summary.
export async function mirrorLogos() {
  const members = check(
    await db().from('members').select('id, team_logo, logo_url, logo_source, logo_src_seen')
  );
  let saved = 0;
  const failed = [];
  const todo = members.filter(
    (m) => m.logo_source !== 'upload' && m.team_logo && !(m.logo_url && m.logo_src_seen === m.team_logo)
  );
  // All at once, so slow ESPN responses don't add up past the time limit.
  await Promise.all(
    todo.map(async (m) => {
      const img = await fetchImage(m.team_logo);
      if (img.error) {
        failed.push(m.id);
        check(await db().from('members').update({ logo_error: img.error }).eq('id', m.id));
        return;
      }
      try {
        const url = await storeLogo(m.id, img.buf, img.type);
        check(
          await db().from('members')
            .update({ logo_url: url, logo_source: 'espn', logo_src_seen: m.team_logo, logo_error: null })
            .eq('id', m.id)
        );
        saved += 1;
      } catch (e) {
        failed.push(m.id);
        check(await db().from('members').update({ logo_error: e.message }).eq('id', m.id));
      }
    })
  );
  return { saved, failed: failed.length };
}

export const LOGO_MAX_BYTES = MAX_BYTES;
