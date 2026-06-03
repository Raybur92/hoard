// Fast seed — writes Event rows only (no Game upserts, no EventGame links).
// Sufficient to populate the /events list view so the UI can be eyeballed
// before doing the full sync. Game-grid data fills in on a later sync run.

import { PrismaClient } from '@prisma/client';

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

interface IgdbRawEvent {
  id: number;
  slug?: string;
  name?: string;
  description?: string;
  start_time?: number;
  end_time?: number;
  live_stream_url?: string;
  time_zone?: string;
  event_logo?: { image_id?: string };
  event_networks?: Array<{ network_type?: { name?: string }; url?: string }>;
  videos?: Array<{ video_id?: string; name?: string }>;
}

async function getToken(): Promise<string> {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      grant_type: 'client_credentials',
    }).toString(),
  });
  if (!res.ok) throw new Error(`token: ${res.status}`);
  const j = await res.json() as { access_token: string };
  return j.access_token;
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) { console.error('TWITCH creds missing'); process.exit(1); }
  const prisma = new PrismaClient();

  console.log('[fast-seed] fetching IGDB events…');
  const token = await getToken();
  const res = await fetch('https://api.igdb.com/v4/events', {
    method: 'POST',
    headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}`, 'Content-Type': 'text/plain' },
    body: `fields name, slug, description, start_time, end_time, live_stream_url,
       time_zone, event_logo.image_id,
       event_networks.network_type.name, event_networks.url,
       videos.video_id, videos.name;
where start_time != null;
sort start_time desc;
limit 500;`,
  });
  if (!res.ok) { console.error(`events: ${res.status}`, await res.text()); process.exit(1); }
  const raws = await res.json() as IgdbRawEvent[];
  console.log(`[fast-seed] got ${raws.length} events from IGDB`);

  let written = 0, skipped = 0;
  for (const raw of raws) {
    if (!raw.start_time || !raw.slug || !raw.name) { skipped++; continue; }
    const networks = (raw.event_networks ?? []).map((n) => ({
      name: n.network_type?.name ?? 'Unknown',
      type: n.network_type?.name ?? 'Unknown',
      url: n.url ?? null,
    }));
    const videos = (raw.videos ?? []).filter((v) => !!v.video_id).map((v) => ({
      youtubeId: v.video_id!,
      name: v.name ?? null,
    }));
    const logoUrl = raw.event_logo?.image_id
      ? `https://images.igdb.com/igdb/image/upload/t_logo_med/${raw.event_logo.image_id}.jpg`
      : null;
    try {
      await prisma.event.upsert({
        where: { igdbId: raw.id },
        update: {
          slug: raw.slug, name: raw.name, description: raw.description ?? null,
          startTime: new Date(raw.start_time * 1000),
          endTime: raw.end_time ? new Date(raw.end_time * 1000) : null,
          liveStreamUrl: raw.live_stream_url ?? null,
          timeZone: raw.time_zone ?? null,
          logoUrl, networks, videos,
        },
        create: {
          igdbId: raw.id, slug: raw.slug, name: raw.name, description: raw.description ?? null,
          startTime: new Date(raw.start_time * 1000),
          endTime: raw.end_time ? new Date(raw.end_time * 1000) : null,
          liveStreamUrl: raw.live_stream_url ?? null,
          timeZone: raw.time_zone ?? null,
          logoUrl, networks, videos,
        },
      });
      written++;
    } catch (err) {
      console.error(`[fast-seed] failed for ${raw.slug}:`, err instanceof Error ? err.message : err);
      skipped++;
    }
  }
  console.log(`[fast-seed] done: ${written} written, ${skipped} skipped`);
  await prisma.$disconnect();
}

main().catch((err) => { console.error('[fast-seed] failed:', err); process.exit(1); });
