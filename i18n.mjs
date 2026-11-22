const messages = {
  'zh-CN': {
    home: '首页',
    archive: '主题总览',
    browseTopics: '主导航',
    language: '切换语言',
    updates: '最近动态',
    moreUpdates: '更多',
    allUpdates: '全部动态',
    updatesIntro: '记录论文、项目与笔记的进展，按时间倒序排列。',
    emptyUpdates: '暂无动态。',
    homeUpdatesEmpty: '历史动态请查看“更多”。',
    generalUpdate: '动态',
    backHome: '返回首页',
    overview: '研究与实践',
    overviewIntro: '记录研究中的方法，也分享项目与技术探索。',
    about: '关于',
    friendLinks: '友情链接',
    affiliation: '南京大学',
    aboutBody: '关注 AI Agent 与法律人工智能。在这里分享论文、开源项目与技术笔记。',
    analyticsNotice: '本站使用 GoatCounter 统计去重访问，不使用统计 Cookie；页面路径及请求信息会发送至该服务。',
    analyticsPrivacy: '统计隐私说明',
    skip: '跳到正文',
    category: '分类：',
    resources: '相关资源',
    readMore: '继续阅读全文 »',
    notes: '技术笔记',
    otherEntries: '其他内容',
    allEntries: '所有内容',
    empty: '暂无文章。',
    homeDescription: '杨逸，南京大学。分享 AI Agent、法律人工智能相关论文、开源项目与技术笔记。',
    archiveIntro: '按主题阅读，也可以从这里查看所有条目。',
    archiveDescription: '浏览杨逸的论文、项目与技术笔记。',
    viewEntries: '浏览全部内容 »',
    articleNavigation: '文章导航',
    backToTopic: '返回{topic}主题',
    readRelated: '另读：',
  },
  en: {
    home: 'Home',
    archive: 'Topic overview',
    browseTopics: 'Main navigation',
    language: 'Choose language',
    updates: 'Recent updates',
    moreUpdates: 'More',
    allUpdates: 'All updates',
    updatesIntro: 'Progress on papers, projects, and notes, from newest to oldest.',
    emptyUpdates: 'No updates yet.',
    homeUpdatesEmpty: 'See More for earlier updates.',
    generalUpdate: 'Update',
    backHome: 'Back to home',
    overview: 'Research and practice',
    overviewIntro: 'Methods from my research, alongside projects and technical explorations.',
    about: 'About',
    friendLinks: 'Friends',
    affiliation: 'Nanjing University',
    aboutBody: 'Interested in AI agents and AI for law. I share papers, open-source projects, and technical notes here.',
    analyticsNotice: 'This site uses GoatCounter for deduplicated visits without analytics cookies. Page paths and request information are sent to that service.',
    analyticsPrivacy: 'Analytics privacy',
    skip: 'Skip to content',
    category: 'Category: ',
    resources: 'Resources',
    readMore: 'Continue reading »',
    notes: 'Technical notes',
    otherEntries: 'Other entries',
    allEntries: 'All entries',
    empty: 'No entries yet.',
    homeDescription: 'yi yang, Nanjing University. Papers on AI agents and AI for law, open-source projects, and technical notes.',
    archiveIntro: 'Browse by topic, or explore all entries here.',
    archiveDescription: 'Browse papers, projects, and technical notes by yi yang.',
    viewEntries: 'Browse available entries »',
    articleNavigation: 'Article navigation',
    backToTopic: 'Back to {topic}',
    readRelated: 'Also read: ',
  },
};

Object.values(messages).forEach(Object.freeze);
Object.freeze(messages);

export function copyFor(locale) {
  if (!Object.hasOwn(messages, locale)) throw new Error(`Unknown locale: ${locale}`);
  return messages[locale];
}

export function summaryFor(entry, locale) {
  copyFor(locale);
  return locale === 'zh-CN' && entry.summaryZh
    ? { text: entry.summaryZh, lang: 'zh-CN' }
    : { text: entry.summary, lang: entry.topic === 'papers' ? 'en' : locale };
}
