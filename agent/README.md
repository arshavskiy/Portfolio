# StockFolio Marketing Agent

Standalone local helper for preparing outreach to investing and crypto communities.

## What it does

- Lists seed targets across Facebook, Reddit, Telegram, Discord, X, and forums.
- Scores each target by relevance, activity, size, and posting friendliness.
- Generates a slightly different post for each target.
- Copies the post and opens the selected community or discovery search.
- Runs an optional public-web discovery job and saves discovered targets to `data/communities.json`.

## What it does not do

- It does not log in to Facebook or any other social platform.
- It does not scrape private pages.
- It does not auto-post or click Publish.

Those steps should stay manual so you can review each community's rules and avoid spammy behavior.

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

Opening `index.html` directly still works, but discovery and saved target loading require the local server.
