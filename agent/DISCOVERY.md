# Discovery

The StockFolio marketing agent uses public search results to find possible investing, trading, crypto, and portfolio-tracking communities. Discovery is meant to create a review queue, not an auto-posting list.

## Quick Summary

Discovery runs from either:

```bash
npm run discover
```

or the local UI button:

```text
POST /api/discover
```

The output is merged into:

```text
data/communities.json
```

Each run is also logged under:

```text
data/discovery-runs/
```

## Input Queries

Discovery starts with `data/discoveryQueries.json`. Each entry has:

- `label`: human-readable name for reporting.
- `platform`: fallback platform if the URL does not identify one clearly.
- `language`: expected language for the query.
- `query`: the public search query.

Example:

```json
{
  "label": "Reddit investing communities",
  "platform": "reddit",
  "language": "en",
  "query": "site:reddit.com/r investing stocks portfolio tracker"
}
```

The current query set covers Facebook groups, Reddit communities, Telegram groups, Discord servers, X conversations, and forum searches in English, Hebrew, and Russian. The Russian set also includes Habr-focused queries and Yandex-hosted public-page discovery.

## Search Step

`lib/discovery.js` sends every query to DuckDuckGo's HTML endpoint:

```text
https://html.duckduckgo.com/html/
```

It posts the query as form data and uses a local-tool user agent:

```text
StockFolioMarketingAgent/1.0 (+manual-review-local-tool)
```

By default, the agent keeps up to `8` results per query.

## Parsing Step

The parser reads each result block from the returned HTML and extracts:

- title
- URL
- snippet

DuckDuckGo redirect URLs are decoded through the `uddg` query parameter when present.

The parser is intentionally simple. If DuckDuckGo changes its HTML classes, discovery may return fewer results until the parser is updated.

## Candidate Creation

Each parsed result becomes a candidate community when it has enough signal.

The agent infers:

- `platform`: from URL host, such as `facebook.com`, `reddit.com`, `t.me`, `discord`, `x.com`, or `twitter.com`.
- `canonicalId`: stable platform identity such as `reddit:r/investing`, `telegram:cryptosignals`, or `facebook:group:123456789`.
- `name`: cleaned from the search result title.
- `language`: from the query, or script detection for Hebrew and Cyrillic text when not provided.
- `members`: parsed from text like `12k members`, `1.2m subscribers`, or `40,000 users`.
- `posting`: rough policy hint based on platform.
- `confidence`: how much the result looks like a useful, real outreach target.
- `outreachStrategy`: the next recommended manual action.
- `notes`: the result snippet or a discovery note.
- `source`: set to `discovery`.
- `sourceQuery`: the query label that found it.
- `discoveredAt`: current timestamp.
- `lastVerifiedAt`: timestamp for when the result was last evaluated by the discovery pipeline.
- `status`: starts as `new`.
- `review`: starts as `pending`.

Low-signal results are skipped when they look like:

- login pages
- share pages
- privacy pages
- empty or bad URLs
- names shorter than 3 characters
- confidence below the minimum threshold

## Posting Friendliness

Posting friendliness is not a permission check. It is only a conservative hint:

- Reddit: `Restricted`
- Telegram: `Ask admins`
- Discord: `Ask admins`
- X: `Usually allowed`
- Search snippets with weekly promo, feedback, or show-and-tell language: `Limited thread`
- Search snippets with no-promotion language: `Restricted`
- Everything else: `Check rules`

Always review the community rules manually before posting.

## Outreach Strategy

The agent converts posting and rule signals into a recommended next action:

- `do-not-post`: snippets mention no promotion, no advertising, or no spam.
- `feedback-thread`: snippets mention a weekly thread, feedback thread, show-and-tell, or similar allowed container.
- `ask-admins`: Telegram or Discord targets where admin permission is safer.
- `ask-mods`: restricted communities such as Reddit.
- `reply-only`: X conversations where replying to relevant posts is safer than broad posting.
- `direct-post-ok`: sources that look permissive, usually X-style public posting.
- `review-rules`: default when the agent cannot infer enough.

This is not legal or platform-policy advice. It is a workflow hint for manual review.

## Confidence

