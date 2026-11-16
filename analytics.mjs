export const ANALYTICS_PRIVACY_URL = 'https://www.goatcounter.com/help/privacy';
export const ANALYTICS_SCRIPT_URL = 'https://gc.zgo.at/count.js';

export function analyticsSettings(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid analytics configuration');
  if (Object.keys(config).some(key => !['siteCode', 'productionOrigin'].includes(key))) throw new Error('Unknown analytics configuration field');
  const origin = new URL(config.productionOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== config.productionOrigin) throw new Error('Analytics requires an exact HTTPS production origin');
  if (config.siteCode === null) return null;
  if (typeof config.siteCode !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(config.siteCode)) throw new Error('Invalid GoatCounter site code');
  return Object.freeze({ origin: origin.origin, endpoint: `https://${config.siteCode}.goatcounter.com/count` });
}

export function analyticsPath(path) {
  if (typeof path !== 'string' || !/^(?:[a-z0-9-]+\/)*index\.html$/.test(path)) throw new Error('Analytics requires a generated page path');
  return `/${path.replace(/index\.html$/, '')}`;
}
