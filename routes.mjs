import { posix } from 'node:path';

export const PAGE_KEYS = Object.freeze({ HOME: 'page:home', ARCHIVE: 'page:archive', UPDATES: 'page:updates' });
export const LOCALES = Object.freeze(['zh-CN', 'en']);
export const topicKey = identity => `topic:${identity}`;
export const entryKey = identity => `entry:${identity}`;
export function entryTitle(entry, locale = 'zh-CN') {
  if (!LOCALES.includes(locale)) throw new Error(`Unknown locale: ${locale}`);
  return entry.topic === 'papers' ? entry.originalTitle : locale === 'en' ? entry.titleEn : entry.title;
}

function authorPriority(entry) {
  if (entry.topic !== 'papers') return [3, 0];
  const position = entry.authors?.findIndex(author => author.isSelf) ?? -1;
  if (position < 0) return [3, 0];
  if (position === 0) return [0, 0];
  if (entry.authors[position].equalContribution) return [1, position];
  return [2, position];
}

function entryDate(entry) {
  return entry.publishedAt || (entry.publication?.year ? `${entry.publication.year}-${String(entry.publication.month || 0).padStart(2, '0')}` : '');
}

function compareEntries(first, second) {
  const yearDifference = Number(entryDate(second).slice(0, 4)) - Number(entryDate(first).slice(0, 4));
  if (yearDifference) return yearDifference;
  const firstAuthor = authorPriority(first);
  const secondAuthor = authorPriority(second);
  const priorityDifference = firstAuthor[0] - secondAuthor[0] || firstAuthor[1] - secondAuthor[1];
  if (priorityDifference) return priorityDifference;
  return entryDate(second).localeCompare(entryDate(first)) || first.slug.localeCompare(second.slug);
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be non-empty text`);
}

function identity(value, field) {
  text(value, field);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`${field} must be a lowercase stable ID`);
}

function array(value, field) {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
}

function record(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object`);
}

