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
  input.entries.push({ ...structuredClone(template), slug: 'newest-work', publishedAt: '2099-12-31', updatedAt: '2099-12-31' });
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
  delete project.updatedAt;
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
  const newest = next.entries.find(entry => entry.slug === model.homeEntries[0].slug);
  next.entries.push({ ...structuredClone(newest), slug: 'next-same-day-project' });
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

test('news keeps latest same-day additions first without losing history or mutating content', () => {
  const input = structuredClone(content);
  input.updates = [
    { id: 'first-z', date: '2026-11-22', text: '较早添加', textEn: 'Earlier addition' },
    { id: 'second-a', date: '2026-11-22', text: '较晚添加', textEn: 'Later addition' },
    { id: 'archive-only', date: '2026-11-23', text: '仅历史', textEn: 'History only', showOnHome: false },
    { id: 'month-only', date: '2026-10', text: '月份记录', textEn: 'Month-only date' },
    { id: 'older', date: '2025-12-31', text: '旧记录', textEn: 'Older record' },
    { id: 'new-year', date: '2027-01-01', text: '跨年', textEn: 'New year' },
    { id: 'newest', date: '2027-01-02', text: '最新', textEn: 'Newest' },
  ];
  const before = structuredClone(input);
  const model = createSiteModel(input);
  assert.deepEqual(model.orderedUpdates.map(update => update.id), ['newest', 'new-year', 'archive-only', 'second-a', 'first-z', 'month-only', 'older']);
  assert.deepEqual(model.homeUpdates.map(update => update.id), ['newest', 'new-year', 'second-a', 'first-z', 'month-only']);
  assert.deepEqual(input, before);
  assert.ok(Object.isFrozen(model.orderedUpdates));
  assert.ok(Object.isFrozen(model.homeUpdates));
});

test('bilingual homepages and histories retain project news exactly once in shared order', async () => {
  const model = createSiteModel(content);
  for (const prefix of ['', 'en/']) {
    for (const page of ['index.html', 'updates/index.html']) {
      const html = await readFile(new URL(`site/${prefix}${page}`, import.meta.url), 'utf8');
      const ids = [...html.matchAll(/data-update-key="([^"]+)"/g)].map(match => match[1]);
      const expected = page === 'index.html' ? model.homeUpdates : model.orderedUpdates;
      assert.deepEqual(ids, expected.map(update => update.id));
      if (page === 'updates/index.html') {
        for (const id of ['project-manager-introduction', 'health-journal-introduction', 'personal-blog-introduction', 'health-journal-v150']) {
          assert.equal(ids.filter(existing => existing === id).length, 1);
        }
      }
    }
  }
});

test('personal blog introduces this site with shared resources and distinct language pages', () => {
  const model = createSiteModel(content);
  const entry = model.entry('personal-blog');
  assert.equal(entry.topic, 'projects');
  assert.equal(entry.title, '个人技术博客');
  assert.equal(entry.titleEn, 'Personal Technical Blog');
  assert.equal(entry.resources[0].url, 'https://github.com/yiy1x/yiy1x.github.io');
  assert.equal(model.route(entryKey(entry.slug)).path, 'posts/personal-blog/index.html');
  assert.equal(model.route(model.localize(entryKey(entry.slug), 'en')).path, 'en/posts/personal-blog/index.html');
  const update = model.orderedUpdates.find(update => update.id === 'personal-blog-introduction');
  assert.equal(update.entrySlug, entry.slug);
  assert.equal(update.topicId, 'projects');
  assert.equal(update.date, entry.publishedAt);
  assert.ok(update.text && update.textEn);
  assert.equal(entry.listPlacement, 'last');
  assert.equal(model.homeEntries.at(-1).slug, entry.slug);
  assert.equal(model.orderedEntries.filter(item => item.topic === 'projects').at(-1).slug, entry.slug);
  assert.ok(model.orderedUpdates.indexOf(update) < model.orderedUpdates.findIndex(item => item.id === 'project-manager-introduction'));
  assert.equal(update.showOnHome, false);
  assert.ok(!model.homeUpdates.includes(update));
  assert.equal(model.homeUpdates.length, 5);
  assert.equal(model.content.entries.filter(item => item.slug === entry.slug).length, 1);
  assert.equal(model.orderedUpdates.filter(item => item.id === update.id).length, 1);
});

