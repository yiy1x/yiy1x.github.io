import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { analyticsSettings, analyticsPath, ANALYTICS_SCRIPT_URL } from './analytics.mjs';

const productionOrigin = 'https://yiy1x.github.io';
const loader = await readFile(new URL('./analytics.js', import.meta.url), 'utf8');

test('analytics is off until an account is explicitly configured', () => {
  assert.equal(analyticsSettings({ siteCode: null, productionOrigin }), null);
  assert.equal(analyticsSettings({ siteCode: 'test-account', productionOrigin }).endpoint, 'https://test-account.goatcounter.com/count');
  for (const siteCode of ['', 'bad/name', 'wrong.example', '-invalid', 'UpperCase', 123, undefined]) {
    assert.throws(() => analyticsSettings({ siteCode, productionOrigin }));
  }
  for (const origin of ['http://yiy1x.github.io', `${productionOrigin}/`, `${productionOrigin}/path`, `${productionOrigin}?query`, 'https://user:pass@example.com']) {
    assert.throws(() => analyticsSettings({ siteCode: null, productionOrigin: origin }));
  }
  assert.throws(() => analyticsSettings({ siteCode: null, productionOrigin, secret: 'not-allowed' }));
});

test('only generated paths are accepted and index aliases are consolidated', () => {
  assert.equal(analyticsPath('index.html'), '/');
  assert.equal(analyticsPath('en/index.html'), '/en/');
  assert.equal(analyticsPath('posts/ocsd/index.html'), '/posts/ocsd/');
  for (const path of ['../index.html', '/index.html', 'index.html?private=1', 'index.html#fragment', '<script>']) {
    assert.throws(() => analyticsPath(path));
  }
});

function browserFixture({ origin = productionOrigin, hash = '', privacy = {}, missingScript = false, existingTracker = false } = {}) {
  const appended = [];
  const dataset = {
    analyticsOrigin: productionOrigin,
    analyticsEndpoint: 'https://test-account.goatcounter.com/count',
    analyticsScript: ANALYTICS_SCRIPT_URL,
    analyticsPath: '/posts/ocsd/',
  };
  const context = {
    window: { location: { origin, hash, search: '?private=value' }, ...(existingTracker ? { goatcounter: {} } : {}) },
    navigator: privacy,
    document: {
      currentScript: missingScript ? null : { dataset },
      title: 'OCSD',
      referrer: 'https://example.com/private?token=value',
      createElement: () => ({ setAttribute(name, value) { this[name] = value; } }),
      head: { appendChild: element => appended.push(element) },
    },
  };
  return { context, appended };
}

test('previews, privacy preferences, opt-out and duplicate loads send no events', () => {
  const cases = [
    { origin: 'http://127.0.0.1:8877' },
    { origin: 'http://localhost:8877' },
    { origin: 'https://preview.example.com' },
    { origin: 'https://yiy1x.github.io.evil.example' },
    { hash: '#no-analytics' },
    { privacy: { doNotTrack: '1' } },
    { privacy: { globalPrivacyControl: true } },
    { missingScript: true },
    { existingTracker: true },
  ];
  for (const settings of cases) {
    const fixture = browserFixture(settings);
    runInNewContext(loader, fixture.context);
    assert.equal(fixture.appended.length, 0, JSON.stringify(settings));
  }
});

test('production loads one asynchronous tracker without query, referrer or click events', () => {
  const fixture = browserFixture();
  runInNewContext(loader, fixture.context);
  runInNewContext(loader, fixture.context);
  assert.equal(fixture.appended.length, 1);
  const tracker = fixture.appended[0];
  assert.equal(tracker.src, ANALYTICS_SCRIPT_URL);
  assert.equal(tracker.async, true);
  assert.equal(tracker.referrerPolicy, 'no-referrer');
  assert.equal(tracker['data-goatcounter'], 'https://test-account.goatcounter.com/count');
  const settings = fixture.context.window.goatcounter;
  assert.equal(settings.path, '/posts/ocsd/');
  assert.equal(settings.referrer, '');
  assert.equal(settings.no_events, true);
  assert.equal(settings.allow_local, false);
  assert.equal(settings.allow_frame, false);
  assert.equal(settings.no_session, undefined);
});

test('enabled and disabled builds validate all pages without contacting GoatCounter', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'blog-analytics-'));
  try {
    for (const filename of ['build.mjs', 'routes.mjs', 'i18n.mjs', 'content.json', 'styles.css', 'verify-site.mjs', 'analytics.mjs', 'analytics.js']) {
      await copyFile(new URL(filename, import.meta.url), join(directory, filename));
    }
    const run = filename => execFileSync(process.execPath, [join(directory, filename)], { encoding: 'utf8', timeout: 30000 });
    for (const siteCode of ['test-account', null]) {
      await writeFile(join(directory, 'analytics.json'), JSON.stringify({ siteCode, productionOrigin }));
      run('build.mjs');
      assert.match(run('verify-site.mjs'), /Validated 28 pages/);
      const home = await readFile(join(directory, 'site/index.html'), 'utf8');
      assert.equal(home.includes('<script'), siteCode !== null);
      assert.equal(home.includes('analytics-notice'), siteCode !== null);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
