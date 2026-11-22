import { readFile, writeFile, mkdir, readdir, lstat, mkdtemp, rename, rm } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSiteModel, PAGE_KEYS, LOCALES, topicKey, entryKey, entryTitle, safeUrl } from './routes.mjs';
import { copyFor, summaryFor, articleFor, briefTitleFor } from './i18n.mjs';
import { analyticsSettings, analyticsPath, ANALYTICS_PRIVACY_URL, ANALYTICS_SCRIPT_URL } from './analytics.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const output = resolve(root, 'site');
const model = createSiteModel(JSON.parse(await readFile(resolve(root, 'content.json'), 'utf8')));
const { content } = model;
const analytics = analyticsSettings(JSON.parse(await readFile(resolve(root, 'analytics.json'), 'utf8')));

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function externalLink(url, label) {
  return `<a href="${escapeHtml(safeUrl(url))}">${escapeHtml(label)}</a>`;
}

function link(fromKey, toKey, label, className = '', indicateCurrent = false) {
  const targetKey = model.localize(toKey, model.route(fromKey).locale);
  const current = indicateCurrent ? model.current(fromKey, targetKey) : null;
  return `<a href="${escapeHtml(model.href(fromKey, targetKey))}" data-route-key="${escapeHtml(targetKey)}"${className ? ` class="${className}"` : ''}${current ? ` aria-current="${current}"` : ''}>${escapeHtml(label)}</a>`;
}

function topicLabels(topicId, locale) {
  const topic = model.topic(topicId);
  return locale === 'en' ? topic.en : topic;
}

function languageSwitcher(pageKey) {
  const { locale } = model.route(pageKey);
  return `<nav class="language-switch" aria-label="${copyFor(locale).language}">${LOCALES.map(language => {
    const targetKey = model.localize(pageKey, language);
    return `<a href="${escapeHtml(model.href(pageKey, targetKey))}" data-route-key="${escapeHtml(targetKey)}" lang="${language}" hreflang="${language}"${locale === language ? ' aria-current="page"' : ''}>${language === 'en' ? 'English' : '中文'}</a>`;
  }).join('<span aria-hidden="true">/</span>')}</nav>`;
}

function navigation(pageKey) {
  const { locale } = model.route(pageKey);
  const labels = copyFor(locale);
  return `<nav class="topic-navigation" aria-label="${labels.browseTopics}"><ul>${model.navigation.map(key => {
    const label = key === PAGE_KEYS.HOME ? labels.home : key === PAGE_KEYS.ARCHIVE ? labels.archive : topicLabels(model.route(key).topicId, locale).name;
    return `<li>${link(pageKey, key, label, '', true)}</li>`;
  }).join('')}</ul></nav>`;
}

function updateList(updates, pageKey) {
  const { locale } = model.route(pageKey);
  const labels = copyFor(locale);
  return `<ul class="update-list">${updates.map(update => {
    const text = locale === 'en' ? update.textEn : update.text;
    const message = update.entrySlug ? link(pageKey, entryKey(update.entrySlug), text) : update.url ? externalLink(update.url, text) : escapeHtml(text);
    const category = update.topicId ? link(pageKey, topicKey(update.topicId), topicLabels(update.topicId, locale).name) : labels.generalUpdate;
    return `<li data-update-key="${escapeHtml(update.id)}"><p><span class="update-topic">${category}<span aria-hidden="true"> · </span></span>${message}</p><time datetime="${escapeHtml(update.date)}">${escapeHtml(update.date.replaceAll('-', '.'))}</time></li>`;
  }).join('')}</ul>`;
}

function recentUpdates(pageKey) {
  const labels = copyFor(model.route(pageKey).locale);
  return model.route(pageKey).kind === 'home' && model.orderedUpdates.length ? `<aside class="updates" aria-labelledby="updates-heading"><div class="updates-heading"><h2 id="updates-heading">${labels.updates}</h2>${link(pageKey, PAGE_KEYS.UPDATES, labels.moreUpdates, 'updates-more')}</div>${model.homeUpdates.length ? updateList(model.homeUpdates, pageKey) : `<p>${labels.homeUpdatesEmpty}</p>`}</aside>` : '';
}

function allUpdates(pageKey) {
  const years = new Map();
  for (const update of model.orderedUpdates) {
    const year = update.date.slice(0, 4);
    if (!years.has(year)) years.set(year, []);
    years.get(year).push(update);
  }
  return `<div class="updates-archive">${[...years].map(([year, updates]) => `<section aria-labelledby="updates-${year}"><h2 id="updates-${year}">${year}</h2>${updateList(updates, pageKey)}</section>`).join('')}</div>`;
}

