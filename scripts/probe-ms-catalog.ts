/**
 * DEALS-PR2.5 — verify Microsoft Display Catalog returns pricing.
 *
 * Earlier probe returned a Product object truncated at 800 chars. Dump
 * the full response and look specifically for pricing nodes.
 */
async function main(): Promise<void> {
  // Sea of Thieves bigId — known to return data
  const url = 'https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=9P2N57MC619K&market=AT&languages=de-AT&MS-CV=DGU1mcuYo0WMMp+F.1';
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Hoard probe)' },
  });
  console.log(`Status: ${res.status}`);
  const body = await res.json() as { Products?: unknown[] };

  if (!body.Products || body.Products.length === 0) {
    console.log('No products returned'); return;
  }

  const p = body.Products[0] as Record<string, unknown>;

  // Look for pricing-related paths inside the product
  const dst = p as {
    DisplaySkuAvailabilities?: Array<{
      Availabilities?: Array<{
        Markets?: string[];
        OrderManagementData?: {
          Price?: {
            ListPrice?: number;
            MSRP?: number;
            CurrencyCode?: string;
            WholesalePrice?: number;
          };
        };
        Conditions?: {
          ClientConditions?: { AllowedPlatforms?: Array<{ PlatformName?: string }> };
        };
      }>;
    }>;
  };

  console.log(`\nProduct keys: ${Object.keys(p).slice(0, 25).join(', ')}`);

  const skuAvail = dst.DisplaySkuAvailabilities ?? [];
  console.log(`\nDisplaySkuAvailabilities count: ${skuAvail.length}`);
  for (let i = 0; i < skuAvail.length && i < 3; i++) {
    const sku = skuAvail[i]!;
    const avails = sku.Availabilities ?? [];
    console.log(`  SKU ${i}: ${avails.length} availabilities`);
    for (let j = 0; j < avails.length && j < 5; j++) {
      const a = avails[j]!;
      const price = a.OrderManagementData?.Price;
      const platforms = a.Conditions?.ClientConditions?.AllowedPlatforms?.map((p) => p.PlatformName);
      console.log(`    avail ${j}: markets=${(a.Markets ?? []).join(',')}  platforms=${(platforms ?? []).join(',')}`);
      if (price) {
        console.log(`             price: list=${price.ListPrice} msrp=${price.MSRP} ${price.CurrencyCode}`);
      } else {
        console.log(`             (no Price node)`);
      }
    }
  }

  console.log('\n--- Full Product[0] dump (first 3000 chars of JSON) ---');
  console.log(JSON.stringify(p, null, 2).slice(0, 3000));
}

void main();
