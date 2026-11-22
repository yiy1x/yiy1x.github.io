import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createSiteModel, entryKey } from './routes.mjs';

const content = JSON.parse(await readFile(new URL('./content.json', import.meta.url), 'utf8'));

test('friend links resolve through the global registry without mutating input', () => {
  const input = structuredClone(content);
  input.links['test-friend'] = 'https://example.org/';
  input.friendLinks = [{ label: 'A & B', urlKey: 'test-friend' }];
  const model = createSiteModel(input);
  assert.equal(model.content.friendLinks[0].url, 'https://example.org/');
  assert.equal(input.friendLinks[0].url, undefined);
  assert.ok(Object.isFrozen(model.content.friendLinks[0]));
  delete input.friendLinks;
  assert.deepEqual(createSiteModel(input).content.friendLinks, []);
  input.friendLinks = [];
  assert.deepEqual(createSiteModel(input).content.friendLinks, []);
});

test('friend links reject malformed, duplicate, unsafe and unregistered references', () => {
  const input = structuredClone(content);
  input.links['test-friend'] = 'https://example.org/';
  for (const friendLinks of [
    null,
    {},
    [null],
    [{ label: '', urlKey: 'test-friend' }],
    [{ label: 'Friend', urlKey: 'missing-friend' }],
    [{ label: 'Friend', url: 'https://example.org/' }],
    [{ label: 'Friend', urlKey: 'test-friend' }, { label: 'Again', urlKey: 'test-friend' }],
  ]) {
    assert.throws(() => createSiteModel({ ...input, friendLinks }));
  }
  input.friendLinks = [{ label: 'Friend', urlKey: 'test-friend' }];
  input.links['test-friend'] = 'javascript:alert(1)';
  assert.throws(() => createSiteModel(input));
});

test('health journal uses shared bilingual routes and project news without changing paper priority', () => {
  const model = createSiteModel(content);
  assert.equal(model.entry('health-journal').topic, 'projects');
  assert.equal(model.route(entryKey('health-journal')).path, 'posts/health-journal/index.html');
  assert.equal(model.route(model.localize(entryKey('health-journal'), 'en')).path, 'en/posts/health-journal/index.html');
  const update = model.orderedUpdates.find(item => item.id === 'health-journal-introduction');
  assert.equal(update.entrySlug, 'health-journal');
  assert.equal(update.topicId, 'projects');
  assert.ok(update.text && update.textEn);
  assert.notEqual(update.showOnHome, false);
  assert.deepEqual(model.orderedEntries.filter(entry => content.paperOrder.includes(entry.slug)).map(entry => entry.slug), content.paperOrder);
});

test('home entries put recent work first independently of the pinned paper order', () => {
  const input = structuredClone(content);
  const template = input.entries.find(entry => entry.topic === 'projects');
  input.entries.push({ ...structuredClone(template), slug: 'newest-work', publishedAt: '2099-12-31' });
  const before = structuredClone(input);
  const model = createSiteModel(input);
  assert.equal(model.homeEntries[0].slug, 'newest-work');
  assert.equal(model.orderedEntries[0].slug, input.paperOrder[0]);
  assert.deepEqual(input, before);
  assert.ok(Object.isFrozen(model.homeEntries));
  assert.deepEqual(model.orderedEntries.filter(entry => input.paperOrder.includes(entry.slug)).map(entry => entry.slug), input.paperOrder);
});

test('home ordering handles tied, partial and missing dates deterministically', () => {
  const input = structuredClone(content);
  const project = input.entries.find(entry => entry.topic === 'projects');
  const paper = input.entries.find(entry => entry.topic === 'papers');
  input.entries = [
    { ...structuredClone(project), slug: 'undated', publishedAt: null },
    { ...structuredClone(project), slug: 'same-day-z', publishedAt: '2026-11-22' },
    { ...structuredClone(paper), slug: 'year-only', publishedAt: null, publication: { status: 'preprint', year: 2026 } },
    { ...structuredClone(paper), slug: 'month-only', publishedAt: null, publication: { status: 'preprint', year: 2026, month: 10 } },
    { ...structuredClone(project), slug: 'same-day-a', publishedAt: '2026-11-22' },
  ];
  input.paperOrder = ['year-only', 'month-only'];
  input.featuredEntry = null;
  input.updates = [];
  const expected = ['same-day-a', 'same-day-z', 'month-only', 'year-only', 'undated'];
  assert.deepEqual(createSiteModel(input).homeEntries.map(entry => entry.slug), expected);
  input.entries.reverse();
  assert.deepEqual(createSiteModel(input).homeEntries.map(entry => entry.slug), expected);
});
