# Ledger — Contract & Tender Tracker

A self-hosted tool that pulls open contract/tender notices from multiple official
sources into one searchable, filterable dashboard, so you can find opportunities
and jump straight to the source to apply.

## What's actually in here

Mostly real, live official APIs — plus one careful HTML scrape (Caribbean
Development Bank) for a source that simply has no API or feed at all, added only
after checking its robots.txt and Terms for any restriction:

| Source | Coverage | API key needed? |
|---|---|---|
| **UK Contracts Finder** | UK public sector tenders (lower-value, England-focused) | No |
| **UK Find a Tender Service** | UK/NI higher-value procurement, full OCDS data | No |
| **EU TED** (Tenders Electronic Daily) | All 27 EU member states | No |
| **US SAM.gov** | US federal contract opportunities | Yes, free — see below |
| **World Bank** | Bank-financed procurement notices worldwide | No |
| **Australia AusTender** | Australian government contract notices | No |
| **UNDP** | UN Development Programme notices worldwide | No |
| **Caribbean Development Bank** | CDB-financed procurement notices | No |
| **Generic RSS** (incl. OECS by default) | Any tender portal that publishes a feed | Depends on the feed |

This is a *foundation*, not a finished universe of every tender on Earth — no such
scraper exists (that's not how any real aggregator, including globaltenders.com,
actually works). You add more sources over time by either:
1. Dropping a feed URL into `backend/feeds.config.json` — works for any portal with
   RSS/Atom, no code needed (see the OECS entry already in there as an example).
2. Writing a new file in `backend/scrapers/` following the pattern of the existing
   ones, and registering it in `backend/scheduler.js`.

Note: World Bank, AusTender, and UK Find a Tender include already-awarded contract
notices alongside open notices (their feeds mix the two) — useful for market
intelligence even where the bid window has closed.

Sources investigated and found to have **no usable public API**: Inter-American
Development Bank (notices only render via an embedded Power BI report; its open-data
API only has a historical bulk CSV, not live tenders), PAHO (routes through UNGM,
which is registration-gated), Commonwealth Secretariat (In-Tend portal — public view
is empty without a buyer login), Government of Jamaica GOJEP (old-style postback
search UI, no JSON/RSS surface), ADB (Cloudflare bot protection blocks automated
access entirely), UNGM (ToS explicitly restricts automated scraping).

Of those, most are also dead ends for HTML scraping, not just API access: GOJEP's
listings are behind a CAPTCHA-gated search form with no server-rendered results
available from a plain request — solving CAPTCHAs is out of scope. IDB, PAHO/UNGM,
and Commonwealth Secretariat have no public content to scrape at all (embedded BI
report, registration wall, or login wall respectively) — a scraper can't extract data
that was never served to begin with.

Two were technically scrapable but skipped anyway on principle:
- **CanadaBuys** — its robots.txt explicitly disallows every crawler except
  Googlebot/Bingbot (`Disallow: /`), and even those two are blocked from individual
  tender detail pages. That's an unambiguous "don't scrape this" signal — respected,
  not routed around.
- **CARICOM** — the listing page itself is a clean, static, ToS-unrestricted table,
  but their robots.txt explicitly names and blocks `anthropic-ai` (alongside GPTBot
  and CCBot) sitewide. A generic scraper UA isn't literally that string, but the
  site owner's intent is clearly "don't let Anthropic's AI use this content" —
  building around that on a technicality isn't something to do quietly, so it's
  skipped.

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

This runs on a shared EC2 box alongside several other apps, all served through
**Apache** (not nginx — an earlier version of this deploy script installed nginx,
which lost the fight for port 80 against the Apache that was already running every
other site here, and silently never actually served anything; see the comment at the
top of `deploy/ec2-setup.sh` for the full story). `deploy/ec2-setup.sh` reflects the
real setup: it reuses Node/Apache/certbot/pm2 if already installed, deploys into its
own directory (`/var/www/contracts`), adds its own Apache vhost matched by domain
(other sites' vhosts and PM2 processes are untouched), and auto-picks a free local
port for the app rather than assuming 3000 is free — it wasn't; another app already
had it. The PM2 process is named `tenders-whizzonby`.

**First-time setup:**
1. Point your domain's DNS A record (`tenders.whizzonby.com`) at the EC2 instance's
   public IP.
2. Clone the repo directly into place:
   ```bash
   sudo mkdir -p /var/www/contracts && sudo chown $USER:$USER /var/www/contracts
   git clone https://github.com/whizzonby/Tenders.git /var/www/contracts
   ```
3. Run the setup script:
   ```bash
   cd /var/www/contracts
   bash deploy/ec2-setup.sh tenders.whizzonby.com
   ```
4. Add your `SAM_GOV_API_KEY` to `/var/www/contracts/backend/.env` (the script
   creates this file from the example on first run), then:
   ```bash
   pm2 restart tenders-whizzonby
   ```
5. Open your EC2 security group and confirm ports 80 and 443 are open to the
   internet (this is the most common reason a fresh EC2 box doesn't respond).

**To update after a code change** (don't re-run the setup script against an already-
running deploy — its port auto-picker would see the app's own current port as
"taken" and move it for no reason):
```bash
cd /var/www/contracts
git pull
cd backend
npm install --omit=dev
pm2 restart tenders-whizzonby
```
To watch logs: `pm2 logs tenders-whizzonby`.
To trigger a manual re-scrape without waiting for the cron: `curl -X POST http://localhost:3001/api/scrape-now`
(or whatever port `backend/.env` has `PORT` set to on this box).

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
