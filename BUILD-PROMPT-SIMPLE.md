# Build Impact Direct - Print Brokerage System

## What I Need

I run a print brokerage business. I need a simple app to track jobs, vendors, and profits. The current system is overbuilt with 30 database tables and 120+ fields on one model. I want something clean that actually matches how my business works.

## My Business

**The flow:**
1. Customer gives me a print order
2. I send work to vendor(s)
3. Vendor prints and ships
4. I invoice customer
5. Customer pays me
6. I pay vendor(s)

**Two types of vendors:**

1. **Bradford (my partner)** - They use JD Graphic to print. We split profit 50/50, and they get an extra 18% markup on paper costs.

2. **Direct vendors** - Everyone else. I keep the full profit margin.

**Multi-vendor jobs happen** - One job might have Bradford printing postcards AND Three Z doing the mailing. That's 2 vendor assignments on 1 job.

## What the App Should Do

- Track jobs from start to finish
- Track which vendor(s) are doing the work
- Calculate profit automatically (including Bradford split logic)
- Let me see what's owed and what's been paid
- Simple status tracking (not 15 different workflow states)

## What I Want for Access

- Web app for daily work
- Google Sheet backup that syncs with the app (so I always have my data accessible and can do quick calculations anywhere)
- Both should show the same profit numbers

## Tech Preferences

- Next.js (I like it)
- PostgreSQL
- Tailwind + shadcn/ui for clean UI
- Deploy to Railway or Vercel

## What I DON'T Need

- User authentication (just me using it)
- Email sending
- PDF generation
- AI features
- Complex approval workflows
- 15 different status fields

## Data I Have

There's an existing system with ~500 jobs. I have an export script that outputs JSON with:
- Companies (customers and vendors)
- Jobs (with old complex status fields)
- Purchase orders (need to become vendor assignments)
- File references (S3 URLs I want to keep using)

## Success =

1. I can create a job, assign vendors, and see profit calculated correctly
2. Bradford jobs show the 50/50 split plus paper markup
3. Direct vendor jobs show full profit to me
4. I can export to Google Sheet and formulas match the app
5. Clean, simple UI - not cluttered with fields I don't use
6. My old data is migrated over

## The Profit Math (This Is Important)

```
Sell Price: What customer pays me
Total Cost: What I pay vendor(s)
Gross Profit: Sell Price - Total Cost

If Bradford:
  Paper Markup = Paper Cost × 18%
  Bradford Gets = (Gross Profit × 50%) + Paper Markup
  I Keep = Gross Profit × 50%

If Direct Vendor:
  I Keep = Gross Profit (all of it)
```

Example:
- Sell Price: $5,000
- Bradford Cost: $3,000 (including $500 paper)
- Gross Profit: $2,000
- Paper Markup: $500 × 0.18 = $90
- Bradford Gets: $1,000 + $90 = $1,090
- I Keep: $1,000

## Go

Build this. Keep it simple. Make it work. The goal is a tool I'll actually use every day, not an over-engineered system I have to fight with.
