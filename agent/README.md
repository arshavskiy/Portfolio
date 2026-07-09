# StockFolio Marketing Agent

Standalone local helper for preparing outreach to investing and crypto communities.

The agent is intentionally a manual-review tool. It helps find communities, rank them, prepare tailored outreach copy, and open the right destination, but it does not log in, scrape private pages, or post automatically.

## Features

- Community list: loads seed and discovered targets from `data/communities.json`.
- Discovery: searches the public web for English, Hebrew, and Russian investing and crypto communities, including Russian-focused sources such as Habr and Yandex-hosted public pages, then saves new candidates.
- Scoring: ranks communities by relevance, activity, member count, and posting friendliness.
- Confidence: marks how trustworthy the discovered result looks before it enters the review queue.
- Outreach strategy: labels each target as `review-rules`, `ask-mods`, `ask-admins`, `feedback-thread`, `reply-only`, `direct-post-ok`, or `do-not-post`.
- Run logs: saves each discovery run under `data/discovery-runs/` with added, updated, rejected, and error counts.
- Filtering: lets the UI show practical outreach targets across Facebook, Reddit, Telegram, Discord, X, and forums.
- Post generation: creates a slightly different post for each target so outreach is not copy-pasted everywhere.
- Manual launch: copies the generated post and opens the selected community or discovery search.
- Two modes: `Discover` for public search plus Playwright verification, and `Review` for queue triage and manual posting.
- Local API: exposes community data and discovery actions through the local server.

## Discovery

Discovery is a public-search pipeline:

1. Reads search seeds from `data/discoveryQueries.json`.
2. Sends each query to DuckDuckGo's HTML search endpoint.
3. Parses public result titles, URLs, and snippets.
4. Converts each result into a community candidate.
5. Infers platform, canonical ID, language, member count, posting friendliness, relevance, activity, confidence, and outreach strategy.
6. Rejects weak results with explicit rejection reasons.
7. Deduplicates candidates against `data/communities.json`.
8. Saves the merged and score-sorted list back to `data/communities.json`.
9. Writes a run log to `data/discovery-runs/`.

See [DISCOVERY.md](./DISCOVERY.md) for the full discovery flow, scoring formula, data fields, and limits.

The local UI now separates the work into two modes:

- `Discover`: run public web discovery, then optionally run Playwright verification against public candidate pages already saved in `data/communities.json`.
- `Review`: work through the queue, compare targets, refine the message, copy the post, and open the selected target manually.

## What It Does Not Do

- Does not log in to Facebook, Reddit, Telegram, Discord, X, or forums.
- Does not scrape private pages or member-only content.
- Does not bypass rate limits or platform permissions.
- Does not auto-post, click Publish, or send messages.
- Does not decide that a community allows promotion. You still need to read the rules.

Those steps stay manual so every target can be reviewed and the outreach stays respectful.

## Run

For the full agent workflow:

```bash
npm start
```

Then open:

```text
http://localhost:4177
```

You can also run discovery from the command line:

```bash
npm run discover
```

Run overnight discovery:

```bash
npm run discover:sleep
```

Optional tuning:

```bash
DISCOVERY_HOURS=8 DISCOVERY_INTERVAL_MINUTES=45 DISCOVERY_LIMIT_PER_QUERY=10 npm run discover:sleep
```

Overnight reports are saved to:

```text
data/overnight-discovery/
```

The script stays in manual-review mode. It searches public results in English, Hebrew, and Russian, saves candidates, writes logs, and never logs in or posts.

Scrape public candidate pages with Playwright:

```bash
npm install
npm run scrape
```

Optional tuning:

```bash
SCRAPE_LIMIT=60 SCRAPE_DELAY_MS=8000 SCRAPE_TIMEOUT_MS=20000 npm run scrape
```

The scraper only opens public candidate URLs already saved in `data/communities.json`. It skips login-heavy/search URLs such as Facebook, X, and Google search links by default, extracts public title/meta/body signals, updates confidence and outreach strategy, and saves reports to:

```text
data/scrape-runs/
```

Capture screenshots of public search result pages:

```bash
npm run screenshots
```

Optional tuning:

```bash
SEARCH_SCREENSHOT_LIMIT=8 SEARCH_SCREENSHOT_DELAY_MS=1200 npm run screenshots
```

Screenshots and the latest report are saved to:

```text
data/search-screenshots/
```

Run tests:

```bash
npm test
```

Opening `index.html` directly still works, but discovery and saved target loading require the local server.

## Local Endpoints

- `GET /api/communities`: returns the current community list from `data/communities.json`.
- `POST /api/discover`: runs discovery and returns counts for scanned, added, updated, total, and errors.
- `POST /api/scrape`: runs Playwright verification against saved public candidate URLs and returns scrape, skip, and failure counts plus the scrape run-log path.
- Discovery responses also include rejected count, rejection reason summary, and the saved run-log path.

The server guards against duplicate discovery runs with an in-memory `discoveryRunning` flag.

## Main Files

- `index.html`: local UI shell.
- `script.js`: UI state, filtering, generated copy, and button actions.
- `server.js`: local static server and API endpoints.
- `lib/discovery.js`: public-search discovery pipeline.
- `lib/scoring.js`: ranking formula and inferred relevance/activity.
- `lib/communityStore.js`: JSON read, write, dedupe, and sorted upsert.
- `data/communities.json`: saved seed and discovered communities.
- `data/discoveryQueries.json`: search queries used by discovery.
