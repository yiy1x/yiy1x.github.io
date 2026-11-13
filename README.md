# 杨逸的技术博客 / yi yang's technical blog

Papers, projects, and technical notes by Yi Yang, Nanjing University.

Website: https://yiy1x.github.io/

## Local development

Requires Node.js 22 or newer. There are no third-party build dependencies.

```sh
npm run build
npm test
python3 -m http.server 8876 --bind 127.0.0.1 --directory site
```

Open http://127.0.0.1:8876/ for Chinese or http://127.0.0.1:8876/en/ for English.

## Content maintenance

- Edit `content.json`, not the generated HTML in `site/`.
- `links` is the central registry for external URLs. Reuse `urlKey`, `githubKey`, and `authorSourceKey` instead of repeating URLs.
- Article slugs and topic IDs are stable URL identities. Titles and labels can change without changing those identities.
- `paperOrder` controls the shared order on the home page, topic overview, and paper lists. Entries not listed there follow year and author-priority ordering.
- Each paper keeps its original English title, ordered authors, and detail body. `isSelf` highlights Yi Yang; verified `equalContribution` and `corresponding` flags render contribution markers.
- Optional `brief` fields supply the short homepage introduction. `summaryZh` and `summary` supply Chinese and English list summaries.
- `updates` contains dated, bilingual news. An `entrySlug` automatically supplies its category; external or plain-text updates may use `topicId`.
- `showOnHome: false` keeps a news item in the complete history but excludes it from the homepage's five-item preview.
- `i18n.mjs` contains interface translations; `routes.mjs` provides shared bilingual routes. The language switch preserves the current article or topic.

## Deployment

GitHub Pages uses the workflow in `.github/workflows/pages.yml`. Changes pushed to `main` build and validate the site, then publish only the generated `site/` directory. Pull requests run the same build and validation without publishing. The workflow can also be run manually from Actions.

The public site contains static HTML and CSS without client-side scripts, analytics, or external fonts. This repository does not host paper PDFs or datasets; resource links point to their original sources.