Confidence is separate from community score. It answers: "Does this search result look real and useful enough to enter the review queue?"

The agent adds confidence for:

- platform matching the query
- valid URL host
- canonical community ID
- visible member count
- useful snippet text
- investing, stock, portfolio, trading, market, crypto, bitcoin, or ETF terms
- group/community/subreddit/forum/server/channel terms

It subtracts confidence for low-signal words such as login, privacy, share, and policy.

Results below the minimum confidence threshold are rejected as `low-confidence`.

## Scoring

Scores are calculated in `lib/scoring.js`.

Formula:

```text
score =
  relevance * 0.42 +
  activity * 0.26 +
  memberScore * 0.18 +
  policyScore * 0.14
```

### Relevance

Starts at `45`, then adds points for terms found in name, notes, or URL.

Investing terms add `8` each:

```text
invest, stock, portfolio, trading, market, etf
```

Crypto terms add `7` each:

```text
crypto, bitcoin, ethereum, defi
```

Facebook and Reddit get a small `+5` because they tend to have clearer community structures.

Relevance is capped at `95`.

### Activity

If activity is not already set, it is inferred from members:

- `>= 1,000,000`: `88`
- `>= 100,000`: `78`
- `>= 10,000`: `68`
- otherwise: `55`

### Member Score

Member score uses a logarithmic curve so very large communities help, but do not dominate:

```text
min(100, round(log10(max(members, 10)) * 18))
```

### Policy Score

- `Usually allowed`: `100`
- `Restricted`: `35`
- anything else: `70`

## Merge And Dedupe

Candidates are merged in `lib/communityStore.js`.

Dedupe key:

1. `canonicalId` when available
2. normalized URL when available
3. fallback slug of `platform-name`

When a new candidate matches an existing community, the agent updates non-empty fields but preserves:

- existing `id`
- existing `source` when present
- existing `discoveredAt` when present

The saved list is sorted by score descending.

## Output Shape

Each saved community can include:

```json
{
  "id": "reddit-investing",
  "platform": "reddit",
  "name": "r/investing",
  "language": "en",
  "members": 2900000,
  "activity": 95,
  "relevance": 86,
  "posting": "Restricted",
  "url": "https://www.reddit.com/r/investing/",
  "notes": "Strict rules. Treat this as research or moderator outreach before posting any product link.",
  "source": "seed",
  "review": "pending",
  "status": "new",
  "confidence": 82,
  "outreachStrategy": "ask-mods",
  "canonicalId": "reddit:r/investing",
  "score": 84
}
```

Discovered entries also include:

```json
{
  "source": "discovery",
  "sourceQuery": "Reddit investing communities",
  "discoveredAt": "2026-07-05T00:00:00.000Z"
}
```

## Rejection Reasons

Skipped results are tracked in each run log. Common reasons:

- `missing-url`
- `weak-name`
- `login-page`
- `share-page`
- `privacy-page`
- `search-page`
- `missing-name`
- `low-confidence`

The discovery response includes a summary map, for example:

```json
{
  "rejections": {
    "login-page": 2,
    "low-confidence": 5
  }
}
```

## Run Logs

Every discovery run writes a JSON file under `data/discovery-runs/`.

The log includes:

- start and finish timestamps
- added, updated, scanned, rejected, and total counts
- errors grouped by query
- rejection summary
- accepted candidate summaries
- rejected result details

## UI Behavior

In server mode, the UI loads communities from:

```text
GET /api/communities
```

When the user clicks `Run discovery`, the UI calls:

```text
POST /api/discover
```

The server blocks overlapping runs with a `discoveryRunning` flag. If discovery is already running, it returns `409`.

## Limits

Discovery is intentionally lightweight:

- It depends on public search results.
- It does not verify whether a group is active today.
- It does not verify whether posting is allowed.
- It may infer member counts incorrectly if snippets are vague.
- It may miss communities that are private, invite-only, blocked from search, or not indexed.

Use discovery as a shortlist generator. The final decision should be manual.

## Safe Outreach Workflow

1. Run discovery.
2. Review high-score communities.
3. Open each community manually.
4. Read rules and pinned posts.
5. Prefer asking for feedback over promotion.
6. Do not post the same copy everywhere.
7. Track what was posted and where.
