import 'server-only';
import { db, check } from './db';

const BUCKET = 'logos';
const MAX_BYTES = 4 * 1024 * 1024;
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif' };

// Downloads an image from ESPN (or wherever a logo link points), trying
// https first and sending ESPN login cookies when they're configured.
export async function fetchImage(src) {
  if (!src || !/^https?:\/\//i.test(src)) return { error: 'No logo link' };
  const { ESPN_S2, ESPN_SWID } = process.env;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36',
    Accept: 'image/avif,image/webp,image/png,image/*;q=0.8',
    Referer: 'https://fantasy.espn.com/',
  };
  if (ESPN_S2 && ESPN_SWID && /espn/i.test(new URL(src).host)) headers.Cookie = `espn_s2=${ESPN_S2}; SWID=${ESPN_SWID}`;

  let lastError = 'Could not download';
  for (const url of [...new Set([src.replace(/^http:\/\//i, 'https://'), src])]) {
    try {
      const res = await fetch(url, { headers, redirect: 'follow', cache: 'no-store' });
      const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!res.ok) { lastError = `ESPN answered ${res.status}`; continue; }
      if (!type.startsWith('image/')) { lastError = 'Link is not an image'; continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) { lastError = 'Image is over 4 MB'; continue; }
      return { buf, type };
    } catch (e) {
      lastError = `Download failed (${e.cause?.code || e.message})`;
    }
  }
  return { error: lastError };
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
  for (const m of members) {
    if (m.logo_source === 'upload') continue;
    if (!m.team_logo) continue;
    if (m.logo_url && m.logo_src_seen === m.team_logo) continue;
    const img = await fetchImage(m.team_logo);
    if (img.error) {
      failed.push(m.id);
      check(await db().from('members').update({ logo_error: img.error }).eq('id', m.id));
      continue;
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
  }
  return { saved, failed: failed.length };
}

export const LOGO_MAX_BYTES = MAX_BYTES;