function page({ pageKey, title, body, description }) {
  const route = model.route(pageKey);
  const labels = copyFor(route.locale);
  const name = route.locale === 'en' ? content.name : content.nameZh;
  const siteTitle = route.locale === 'en' ? content.titleEn : content.title;
  const friends = content.friendLinks.length ? `<aside class="side-block friend-links" aria-labelledby="friend-links-heading"><h2 id="friend-links-heading">${labels.friendLinks}</h2><ul>${content.friendLinks.map(friend => `<li>${externalLink(friend.url, friend.label)}</li>`).join('')}</ul></aside>` : '';
  const canonicalPath = model.route(model.localize(pageKey, route.locale)).path;
  const analyticsTag = analytics ? `<script defer src="${escapeHtml(model.asset(pageKey, 'analytics.js'))}" data-analytics-origin="${escapeHtml(analytics.origin)}" data-analytics-endpoint="${escapeHtml(analytics.endpoint)}" data-analytics-script="${ANALYTICS_SCRIPT_URL}" data-analytics-path="${analyticsPath(canonicalPath)}"></script>` : '';
  return `<!doctype html>
<html lang="${route.locale}" data-page-key="${escapeHtml(pageKey)}" data-content-key="${escapeHtml(route.pageKey)}"${route.topicId ? ` data-topic-key="${escapeHtml(model.localize(topicKey(route.topicId), route.locale))}"` : ''}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)} — ${escapeHtml(siteTitle)}</title>
  <link rel="stylesheet" href="${escapeHtml(model.asset(pageKey, 'styles.css'))}">
  ${route.canonicalKey ? `<link rel="canonical" href="${escapeHtml(model.href(pageKey, model.localize(pageKey, route.locale)))}">` : ''}
  ${LOCALES.map(locale => `<link rel="alternate" hreflang="${locale}" href="${escapeHtml(model.href(pageKey, model.localize(pageKey, locale)))}">`).join('\n  ')}
  ${analyticsTag}
</head>
<body${route.kind === 'home' ? ' class="home-page"' : ''}>
  <a class="skip" href="#content">${labels.skip}</a>
  <div class="shell">
    <header class="masthead">
      ${link(pageKey, PAGE_KEYS.HOME, siteTitle, 'site-title', true)}
      <div class="header-tools">${languageSwitcher(pageKey)}<a class="external" href="${escapeHtml(safeUrl(content.github))}">GitHub</a></div>
    </header>
    ${navigation(pageKey)}
    <div class="layout">
      ${recentUpdates(pageKey)}
      <main id="content" tabindex="-1">${body}</main>
      <div class="sidebar">
        <aside class="side-block about" aria-labelledby="about-heading">
          <h2 id="about-heading">${labels.about}</h2>
          <p>${escapeHtml(name)} · ${labels.affiliation}</p>
          <p class="muted">${labels.aboutBody}</p>
          <p class="profile-links">${externalLink(content.github, 'GitHub')}</p>
        </aside>
        ${friends}
      </div>
    </div>
    <footer class="footer"><p>${escapeHtml(siteTitle)}</p>${analytics ? `<p class="analytics-notice">${labels.analyticsNotice} ${externalLink(ANALYTICS_PRIVACY_URL, labels.analyticsPrivacy)}</p>` : ''}</footer>
  </div>
</body>
</html>
`;
}

function metadata(entry, pageKey) {
  const { locale } = model.route(pageKey);
  return `<div class="article-meta">${copyFor(locale).category}${link(pageKey, topicKey(entry.topic), topicLabels(entry.topic, locale).name)}${entry.publishedAt ? `　<time datetime="${entry.publishedAt}">${entry.publishedAt}</time>` : ''}</div>`;
}

function publicationDetails(entry) {
  if (entry.topic !== 'papers' || !entry.publication) return '';
  const { status, venue, year, url } = entry.publication;
  const label = status === 'accepted' ? `Accepted by ${venue}` : status === 'published' ? `Published in ${venue}` : `Preprint${venue ? ` on ${venue}` : ''}`;
  return `<p class="publication-status" lang="en">${escapeHtml(label)}${year ? ` (${year})` : ''}${url ? ` — ${externalLink(url, 'Paper')}` : ''}</p>`;
}

