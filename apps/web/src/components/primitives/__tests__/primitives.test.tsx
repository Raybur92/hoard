import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Icon } from '../Icon';
import { StatusSigil } from '../StatusSigil';
import { Plat } from '../Plat';
import { Cover } from '../Cover';
import { Hr } from '../Hr';
import { Marker } from '../Marker';
import { Chip } from '../Chip';
import { Btn } from '../Btn';
import { KV } from '../KV';
import { Gauge } from '../Gauge';
import { HypeBars } from '../HypeBars';
import { Heatmap } from '../Heatmap';
import { Barcode } from '../Barcode';

describe('Icon', () => {
  it('renders without throwing', () => {
    const { container } = render(<Icon name="star" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders all icon names without throwing', () => {
    const names = ['star','starF','play','bell','plus','cmd','cog','arrowR','arrowD',
      'search','menu','check','x','pause','circle','dotO','back','caret','battery','bolt'] as const;
    names.forEach(name => {
      const { container } = render(<Icon name={name} />);
      expect(container.querySelector('svg')).toBeTruthy();
    });
  });

  it('applies custom size', () => {
    const { container } = render(<Icon name="star" size={24} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('24');
  });
});

describe('StatusSigil', () => {
  it('renders all statuses without throwing', () => {
    const statuses = ['Playing', 'Backlog', 'Completed', 'On Hold', 'Dropped', 'Wishlist'] as const;
    statuses.forEach(status => {
      const { container } = render(<StatusSigil status={status} />);
      expect(container.querySelector('.status-sigil')).toBeTruthy();
    });
  });

  it('shows label by default', () => {
    render(<StatusSigil status="Playing" />);
    expect(screen.getByText('Playing')).toBeTruthy();
  });

  it('hides label when label=false', () => {
    const { queryByText } = render(<StatusSigil status="Playing" label={false} />);
    expect(queryByText('Playing')).toBeNull();
  });
});

describe('Plat', () => {
  it('renders platform code', () => {
    render(<Plat code="ST" />);
    expect(screen.getByText('ST')).toBeTruthy();
  });

  it('applies lg class', () => {
    const { container } = render(<Plat code="PS" lg />);
    expect(container.querySelector('.plat.lg')).toBeTruthy();
  });
});

describe('Cover', () => {
  it('renders placeholder when no src', () => {
    const { container } = render(<Cover w={100} h={140} label="Test Game" />);
    expect(container.querySelector('.cover-ph')).toBeTruthy();
  });

  it('renders img when src provided', () => {
    const { container } = render(<Cover w={100} h={140} src="https://example.com/img.jpg" label="Test" />);
    expect(container.querySelector('img')).toBeTruthy();
  });

  it('applies bright class', () => {
    const { container } = render(<Cover w={100} h={140} bright />);
    expect(container.querySelector('.cover-ph.bright')).toBeTruthy();
  });

  it('sets loading="lazy", decoding="async", and intrinsic dimensions on the img (F7)', () => {
    const { container } = render(
      <Cover w={84} h={112} src="https://example.com/img.jpg" label="Test" />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.getAttribute('decoding')).toBe('async');
    expect(img?.getAttribute('width')).toBe('84');
    expect(img?.getAttribute('height')).toBe('112');
  });

  it('downscales IGDB cover URLs to t_cover_small for mobile-sized covers (F7)', () => {
    const { container } = render(
      <Cover
        w={84}
        h={112}
        src="https://images.igdb.com/igdb/image/upload/t_cover_big/co5l9p.jpg"
        label="Test"
      />,
    );
    expect(container.querySelector('img')?.src).toContain('t_cover_small');
  });

  it('keeps t_cover_big for desktop-sized covers (F7)', () => {
    const { container } = render(
      <Cover
        w={130}
        h={174}
        src="https://images.igdb.com/igdb/image/upload/t_cover_big/co5l9p.jpg"
        label="Test"
      />,
    );
    expect(container.querySelector('img')?.src).toContain('t_cover_big');
  });

  it('passes non-IGDB src through unchanged', () => {
    const url = 'https://example.com/img.jpg';
    const { container } = render(<Cover w={84} h={112} src={url} label="Test" />);
    expect(container.querySelector('img')?.src).toBe(url);
  });
});

describe('Hr', () => {
  it('renders dot divider by default', () => {
    const { container } = render(<Hr />);
    expect(container.querySelector('.hr-dot')).toBeTruthy();
  });

  it('renders each kind', () => {
    const kinds = ['dot', 'dash', 'solid', 'double'] as const;
    kinds.forEach(kind => {
      const { container } = render(<Hr kind={kind} />);
      expect(container.querySelector(`.hr-${kind}`)).toBeTruthy();
    });
  });
});

describe('Marker', () => {
  it('renders children', () => {
    render(<Marker>now playing</Marker>);
    expect(screen.getByText('now playing')).toBeTruthy();
  });

  it('has marker class', () => {
    const { container } = render(<Marker>test</Marker>);
    expect(container.querySelector('.marker')).toBeTruthy();
  });
});

describe('Chip', () => {
  it('renders children', () => {
    render(<Chip>Backlog</Chip>);
    expect(screen.getByText('Backlog')).toBeTruthy();
  });

  it('applies on class when on=true', () => {
    const { container } = render(<Chip on>Active</Chip>);
    expect(container.querySelector('.chip.on')).toBeTruthy();
  });

  it('applies tone class', () => {
    const { container } = render(<Chip tone="amber">Wishlist</Chip>);
    expect(container.querySelector('.chip.amber')).toBeTruthy();
  });
});

describe('Btn', () => {
  it('renders children', () => {
    render(<Btn>Click me</Btn>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeTruthy();
  });

  it('applies primary variant', () => {
    const { container } = render(<Btn variant="primary">Go</Btn>);
    expect(container.querySelector('.btn.primary')).toBeTruthy();
  });

  it('applies sm class', () => {
    const { container } = render(<Btn sm>Small</Btn>);
    expect(container.querySelector('.btn.sm')).toBeTruthy();
  });
});

describe('KV', () => {
  it('renders key-value pairs', () => {
    render(<KV rows={[['Status', 'Playing'], ['Rating', '8']]} />);
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('Playing')).toBeTruthy();
  });
});

describe('Gauge', () => {
  it('renders correct number of segments', () => {
    const { container } = render(<Gauge total={5} filled={3} />);
    expect(container.querySelectorAll('.seg')).toHaveLength(5);
  });

  it('fills correct number of segments', () => {
    const { container } = render(<Gauge total={5} filled={3} tone="green" />);
    expect(container.querySelectorAll('.seg.green')).toHaveLength(3);
  });
});

describe('HypeBars', () => {
  it('renders 5 segments', () => {
    const { container } = render(<HypeBars n={3} />);
    expect(container.querySelectorAll('.seg')).toHaveLength(5);
  });

  it('clamps to 0–5', () => {
    const { container: c1 } = render(<HypeBars n={-1} />);
    expect(c1.querySelectorAll('.seg.amber')).toHaveLength(0);

    const { container: c2 } = render(<HypeBars n={10} />);
    expect(c2.querySelectorAll('.seg.amber')).toHaveLength(5);
  });
});

describe('Heatmap', () => {
  it('renders without throwing', () => {
    const { container } = render(<Heatmap />);
    expect(container.querySelectorAll('.heat-cell').length).toBeGreaterThan(0);
  });

  it('renders weeks × days cells', () => {
    const { container } = render(<Heatmap weeks={4} days={7} />);
    expect(container.querySelectorAll('.heat-cell')).toHaveLength(28);
  });
});

describe('Barcode', () => {
  it('renders without throwing', () => {
    const { container } = render(<Barcode />);
    expect(container.querySelector('.barcode')).toBeTruthy();
  });

  it('renders custom code label', () => {
    render(<Barcode code="TEST-0001" />);
    expect(screen.getByText('TEST-0001')).toBeTruthy();
  });
});