function date(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field} must be YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${field} is not a valid date`);
}

export function safeUrl(value) {
  text(value, 'URL');
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(`Unsupported URL: ${value}`);
  return parsed.href;
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export function createSiteModel(input) {
  const content = structuredClone(input);
  record(content, 'content');
  for (const field of ['name', 'nameZh', 'title', 'titleEn']) text(content[field], field);
  record(content.links, 'links');
  const links = new Map();
  const linkUrls = new Set();
  for (const [key, value] of Object.entries(content.links)) {
    identity(key, 'link key');
    const url = safeUrl(value);
    if (linkUrls.has(url)) throw new Error(`Duplicate external URL; reuse its existing key: ${key}`);
    links.set(key, url);
    linkUrls.add(url);
  }
  function resolveLink(owner, field, optional = false) {
    const keyField = `${field}Key`;
    if (Object.hasOwn(owner, field)) throw new Error(`Use ${keyField} and the global links registry instead of ${field}`);
    if (optional && !Object.hasOwn(owner, keyField)) return;
    identity(owner[keyField], keyField);
    if (!links.has(owner[keyField])) throw new Error(`Unknown link key: ${owner[keyField]}`);
    owner[field] = links.get(owner[keyField]);
  }
  resolveLink(content, 'github');
  if (content.friendLinks === undefined) content.friendLinks = [];
  array(content.friendLinks, 'friendLinks');
  const friendKeys = new Set();
  for (const friend of content.friendLinks) {
    record(friend, 'friendLink');
    text(friend.label, 'friendLink.label');
    resolveLink(friend, 'url');
    if (friendKeys.has(friend.urlKey)) throw new Error(`Duplicate friend link: ${friend.urlKey}`);
    friendKeys.add(friend.urlKey);
  }
  for (const field of ['topics', 'entries', 'updates']) array(content[field], field);
  if (content.paperOrder === undefined) content.paperOrder = [];
  array(content.paperOrder, 'paperOrder');
  if (content.topicAliases === undefined) content.topicAliases = [];
  array(content.topicAliases, 'topicAliases');
  const topics = new Map();
  const entries = new Map();
  const routes = new Map();
  const paths = new Set();

  function registerVariant(route) {
    if (routes.has(route.key) || paths.has(route.path)) throw new Error(`Duplicate route: ${route.key}`);
    routes.set(route.key, Object.freeze(route));
    paths.add(route.path);
  }

  function register(route) {
    for (const locale of LOCALES) {
      registerVariant({ ...route, pageKey: route.canonicalKey || route.key, locale,
        key: locale === 'en' ? `en:${route.key}` : route.key,
        path: locale === 'en' ? `en/${route.path}` : route.path });
    }
  }

  register({ key: PAGE_KEYS.HOME, path: 'index.html', kind: 'home' });
  register({ key: PAGE_KEYS.ARCHIVE, path: 'archive/index.html', kind: 'archive' });
  register({ key: PAGE_KEYS.UPDATES, path: 'updates/index.html', kind: 'updates' });

  for (const topic of content.topics) {
    record(topic, 'topic');
    identity(topic.id, 'topic.id');
    if (topics.has(topic.id)) throw new Error(`Duplicate topic ID: ${topic.id}`);
    for (const field of ['name', 'description', 'empty']) text(topic[field], `topic.${field}`);
    record(topic.en, 'topic.en');
    for (const field of ['name', 'description', 'empty']) text(topic.en[field], `topic.en.${field}`);
    topics.set(topic.id, topic);
    register({ key: topicKey(topic.id), path: `topics/${topic.id}/index.html`, kind: 'topic', topicId: topic.id });
  }

  for (const alias of content.topicAliases) {
    record(alias, 'topicAlias');
    identity(alias.id, 'topicAlias.id');
    if (topics.has(alias.id)) throw new Error(`Topic alias conflicts with a topic: ${alias.id}`);
    if (!topics.has(alias.target)) throw new Error(`Unknown topic alias target: ${alias.target}`);
    register({ key: topicKey(alias.id), canonicalKey: topicKey(alias.target), path: `topics/${alias.id}/index.html`, kind: 'topic', topicId: alias.target });
  }

  for (const entry of content.entries) {
    record(entry, 'entry');
    identity(entry.slug, 'entry.slug');
    if (entries.has(entry.slug)) throw new Error(`Duplicate entry ID: ${entry.slug}`);
    if (!topics.has(entry.topic)) throw new Error(`Unknown topic: ${entry.topic}`);
    for (const field of ['title', 'originalTitle', 'relation', 'summary', 'sourceNote']) text(entry[field], `entry.${field}`);
    if (entry.topic !== 'papers') {
      for (const field of ['titleEn', 'summaryZh']) text(entry[field], `entry.${field}`);
    }
    if (entry.summaryZh !== undefined) text(entry.summaryZh, 'entry.summaryZh');
    if (entry.brief !== undefined) {
      record(entry.brief, 'entry.brief');
      for (const field of ['title', 'summary', 'summaryZh']) text(entry.brief[field], `entry.brief.${field}`);
      if (entry.topic !== 'papers') text(entry.brief.titleEn, 'entry.brief.titleEn');
    }
    date(entry.sourceCheckedAt, 'entry.sourceCheckedAt');
    if (entry.publishedAt != null) date(entry.publishedAt, 'entry.publishedAt');
    if (entry.topic === 'papers' || entry.authors !== undefined) {
      array(entry.authors, 'entry.authors');
      if (!entry.authors.length) throw new Error('A paper must have at least one author');
      resolveLink(entry, 'authorSource');
      for (const author of entry.authors) {
        record(author, 'author');
        text(author.name, 'author.name');
        for (const field of ['isSelf', 'equalContribution', 'corresponding']) {
          if (author[field] !== undefined && typeof author[field] !== 'boolean') throw new Error(`author.${field} must be boolean`);
        }
      }
      if (entry.authors.filter(author => author.isSelf).length > 1) throw new Error('A paper cannot identify more than one author as self');
    }
    if (entry.publication != null) {
      record(entry.publication, 'entry.publication');
      const { status, venue, year, month } = entry.publication;
      if (entry.topic !== 'papers') throw new Error('Publication metadata is only valid for papers');
      if (!['accepted', 'published', 'preprint'].includes(status)) throw new Error('Unknown publication status');
      if (['accepted', 'published'].includes(status)) text(venue, 'publication.venue');
      else if (venue != null) text(venue, 'publication.venue');
      if (year != null && (!Number.isInteger(year) || year < 1900 || year > 2100)) throw new Error('Invalid publication year');
      if (month != null && (year == null || !Number.isInteger(month) || month < 1 || month > 12)) throw new Error('Invalid publication month');
      resolveLink(entry.publication, 'url', true);
    }
    for (const sectionField of entry.topic === 'papers' ? ['sections'] : ['sections', 'sectionsEn']) {
      array(entry[sectionField], `entry.${sectionField}`);
      for (const section of entry[sectionField]) {
        record(section, sectionField);
        text(section.title, `${sectionField}.title`);
        for (const field of ['paragraphs', 'items']) {
          if (section[field] !== undefined) {
            array(section[field], `${sectionField}.${field}`);
            section[field].forEach(value => text(value, `${sectionField}.${field}`));
          }
        }
      }
    }
    if (entry.topic !== 'papers' && Boolean(entry.sections.length) !== Boolean(entry.sectionsEn.length)) throw new Error('Both article languages must include body sections');
    array(entry.resources, 'entry.resources');
    for (const resource of entry.resources) {
      record(resource, 'resource');
      text(resource.label, 'resource.label');
      if (entry.topic !== 'papers') text(resource.labelEn, 'resource.labelEn');
      resolveLink(resource, 'url');
    }
    entries.set(entry.slug, entry);
    register({ key: entryKey(entry.slug), path: `posts/${entry.slug}/index.html`, kind: 'entry', topicId: entry.topic, entryId: entry.slug });
  }

  const paperRanks = new Map();
  for (const slug of content.paperOrder) {
    identity(slug, 'paperOrder slug');
    if (paperRanks.has(slug)) throw new Error(`Duplicate paper order entry: ${slug}`);
    if (entries.get(slug)?.topic !== 'papers') throw new Error(`Unknown paper order entry: ${slug}`);
    paperRanks.set(slug, paperRanks.size);
  }
  const orderedEntries = [...content.entries].sort((first, second) => {
    const firstRank = paperRanks.get(first.slug);
    const secondRank = paperRanks.get(second.slug);
    if (firstRank !== undefined || secondRank !== undefined) return (firstRank ?? paperRanks.size) - (secondRank ?? paperRanks.size);
    return compareEntries(first, second);
  });
  const homeEntries = [...content.entries].reverse().sort((first, second) =>
    entryDate(second).localeCompare(entryDate(first)));

  if (content.featuredEntry != null && !entries.has(content.featuredEntry)) throw new Error(`Unknown featured entry: ${content.featuredEntry}`);
  const updateIds = new Set();
  for (const update of content.updates) {
    record(update, 'update');
    identity(update.id, 'update.id');
    if (updateIds.has(update.id)) throw new Error(`Duplicate update ID: ${update.id}`);
    updateIds.add(update.id);
    text(update.text, 'update.text');
    text(update.textEn, 'update.textEn');
    if (update.showOnHome !== undefined && typeof update.showOnHome !== 'boolean') throw new Error('update.showOnHome must be boolean');
    if (typeof update.date === 'string' && /^\d{4}-\d{2}$/.test(update.date)) date(`${update.date}-01`, 'update.date');
    else date(update.date, 'update.date');
    if (update.entrySlug !== undefined && !entries.has(update.entrySlug)) throw new Error(`Unknown update entry: ${update.entrySlug}`);
    if (update.entrySlug !== undefined) {
      if (update.topicId !== undefined) throw new Error('An entry-linked update inherits its topic; do not specify topicId');
      update.topicId = entries.get(update.entrySlug).topic;
    } else if (update.topicId !== undefined && !topics.has(update.topicId)) {
      throw new Error(`Unknown update topic: ${update.topicId}`);
    }
    resolveLink(update, 'url', true);
    if (update.url !== undefined && update.entrySlug !== undefined) throw new Error('An update must not have both an entry and an external URL');
  }
  const orderedUpdates = [...content.updates].reverse().sort((first, second) => second.date.localeCompare(first.date));
  const homeUpdates = orderedUpdates.filter(update => update.showOnHome !== false).slice(0, 5);

  function route(key) {
    const result = routes.get(key);
    if (!result) throw new Error(`Unknown page key: ${key}`);
    return result;
  }

  function href(fromKey, toKey) {
    return posix.relative(posix.dirname(route(fromKey).path), route(toKey).path);
  }

  function localize(key, locale) {
    if (!LOCALES.includes(locale)) throw new Error(`Unknown locale: ${locale}`);
    const baseKey = route(key).pageKey;
    return route(locale === 'en' ? `en:${baseKey}` : baseKey).key;
  }

  function current(fromKey, toKey) {
    const from = route(fromKey);
    const to = route(toKey);
    if (from.locale === to.locale && from.pageKey === to.pageKey) return 'page';
    if (from.locale === to.locale && from.kind === 'entry' && to.kind === 'topic' && from.topicId === to.topicId) return 'location';
    return null;
  }

  const navigation = Object.freeze([PAGE_KEYS.HOME, PAGE_KEYS.ARCHIVE, ...content.topics.map(topic => topicKey(topic.id))]);
  freeze(content);
  return Object.freeze({
    content,
    orderedEntries: Object.freeze(orderedEntries),
    homeEntries: Object.freeze(homeEntries),
    orderedUpdates: Object.freeze(orderedUpdates),
    homeUpdates: Object.freeze(homeUpdates),
    routes: Object.freeze([...routes.values()]),
    navigation,
    navigationFor: locale => Object.freeze(navigation.map(key => localize(key, locale))),
    localize,
    route,
    href,
    current,
    asset: (fromKey, path) => posix.relative(posix.dirname(route(fromKey).path), path),
    topic: topicId => topics.get(topicId),
    entry: entryId => entries.get(entryId),
    featured: content.featuredEntry ? entries.get(content.featuredEntry) : null,
  });
}
