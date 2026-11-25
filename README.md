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
- The home page's research overview uses `homeEntries`, ordered by date descending so recent work appears first. Projects and notes use optional `updatedAt` before `publishedAt`; paper dates still fall back to publication year/month. Undated entries appear last. Within the same date, later entries in `content.entries` appear first. Keep the original `publishedAt`; `updatedAt` must be a complete valid date not earlier than it, and is displayed separately on the detail page.
- `paperOrder` controls priority in the topic overview and paper lists, not the home page. Entries not listed there follow year and author-priority ordering.
- `friendLinks` contains labels and shared `urlKey` references for the Friends section below About in both languages.
- Each paper keeps its original English title, ordered authors, and detail body. `isSelf` highlights Yi Yang; verified `equalContribution` and `corresponding` flags render contribution markers.
- Optional `brief` fields supply the short homepage introduction. `summaryZh` and `summary` supply Chinese and English list summaries.
- Projects and notes use `title` / `titleEn`, `sections` / `sectionsEn`, `brief.title` / `brief.titleEn`, and `resources[].label` / `labelEn` for separate Chinese and English pages. Their detail summaries use `summaryZh` / `summary`. Missing translations fail validation rather than silently mixing languages. Paper titles and detail bodies remain English in both locales; slugs and resource URLs are shared.
- `updates` contains dated, bilingual news. An `entrySlug` automatically supplies its category; external or plain-text updates may use `topicId`.
- News uses newest dates first; for matching dates, later entries in `updates` appear first on both the homepage and the full history. Append new updates rather than changing IDs or duplicating records to reorder them.
- `showOnHome: false` keeps a news item in the complete history but excludes it from the homepage's five-item preview.
- `i18n.mjs` contains interface translations; `routes.mjs` provides shared bilingual routes. The language switch preserves the current article or topic.

## Project news policy

- This is a manual publishing convention, not a scheduler or automatic GitHub monitor. Updating a project description does not itself create news.
- Record meaningful small improvements as well as larger releases, after checking the supplied update or published source. Pure spelling, formatting or repeated descriptions do not need a new news item.
- Default coalescing window: 7 calendar days for minor updates to the same project. Within that window, append a dated bilingual maintenance note to the latest relevant news record, preserving its ID, original date and earlier milestone; do not create a second item or change dates to force it to the top.
- Outside the window, or after a longer quiet period, add one dated bilingual summary for the current batch of minor changes. If only a month is known, ask for the event date instead of inventing a precise interval.
- A substantial new capability or release can have its own news item even within the window. Preserve all older entries; never retrospectively suppress history. Record project details with `updatedAt` independently of whether news is merged or added.
- Changing the 7-day editorial convention requires a deliberate decision, not ad hoc per-page behavior. Both locales and the full history use the same news records and global links.

## Deployment workflow

GitHub Pages uses the workflow in `.github/workflows/pages.yml`. Changes pushed to `main` build and validate the site, then publish only the generated `site/` directory. Pull requests run the same build and validation without publishing. The workflow can also be run manually from Actions.

The public site uses static HTML and CSS without external fonts. Optional GoatCounter analytics is disabled until configured; navigation and content do not depend on JavaScript. This repository does not host paper PDFs or datasets; resource links point to their original sources.

## Optional private analytics

`analytics.json` is the single configuration source. `siteCode: null` disables analytics: generated pages do not load any scripts or display an analytics notice. Do not fill in an account name until that GoatCounter account has been created and its ownership verified. Account passwords, email addresses, and API tokens do not belong in this repository.

Before enabling, register at https://www.goatcounter.com/signup and configure the dashboard as private. Keep sessions enabled, disable public counters and individual-pageview collection, and disable optional location, browser, system, language, and screen-size collection if not needed. These are server-side settings; website code cannot make a public dashboard private. Then set `siteCode` to the confirmed account name, build, test, and publish.

The loader runs only on the exact `productionOrigin`, skips Do Not Track / Global Privacy Control and `#no-analytics`, loads asynchronously, and does not bind click events. It sends canonical page paths without query strings or fragments, suppresses referrer data, and keeps Chinese and English paths separate. Directory URLs and `index.html` map to the same analytics path. Local previews do not load the third-party script. Script failure or blocking does not prevent reading or navigation.

GoatCounter's default figures are **deduplicated visits**, not a simultaneous raw-PV and exact-person-UV report. Sessions use site, IP, and User-Agent information temporarily in memory for up to eight hours; repeated visits to the same path in that session are counted once. Disabling sessions counts page loads but loses that deduplication. Counts start after activation; historical traffic cannot be recovered. See https://www.goatcounter.com/help/sessions and https://www.goatcounter.com/help/privacy.

Use `https://yiy1x.github.io/#no-analytics` for a one-page check without loading the tracker. For persistent exclusion in your own browser, GoatCounter documents its `#toggle-goatcounter` option at https://www.goatcounter.com/help/skip-dev. Verify exclusion before browsing multiple pages for testing. Do not fabricate visits to test production analytics; use the offline unit tests, then one explicitly identified smoke-test visit after activation.
