/**
 * DEALS-PR2.5 — deeper probe of Nintendo Europe Solr endpoint to
 * confirm pricing data shape + locale/currency handling.
 */
async function main(): Promise<void> {
  // Hollow Knight on Switch — known title, known to go on sale frequently
  const url = 'https://search.nintendo-europe.com/en/select?q=hollow+knight&fq=type:GAME%20AND%20system_type:nintendoswitch*&rows=1&wt=json';
  const res = await fetch(url);
  const data = await res.json() as { response: { docs: Record<string, unknown>[] } };
  const doc = data.response.docs[0];
  if (!doc) {
    console.log('no docs returned'); return;
  }
  console.log('Full document for Hollow Knight (Switch, EU):\n');
  console.log(JSON.stringify(doc, null, 2));

  console.log('\n\n=== Pricing-related keys present: ===');
  const priceKeys = Object.keys(doc).filter((k) =>
    k.toLowerCase().includes('price') || k.toLowerCase().includes('discount') || k.toLowerCase().includes('sale')
  );
  for (const k of priceKeys) {
    console.log(`  ${k}: ${JSON.stringify(doc[k])}`);
  }
}

void main();
