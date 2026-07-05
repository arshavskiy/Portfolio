# Codex Context

This folder contains a standalone StockFolio Marketing Agent. It is intentionally separate from the main `client/` Vue app.

## Current Direction

- Keep all marketing-agent work inside `agent/`.
- Do not integrate this tool into `client/` unless explicitly requested.
- The agent should help discover investing and crypto communities, score them, generate tailored post text, copy the post, and open the target page.
- It must not log in to Facebook, scrape private pages, auto-post, or click Publish.

## Current App

- Entry page: `agent/index.html`
- Browser script: `agent/script.js`
- Styles: `agent/styles.css`
- Local server: `agent/server.js`
- Seed/discovered communities: `agent/data/communities.json`

## Run

```bash
cd agent
npm start
```

Then open:

```text
http://localhost:4177/
```

## Styling Preference

Use regular, simple colors. Avoid dark/neon/gradient styling. Prefer light background, white panels, gray borders, and standard blue primary buttons.
