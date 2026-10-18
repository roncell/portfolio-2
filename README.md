# rohan-portfolio

Portfolio for Rohan Subramaniam (SDE I, Android & iOS at Audible), plus two project sites:

| Path | What it is |
|---|---|
| `/` | Portfolio: platform toggle, phone demo, experience, projects, terminal (press `~`) |
| `/music/` | Multilingual Music Recommender: real in-browser demo on 84 MPD tracks |
| `/bezier/` | Bézier Flow: interactive curve playground built on the repo's own math |
| `/api/recs` | Recommendations API (`?seed=<id>&k=5&lang=en\|ko-Latn\|mixed\|any`) |

## Run on localhost

No install needed (Node 18+).

- **VS Code:** press `⇧⌘B` (runs the "Start localhost" task), or open Run and Debug and pick **Open portfolio in Chrome**.
- **Terminal:** `npm run dev`

Then open http://localhost:5173. If 5173 is busy, the server picks the next free port and prints it.

## Deploy to Netlify

- **Quickest:** drag this folder onto https://app.netlify.com/drop (the `/api/recs` function is skipped; every page still works).
- **With the API:** push to GitHub and connect the repo in Netlify (settings come from `netlify.toml`), or run `npx netlify-cli deploy --prod`.

## Still to fill in (marked with dashed boxes on the page)

- Full-time start date at Audible
- Email, LinkedIn, résumé link
- The phone demo on `/` shows sample recommendations; `/music/` uses real data

## Structure

```
index.html              portfolio (single file)
music/                  music recommender site + data/recs.json, data/demo.json
bezier/                 Bézier Flow site (app.js is built from bezier/src/*.ts)
netlify/functions/      recs.js (serverless /api/recs)
server.mjs              zero-dependency local server (static + /api/recs)
```
