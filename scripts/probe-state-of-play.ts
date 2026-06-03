// Probe IGDB directly for the State of Play 2026-06 event to verify
// whether the empty games array is real or whether our query is wrong.

async function main() {
  const CLIENT_ID = process.env.TWITCH_CLIENT_ID!;
  const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET!;

  // Get token
  const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    }).toString(),
  });
  const { access_token: token } = await tokenRes.json() as { access_token: string };

  // Look up State of Play events
  const slugCandidates = [
    'state-of-play-2026-06',
    'state-of-play-june-2026',
    'state-of-play-2026',
  ];

  for (const slug of slugCandidates) {
    console.log(`\n--- slug: ${slug} ---`);
    const res = await fetch('https://api.igdb.com/v4/events', {
      method: 'POST',
      headers: {
        'Client-ID': CLIENT_ID,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body: `fields id, name, slug, start_time, end_time, games;
where slug = "${slug}";`,
    });
    const data = await res.json() as Array<{
      id: number; name: string; slug: string;
      start_time: number; end_time?: number;
      games?: number[];
    }>;
    if (data.length === 0) {
      console.log('  (slug not found in IGDB)');
      continue;
    }
    for (const e of data) {
      console.log(`  id=${e.id} name="${e.name}"`);
      console.log(`  start=${new Date(e.start_time * 1000).toISOString()}`);
      console.log(`  games=${JSON.stringify(e.games ?? [])}`);
      console.log(`  games count: ${(e.games ?? []).length}`);
    }
  }

  // Also search by name to catch any State of Play we might have missed
  console.log('\n--- search by name "State of Play" sorted by start desc ---');
  const searchRes = await fetch('https://api.igdb.com/v4/events', {
    method: 'POST',
    headers: {
      'Client-ID': CLIENT_ID,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body: `fields id, name, slug, start_time, games;
where name ~ *"State of Play"*;
sort start_time desc;
limit 5;`,
  });
  const search = await searchRes.json() as Array<{
    id: number; name: string; slug: string; start_time: number; games?: number[];
  }>;
  for (const e of search) {
    console.log(`  ${e.slug} · "${e.name}" · ${new Date(e.start_time * 1000).toISOString()} · games=${(e.games ?? []).length}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