function authorLine(entry) {
  if (entry.topic !== 'papers') return '';
  const authors = entry.authors.map(author => {
    const name = author.isSelf ? `<strong>${escapeHtml(author.name)}</strong>` : escapeHtml(author.name);
    const markers = `${author.equalContribution ? '<sup title="Equal contribution">*</sup>' : ''}${author.corresponding ? '<sup title="Corresponding author">†</sup>' : ''}`;
    return `<span class="author-name">${name}${markers}</span>`;
  }).join(', ');
  return `<div class="paper-authors" lang="en"><p class="author-list">${authors}</p></div>`;
}

function entryList(entries, pageKey, showTopic = true) {
  const { locale } = model.route(pageKey);
  return `<ul class="entry-list">${entries.map(entry => {
    const summary = summaryFor(entry, locale);
    return `<li data-entry-key="${entryKey(entry.slug)}">${showTopic ? `<span class="entry-type">${escapeHtml(topicLabels(entry.topic, locale).name)}</span>` : ''}<span${entry.topic === 'papers' ? ' lang="en"' : ''}>${link(pageKey, entryKey(entry.slug), entryTitle(entry, locale), 'entry-title')}</span>${authorLine(entry)}${publicationDetails(entry)}<p class="entry-summary" lang="${summary.lang}">${escapeHtml(summary.text)}</p>${entry.topic === 'papers' && entry.resources.length ? `<p class="paper-resources" lang="en">${entry.resources.map(resource => externalLink(resource.url, resource.label)).join(' · ')}</p>` : ''}</li>`;
  }).join('')}</ul>`;
}

function overviewList(pageKey) {
  const { locale } = model.route(pageKey);
  return `<ul class="overview-list">${model.homeEntries.map(entry => {
    const summary = entry.brief ? { text: locale === 'en' ? entry.brief.summary : entry.brief.summaryZh, lang: locale } : summaryFor(entry, locale);
    return `<li data-entry-key="${entryKey(entry.slug)}"><h2>${link(pageKey, entryKey(entry.slug), briefTitleFor(entry, locale))}</h2><p lang="${summary.lang}">${escapeHtml(summary.text)}</p></li>`;
  }).join('')}</ul>`;
}

const pages = new Map();
function addPage(pageKey, title, body, description) {
  pages.set(model.route(pageKey).path, page({ pageKey, title, body, description }));
}

