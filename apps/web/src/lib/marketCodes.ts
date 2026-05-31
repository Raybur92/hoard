/**
 * DEALS-PR1 — ISO 3166-1 alpha-2 market codes for the Settings → Account
 * picker. Drives locale currency on `/deals` + Amazon storefront selection
 * (DEALS-PR3). Listed Andrea-relevant + common; clear option = null.
 *
 * Shared by SettingsDesktop + SettingsMobile so the picker offers the
 * same set on both shells.
 */
export interface MarketOption {
  code: string; // empty string = clear
  label: string;
}

export const MARKET_OPTIONS: readonly MarketOption[] = [
  { code: '', label: '— (not set)' },
  { code: 'AT', label: 'AT 🇦🇹 Austria' },
  { code: 'DE', label: 'DE 🇩🇪 Germany' },
  { code: 'IT', label: 'IT 🇮🇹 Italy' },
  { code: 'FR', label: 'FR 🇫🇷 France' },
  { code: 'ES', label: 'ES 🇪🇸 Spain' },
  { code: 'GB', label: 'GB 🇬🇧 United Kingdom' },
  { code: 'US', label: 'US 🇺🇸 United States' },
  { code: 'CA', label: 'CA 🇨🇦 Canada' },
  { code: 'AU', label: 'AU 🇦🇺 Australia' },
  { code: 'JP', label: 'JP 🇯🇵 Japan' },
];
