import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSiteModel, LOCALES, PAGE_KEYS } from './routes.mjs';
import { copyFor } from './i18n.mjs';
import { analyticsSettings, analyticsPath, ANALYTICS_PRIVACY_URL, ANALYTICS_SCRIPT_URL } from './analytics.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const site = resolve(root, 'site');
const model = createSiteModel(JSON.parse(await readFile(resolve(root, 'content.json'), 'utf8')));
const analytics = analyticsSettings(JSON.parse(await readFile(resolve(root, 'analytics.json'), 'utf8')));
const pages = new Map();
const idsByPath = new Map();
for (const route of model.routes) {
  const html = await readFile(resolve(site, route.path), 'utf8');
  pages.set(route.path, html);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  idsByPath.set(route.path, new Set(ids));
  assert.equal(ids.length, new Set(ids).size, `${route.path}: duplicate IDs`);
}
for (const route of model.routes) {
  const html = pages.get(route.path);
  assert.ok(html.includes(`data-page-key="${route.key}"`), route.path);
  assert.ok(html.includes(`<html lang="${route.locale}"`), route.path);
  assert.equal((html.match(/<h1\b/g) || []).length, 1, route.path);
  const friends = html.match(/<aside class="side-block friend-links"[^>]*>([\s\S]*?)<\/aside>/)?.[1];
  if (model.content.friendLinks.length) {
    assert.ok(friends, route.path);
    assert.ok(friends.includes(`<h2 id="friend-links-heading">${copyFor(route.locale).friendLinks}</h2>`), route.path);
    assert.ok(html.indexOf('id="about-heading"') < html.indexOf('id="friend-links-heading"'), route.path);
    const escaped = value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
    assert.deepEqual([...friends.matchAll(/<a href="([^"]+)">([^<]*)<\/a>/g)].map(match => [match[1], match[2]]), model.content.friendLinks.map(friend => [escaped(friend.url), escaped(friend.label)]), route.path);
  } else {
    assert.equal(friends, undefined, route.path);
  }
  assert.ok(!/127\.0\.0\.1|localhost|\/Users\/|file:\/\/|noindex|openreview\.net|orcid\.org/i.test(html), route.path);
  const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  if (analytics) {
    const path = model.route(model.localize(route.key, route.locale)).path;
    assert.deepEqual(scripts, [`<script defer src="${model.asset(route.key, 'analytics.js')}" data-analytics-origin="${analytics.origin}" data-analytics-endpoint="${analytics.endpoint}" data-analytics-script="${ANALYTICS_SCRIPT_URL}" data-analytics-path="${analyticsPath(path)}"></script>`], route.path);
    assert.ok(html.includes(`href="${ANALYTICS_PRIVACY_URL}"`), route.path);
    assert.ok(html.includes('class="analytics-notice"'), route.path);
  } else {
    assert.equal(scripts.length, 0, route.path);
    assert.ok(!html.includes('class="analytics-notice"'), route.path);
  }
  const navigation = html.match(/<nav class="topic-navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(navigation, route.path);
  assert.deepEqual([...navigation.matchAll(/data-route-key="([^"]+)"/g)].map(match => match[1]), model.navigationFor(route.locale));
  for (const locale of LOCALES) {
    assert.ok(html.includes(`hreflang="${locale}" href="${model.href(route.key, model.localize(route.key, locale))}"`), route.path);
  }
  for (const base of ['https://yiy1x.github.io/', 'https://yiy1x.github.io/example-blog/']) {
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const reference = match[1].replaceAll('&amp;', '&');
      if (/^https?:\/\//.test(reference)) continue;
      assert.ok(!/^(?:\/|[a-z][a-z0-9+.-]*:)/i.test(reference), reference);
      const url = new URL(reference, new URL(route.path, base));
      const basePath = new URL(base).pathname;
      assert.ok(url.pathname.startsWith(basePath), reference);
      const relativePath = decodeURIComponent(url.pathname.slice(basePath.length));
      const target = resolve(site, relativePath);
      assert.ok(target.startsWith(`${site}${sep}`), reference);
      assert.ok((await stat(target)).isFile(), `${route.path}: ${reference}`);
      if (url.hash) assert.ok(idsByPath.get(relativePath)?.has(decodeURIComponent(url.hash.slice(1))), reference);
    }
  }
  const news = [...html.matchAll(/data-update-key="([^"]+)"/g)].map(match => match[1]);
  if (route.kind === 'home') {
    assert.deepEqual(news, model.homeUpdates.map(update => update.id));
    if (model.orderedUpdates.length) assert.ok(html.includes(`data-route-key="${model.localize(PAGE_KEYS.UPDATES, route.locale)}"`));
  } else if (route.kind === 'updates') {
    assert.deepEqual(news, model.orderedUpdates.map(update => update.id));
  } else {
    assert.equal(news.length, 0);
  }
  if (['home', 'archive'].includes(route.kind) || route.kind === 'topic') {
    const entries = route.kind === 'home' ? model.homeEntries : model.orderedEntries;
    const expected = entries.filter(entry => route.kind !== 'topic' || entry.topic === route.topicId).map(entry => `entry:${entry.slug}`);
    assert.deepEqual([...html.matchAll(/data-entry-key="([^"]+)"/g)].map(match => match[1]), expected);
  }
}
assert.equal(await readFile(resolve(site, 'robots.txt'), 'utf8'), 'User-agent: *\nAllow: /\n');
console.log(`Validated ${pages.size} pages, bilingual routes, news, paper order, and all internal links.`);
