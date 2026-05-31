/**
 * GD-PR2 — preorder deep-links per platform (OQ-GD-14 option #1).
 *
 * Ships always-derivable URLs only — Steam (`steamAppId`), GOG
 * (`gogAppId`), PSN (`psnConceptId`). Xbox / Epic / Nintendo
 * deferred: their canonical store URLs need slugs we don't capture
 * yet (the storefront-slug capture workstream is in PAGES_PLAN §3.6).
 *
 * Hidden entirely when no preorder-able IDs exist on the Game.
 */

import type { GameDetailGameInfo } from '@hoard/types';
import { Marker } from '../../primitives/Marker';

interface Props {
  game: GameDetailGameInfo;
}

interface PreorderLink {
  shop: string;
  url: string;
}

function buildLinks(game: GameDetailGameInfo): PreorderLink[] {
  const links: PreorderLink[] = [];
  if (game.steamAppId) {
    links.push({ shop: 'steam', url: `https://store.steampowered.com/app/${game.steamAppId}` });
  }
  if (game.gogAppId) {
    // GOG's canonical URL is /game/<slug>; ID-only redirects through
    // their search but reliably lands on the product page.
    links.push({ shop: 'gog', url: `https://www.gog.com/en/games?query=${game.gogAppId}` });
  }
  if (game.psnConceptId) {
    links.push({ shop: 'playstation', url: `https://store.playstation.com/concept/${game.psnConceptId}` });
  }
  return links;
}

export function PreorderLinks({ game }: Props) {
  const links = buildLinks(game);
  if (links.length === 0) return null;

  return (
    <section className="panel" style={{ padding: 16, marginTop: 24, maxWidth: 1100 }}>
      <Marker>// preorder</Marker>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
        {links.map((l) => (
          <a
            key={l.shop}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn sm"
            style={{ textDecoration: 'none' }}
          >
            {l.shop} →
          </a>
        ))}
      </div>
    </section>
  );
}
