# Ledger — Contract & Tender Tracker

A self-hosted tool that pulls open contract/tender notices from multiple official
sources into one searchable, filterable dashboard, so you can find opportunities
and jump straight to the source to apply.

## What's actually in here

Real, live sources — not scraped HTML that breaks every redesign, but official
public APIs:

| Source | Coverage | API key needed? |
|---|---|---|
| **UK Contracts Finder** | UK public sector tenders | No |
| **EU TED** (Tenders Electronic Daily) | All 27 EU member states | No |
| **US SAM.gov** | US federal contract opportunities | Yes, free — see below |
| **World Bank** | Bank-financed procurement notices worldwide | No |
| **Australia AusTender** | Australian government contract notices | No |
| **Generic RSS** | Any tender portal that publishes a feed | Depends on the feed |

This is a *foundation*, not a finished universe of every tender on Earth — no such
scraper exists (that's not how any real aggregator, including globaltenders.com,
actually works). You add more sources over time by either:
1. Dropping a feed URL into `backend/feeds.config.json` (copy from
   `feeds.config.example.json`) — works for any portal with RSS/Atom, no code needed.
2. Writing a new file in `backend/scrapers/` following the pattern of the existing
   ones, and registering it in `backend/scheduler.js`.

Note: World Bank and AusTender include already-awarded contract notices alongside open
notices (both sources' feeds mix the two) — useful for market intelligence even where
the bid window has closed.

Good candidates to add next: CanadaBuys (its old open-data CSV dump is archived/stale;
the live data now needs API access — check `canadabuys.canada.ca` for current terms),
New Zealand GETS, Inter-American Development Bank, UNGM (has a public search you'd
need to check ToS on before automating), national portals for countries you care
about, industry-specific RFP boards. ADB (Asian Development Bank) sits behind
Cloudflare bot protection and can't be automated without violating that protection.

## How it works

- `backend/scrapers/*` — one file per source, each normalizes that source's data into
  a common shape and returns an array of contract rows.
- `backend/db.js` — SQLite (with full-text search) stores everything, deduped by a
  stable hash of source+ID, so re-running scrapers just updates existing rows.
- `backend/scheduler.js` — runs all scrapers on a cron schedule (default every 6
  hours, configurable via `CRON_SCHEDULE` in `.env`) and once at startup.
- `backend/routes/contracts.js` + `server.js` — REST API with keyword search and
  filters (source, country, sector, value range, deadline window).
- `frontend/index.html` — the dashboard. Plain HTML/CSS/JS, no build step, so it's
  trivial to deploy and modify.

## Run it locally first

```bash
cd backend
cp .env.example .env
npm install
npm run scrape      # one-off scrape to populate the database — watch the console output
npm start            # starts the server on http://localhost:3000
```

Open `http://localhost:3000` — you should see live contracts. If a source shows
`0 notices` in the console, check `/tmp` or your terminal for the specific error;
public APIs occasionally change their query parameters, and the comments at the top
of each scraper file link to the official docs to fix it.

### Get your SAM.gov API key (takes ~5 minutes, free)

1. Create an account at https://sam.gov
2. Go to Workspace → Account Details → Request Public API Key
3. Put the key in `backend/.env` as `SAM_GOV_API_KEY=...`

Non-federal accounts get ~10 requests/day, which is enough for the default 6-hourly
sync of a 7-day window. Without a key, this source is skipped and everything else
still works.

## Deploy to your EC2 instance + domain

`deploy/ec2-setup.sh` is written to be safe on a shared EC2 box that already runs
other apps: it never runs a blanket `apt-get upgrade`, reuses Node/nginx/certbot/pm2
if they're already installed instead of reinstalling, deploys into its own directory
(`/var/www/contracts`) rather than wherever you happen to clone it, and adds its own
nginx server block matched by domain — other sites' nginx configs and PM2 processes
are left untouched. The PM2 process is named `tenders-whizzonby`.

1. Point your domain's DNS A record (`tenders.whizzonby.com`) at the EC2 instance's
   public IP.
2. Copy the whole `contract-tracker/` project to the instance somewhere temporary
   (git clone, scp, or rsync — the script copies it into `/var/www/contracts` itself,
   so the temporary location doesn't matter).
3. SSH in and run:
   ```bash
   cd contract-tracker
   bash deploy/ec2-setup.sh tenders.whizzonby.com
   ```
4. Add your `SAM_GOV_API_KEY` to `/var/www/contracts/backend/.env` (the script
   creates this file from the example on first run), then:
   ```bash
   pm2 restart tenders-whizzonby
   ```
5. Open your EC2 security group and confirm ports 80 and 443 are open to the
   internet (this is the most common reason a fresh EC2 box doesn't respond).

To update after a code change: re-run `bash deploy/ec2-setup.sh tenders.whizzonby.com`
(it pulls/re-syncs into `/var/www/contracts` and restarts nothing by itself — follow
with `pm2 restart tenders-whizzonby`), or just `pm2 restart tenders-whizzonby` after
editing files directly in `/var/www/contracts`.
To watch logs: `pm2 logs tenders-whizzonby`.
To trigger a manual re-scrape without waiting for the cron: `curl -X POST http://localhost:3000/api/scrape-now`.

## A note on scope and legality

I built this against each source's official, publicly documented API rather than
scraping HTML, which is both more reliable and keeps you clearly within each
platform's terms of service. If you want to add a source that *doesn't* have a public
API or feed, check its robots.txt and terms of service before scraping it — some
tender platforms (including some of globaltenders.com's own competitors) explicitly
prohibit automated scraping in their ToS, and applying for contracts is exactly the
kind of business use where you don't want to build on a foundation that could get
your access blocked or raise legal issues.

## "Apply for them"

Every dashboard result links out to the original notice on the source's own site —
that's where the actual bid submission process happens (each government/agency
portal has its own registration and submission process, which isn't something a
third-party tool can safely automate on your behalf). The dashboard's job is
discovery and filtering; applying still happens on the source portal.