test('last placement survives future updates while preserving other ordering and input', () => {
  const input = structuredClone(content);
  const blog = input.entries.find(entry => entry.slug === 'personal-blog');
  blog.updatedAt = '2099-12-31';
  const before = structuredClone(input);
  const model = createSiteModel(input);
  assert.deepEqual(input, before);
  const normalInput = structuredClone(input);
  normalInput.entries.find(entry => entry.slug === blog.slug).listPlacement = 'normal';
  const normal = createSiteModel(normalInput);
  assert.equal(normal.homeEntries[0].slug, blog.slug);
  for (const field of ['homeEntries', 'orderedEntries']) {
    assert.equal(model[field].at(-1).slug, blog.slug);
    assert.deepEqual(model[field].filter(entry => entry.slug !== blog.slug), normal[field].filter(entry => entry.slug !== blog.slug));
  }
  delete normalInput.entries.find(entry => entry.slug === blog.slug).listPlacement;
  assert.deepEqual(createSiteModel(normalInput).homeEntries.map(entry => entry.slug), normal.homeEntries.map(entry => entry.slug));
  for (const value of [null, '', true, 1, {}, 'first']) {
    const invalid = structuredClone(content);
    invalid.entries.find(entry => entry.slug === blog.slug).listPlacement = value;
    assert.throws(() => createSiteModel(invalid), /entry.listPlacement/);
  }
  const paperInput = structuredClone(content);
  paperInput.entries.find(entry => entry.topic === 'papers').listPlacement = 'last';
  assert.throws(() => createSiteModel(paperInput), /paperOrder/);
});

test('both languages place the blog last in lists and keep its news only in full history', async () => {
  const model = createSiteModel(content);
  for (const prefix of ['', 'en/']) {
    for (const page of ['index.html', 'archive/index.html', 'topics/projects/index.html']) {
      const html = await readFile(new URL(`site/${prefix}${page}`, import.meta.url), 'utf8');
      const keys = [...html.matchAll(/data-entry-key="([^"]+)"/g)].map(match => match[1]);
      const expected = page === 'index.html' ? model.homeEntries : page === 'archive/index.html' ? model.orderedEntries : model.orderedEntries.filter(entry => entry.topic === 'projects');
      assert.deepEqual(keys, expected.map(entry => entryKey(entry.slug)));
      assert.equal(keys.at(-1), entryKey('personal-blog'));
    }
    const homepage = await readFile(new URL(`site/${prefix}index.html`, import.meta.url), 'utf8');
    assert.ok(!homepage.includes('data-update-key="personal-blog-introduction"'));
    const history = await readFile(new URL(`site/${prefix}updates/index.html`, import.meta.url), 'utf8');
    assert.equal([...history.matchAll(/data-update-key="personal-blog-introduction"/g)].length, 1);
  }
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

test('project update dates are validated without changing original publication dates or paper priority', () => {
  const input = structuredClone(content);
  const entry = input.entries.find(entry => entry.slug === 'health-journal');
  const originalDate = entry.publishedAt;
  entry.updatedAt = '2099-01-01';
  const model = createSiteModel(input);
  assert.equal(model.entry(entry.slug).publishedAt, originalDate);
  assert.equal(model.homeEntries[0].slug, entry.slug);
  assert.deepEqual(model.orderedEntries.filter(entry => input.paperOrder.includes(entry.slug)).map(entry => entry.slug), input.paperOrder);
  for (const value of [null, '', '2026-11', '2026-02-30', '2026-11-21', 123]) {
    const invalid = structuredClone(content);
    invalid.entries.find(entry => entry.slug === 'health-journal').updatedAt = value;
    assert.throws(() => createSiteModel(invalid));
  }
  const paperInput = structuredClone(content);
  paperInput.entries.find(entry => entry.topic === 'papers').updatedAt = '2026-11-25';
  assert.throws(() => createSiteModel(paperInput));
});

test('v1.5.0 news is distinct while nearby manager maintenance is folded into its existing record', async () => {
  const model = createSiteModel(content);
  const health = model.entry('health-journal');
  const manager = model.entry('project-manager');
  assert.equal(health.publishedAt, '2026-11-22');
  assert.equal(manager.publishedAt, '2026-11-22');
  assert.equal(health.updatedAt, '2026-11-25');
  assert.equal(manager.updatedAt, '2026-11-25');
  const recent = model.orderedUpdates.find(update => update.id === 'health-journal-v150');
  assert.equal(recent.entrySlug, health.slug);
  assert.equal(recent.date, '2026-11-25');
  assert.equal(recent.topicId, 'projects');
  assert.match(recent.text, /ZIP\/XML/);
  assert.equal(model.orderedUpdates.filter(update => update.entrySlug === manager.slug).length, 1);
  const maintenance = model.orderedUpdates.find(update => update.entrySlug === manager.slug);
  assert.equal(maintenance.id, 'project-manager-introduction');
  assert.equal(maintenance.date, '2026-11-22');
  assert.match(maintenance.text, /11 月 25 日/);
  for (const [prefix, label] of [['', '更新于'], ['en/', 'Updated']]) {
    for (const slug of [health.slug, manager.slug]) {
      const html = await readFile(new URL(`site/${prefix}posts/${slug}/index.html`, import.meta.url), 'utf8');
      assert.ok(html.includes('<time datetime="2026-11-22">2026-11-22</time>'));
      assert.ok(html.includes(`${label} <time datetime="2026-11-25">2026-11-25</time>`));
    }
  }
});
