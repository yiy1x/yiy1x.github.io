import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createSiteModel, entryKey, entryTitle } from './routes.mjs';
import { articleFor, briefTitleFor } from './i18n.mjs';

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

test('home ordering handles partial dates and shows later-added same-day entries first', () => {
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
  assert.deepEqual(createSiteModel(input).homeEntries.map(entry => entry.slug), ['same-day-z', 'same-day-a', 'month-only', 'year-only', 'undated']);
});

test('project manager uses separate translations and leads same-day homepage additions', () => {
  const model = createSiteModel(content);
  const project = model.entry('project-manager');
  assert.ok(project, 'Project Manager must be included');
  assert.equal(project.topic, 'projects');
  assert.equal(project.title, '项目总管');
  assert.equal(project.titleEn, 'Project Manager');
  assert.equal(model.route(entryKey(project.slug)).path, 'posts/project-manager/index.html');
  assert.equal(model.route(model.localize(entryKey(project.slug), 'en')).path, 'en/posts/project-manager/index.html');
  const update = model.orderedUpdates.find(update => update.entrySlug === project.slug);
  assert.equal(update.topicId, 'projects');
  assert.ok(update.text && update.textEn);
  assert.ok(model.homeEntries.indexOf(project) < model.homeEntries.indexOf(model.entry('health-journal')));
  const next = structuredClone(content);
  next.entries.push({ ...structuredClone(next.entries.find(entry => entry.slug === project.slug)), slug: 'next-same-day-project' });
  assert.equal(createSiteModel(next).homeEntries[0].slug, 'next-same-day-project');
});

test('projects select complete locale-specific copy while sharing identity and resource URLs', () => {
  const model = createSiteModel(content);
  for (const entry of model.content.entries.filter(entry => entry.topic !== 'papers')) {
    const chinese = articleFor(entry, 'zh-CN');
    const english = articleFor(entry, 'en');
    assert.equal(chinese.title, entry.title);
    assert.equal(english.title, entry.titleEn);
    assert.equal(chinese.summary, entry.summaryZh);
    assert.equal(english.summary, entry.summary);
    assert.equal(chinese.sections, entry.sections);
    assert.equal(english.sections, entry.sectionsEn);
    assert.equal(chinese.lang, 'zh-CN');
    assert.equal(english.lang, 'en');
    assert.deepEqual(chinese.resources.map(resource => resource.url), english.resources.map(resource => resource.url));
    assert.deepEqual(english.resources.map(resource => resource.label), entry.resources.map(resource => resource.labelEn));
    assert.equal(briefTitleFor(entry, 'en'), entry.brief?.titleEn || entry.titleEn);
    assert.ok(Object.isFrozen(entry.sectionsEn));
  }
  const paper = model.content.entries.find(entry => entry.topic === 'papers');
  assert.deepEqual(articleFor(paper, 'zh-CN'), articleFor(paper, 'en'));
  assert.equal(entryTitle(paper, 'zh-CN'), paper.originalTitle);
  assert.throws(() => articleFor(paper, 'fr'));
  assert.throws(() => entryTitle(paper, 'fr'));
  assert.throws(() => briefTitleFor(paper, 'fr'));
});

test('missing or malformed project and note translations fail before generating pages', () => {
  for (const topic of ['projects', 'notes']) {
    for (const mutate of [
      entry => { delete entry.titleEn; },
      entry => { entry.titleEn = ''; },
      entry => { delete entry.summaryZh; },
      entry => { delete entry.brief.titleEn; },
      entry => { delete entry.sectionsEn; },
      entry => { entry.sectionsEn = []; },
      entry => { entry.sectionsEn = {}; },
      entry => { entry.sectionsEn[0].title = ''; },
      entry => { entry.sectionsEn[0].items = ['']; },
      entry => { delete entry.resources[0].labelEn; },
    ]) {
      const input = structuredClone(content);
      const entry = input.entries.find(entry => entry.slug === 'health-journal');
      entry.topic = topic;
      mutate(entry);
      assert.throws(() => createSiteModel(input));
    }
  }
});

test('rendered project pages do not mix translated body text and keep locale on related links', async () => {
  const model = createSiteModel(content);
  const escape = value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  for (const entry of model.content.entries.filter(entry => entry.topic === 'projects')) {
    for (const locale of ['zh-CN', 'en']) {
      const route = model.route(model.localize(entryKey(entry.slug), locale));
      const html = await readFile(new URL(`site/${route.path}`, import.meta.url), 'utf8');
      const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/)?.[1];
      assert.ok(article, route.path);
      const own = articleFor(entry, locale);
      const other = articleFor(entry, locale === 'en' ? 'zh-CN' : 'en');
      assert.ok(html.includes(`<title>${escape(own.title)} — `), route.path);
      assert.ok(html.includes(`<meta name="description" content="${escape(own.summary)}">`), route.path);
      assert.ok(article.includes(`<h1>${escape(own.title)}</h1>`), route.path);
      assert.ok(article.includes(`<div class="article-body" lang="${locale}">`), route.path);
      const ownText = [own.summary, ...own.sections.flatMap(section => [section.title, ...(section.paragraphs || []), ...(section.items || [])]), ...own.resources.map(resource => resource.label)];
      for (const text of ownText) assert.ok(article.includes(escape(text)), `${route.path}: missing ${text}`);
      const otherText = [other.summary, ...other.sections.flatMap(section => [section.title, ...(section.paragraphs || []), ...(section.items || [])]), ...other.resources.map(resource => resource.label)];
      for (const text of otherText.filter(text => !ownText.includes(text))) assert.ok(!article.includes(escape(text)), `${route.path}: mixed locale ${text}`);
      if (locale === 'en') assert.doesNotMatch(article, /\p{Script=Han}/u, route.path);
      const navigation = html.match(/<nav class="article-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
      for (const related of model.content.entries.filter(other => other.topic === entry.topic && other.slug !== entry.slug)) {
        if (navigation.includes(`data-route-key="${model.localize(entryKey(related.slug), locale)}"`)) assert.ok(navigation.includes(escape(entryTitle(related, locale))), route.path);
      }
    }
  }
});