for (const locale of LOCALES) {
  const labels = copyFor(locale);
  const homeKey = model.localize(PAGE_KEYS.HOME, locale);
  const archiveKey = model.localize(PAGE_KEYS.ARCHIVE, locale);
  const updatesKey = model.localize(PAGE_KEYS.UPDATES, locale);
  addPage(homeKey, labels.home, `<h1>${labels.overview}</h1><p class="page-intro">${labels.overviewIntro}</p>
  ${content.entries.length ? overviewList(homeKey) : `<p>${labels.empty}</p>`}
  <p class="all-content">${link(homeKey, PAGE_KEYS.ARCHIVE, `${labels.archive} »`)}</p>`, labels.homeDescription);

  addPage(archiveKey, labels.archive, `<p class="breadcrumb">${link(archiveKey, PAGE_KEYS.HOME, labels.home)} / ${labels.archive}</p><h1>${labels.archive}</h1><p class="page-intro">${labels.archiveIntro}</p>${content.entries.length ? entryList(model.orderedEntries, archiveKey) : `<p>${labels.empty}</p>`}`, labels.archiveDescription);

  addPage(updatesKey, labels.allUpdates, `<p class="breadcrumb">${link(updatesKey, PAGE_KEYS.HOME, labels.home)} / ${labels.allUpdates}</p><h1>${labels.allUpdates}</h1><p class="page-intro">${labels.updatesIntro}</p>${model.orderedUpdates.length ? allUpdates(updatesKey) : `<p>${labels.emptyUpdates}</p>`}<p class="all-content">${link(updatesKey, PAGE_KEYS.HOME, labels.backHome)}</p>`, labels.updatesIntro);

  for (const route of model.routes.filter(route => route.kind === 'topic' && route.locale === locale)) {
    const key = route.key;
    const translated = topicLabels(route.topicId, locale);
    const entries = model.orderedEntries.filter(entry => entry.topic === route.topicId);
    addPage(key, translated.name, `<p class="breadcrumb">${link(key, PAGE_KEYS.HOME, labels.home)} / ${escapeHtml(translated.name)}</p><h1>${escapeHtml(translated.name)}</h1><p class="page-intro">${escapeHtml(translated.description)}</p>${entries.length ? entryList(entries, key, false) : `<div class="empty"><p>${escapeHtml(translated.empty)}</p>${link(key, PAGE_KEYS.ARCHIVE, labels.viewEntries)}</div>`}`, translated.description);
  }

  for (const entry of content.entries) {
    const key = model.localize(entryKey(entry.slug), locale);
    const topic = topicLabels(entry.topic, locale);
    const article = articleFor(entry, locale);
    const sections = article.sections.map(section => `<section><h2>${escapeHtml(section.title)}</h2>${(section.paragraphs || []).map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}${section.items ? `<ul>${section.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}</section>`).join('');
    const related = model.orderedEntries.find(candidate => candidate.slug !== entry.slug && candidate.topic === entry.topic);
    const body = `<p class="breadcrumb">${link(key, PAGE_KEYS.HOME, labels.home)} / ${link(key, topicKey(entry.topic), topic.name)}</p>
    <article data-entry-key="${entryKey(entry.slug)}">
      <h1${entry.topic === 'papers' ? ' lang="en"' : ''}>${escapeHtml(article.title)}</h1>
      ${authorLine(entry)}
      ${metadata(entry, key)}
      ${publicationDetails(entry)}
      <div class="article-body" lang="${article.lang}"><p>${escapeHtml(article.summary)}</p>${sections}
        ${article.resources.length ? `<section><h2>${entry.topic === 'papers' ? 'Resources' : labels.resources}</h2><ul class="resource-list">${article.resources.map(resource => `<li>${externalLink(resource.url, resource.label)}</li>`).join('')}</ul></section>` : ''}
      </div>
    </article>
    <nav class="article-nav" aria-label="${labels.articleNavigation}">${link(key, topicKey(entry.topic), labels.backToTopic.replace('{topic}', topic.name))}${related ? link(key, entryKey(related.slug), `${labels.readRelated}${entryTitle(related, locale)}`) : ''}</nav>`;
    addPage(key, article.title, body, article.summary);
  }
}

const artifacts = new Map([
  ...pages,
  ['styles.css', await readFile(resolve(root, 'styles.css'), 'utf8')],
  ['robots.txt', 'User-agent: *\nAllow: /\n'],
  ...(analytics ? [['analytics.js', await readFile(resolve(root, 'analytics.js'), 'utf8')]] : []),
]);

async function checkExisting(directory) {
  let existing;
  try {
    if ((await lstat(directory)).isSymbolicLink()) throw new Error(`Refusing linked output directory: ${directory}`);
    existing = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const item of existing) {
    const path = resolve(directory, item.name);
    const relativePath = path.slice(output.length + 1).split(sep).join('/');
    if (item.isSymbolicLink()) throw new Error(`Refusing to overwrite linked output: ${path}`);
    if (item.isDirectory()) {
      if (artifacts.has(relativePath)) throw new Error(`Output file conflicts with existing directory: ${path}`);
      await checkExisting(path);
    } else {
      if (!item.isFile()) throw new Error(`Unsupported output file type: ${path}`);
      if ([...artifacts.keys()].some(target => target.startsWith(`${relativePath}/`))) throw new Error(`Output directory conflicts with existing file: ${path}`);
      if (item.name.endsWith('.html') && !pages.has(relativePath)) throw new Error(`Unregistered existing page preserved; review its URL before rebuilding: ${path}`);
    }
  }
}

const lockDirectory = resolve(root, '.build-lock');
try {
  await mkdir(lockDirectory);
} catch (error) {
  if (error.code === 'EEXIST') throw new Error('Build output is locked. Wait for the other build; after a crash, inspect .build-lock before removing it.');
  throw error;
}
let staging;
try {
  await checkExisting(output);
  staging = await mkdtemp(resolve(root, '.build-stage-'));
  for (const [path, data] of artifacts) {
    const destination = resolve(staging, path);
    if (!destination.startsWith(`${staging}${sep}`)) throw new Error('Output must stay inside staging/');
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, data);
  }
  for (const path of artifacts.keys()) {
    const destination = resolve(output, path);
    await mkdir(dirname(destination), { recursive: true });
    await rename(resolve(staging, path), destination);
  }
} finally {
  try {
    if (staging) await rm(staging, { recursive: true });
  } finally {
    await rm(lockDirectory, { recursive: true });
  }
}
console.log(`Generated ${pages.size} validated pages in ${output}`);
