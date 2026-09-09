# Advertising

The ad code is built and switched off. Before you turn it on, three things
change, and two of them cost money. Read this first.

---

## 1. Ads make the site commercial — which breaks your current hosting

**Vercel Hobby is for non-commercial use only.** Running ads is commercial use.
Continuing on Hobby with ads live is a terms violation, and enforcement is
account suspension, not a warning email.

Your options:

| Option | Cost | Notes |
|---|---|---|
| **Vercel Pro** | **$20/mo** | Simplest. No code changes. |
| **Render** | ~$7.25/mo | You already pay for a workspace; a second service is billed separately. Node runtime, so the code runs unchanged. |
| Cloudflare Workers | $0–5/mo | Cheapest, but needs the OpenNext adapter *and* a different database driver — the interactive transactions in `submissions.ts`, `verification.ts` and `revisions.ts` would need rewriting. See `DEPLOYMENT.md`. |

**Break-even:** at $20/mo you need roughly 15–30k ad impressions a month to
cover hosting alone, depending on fill and rate. That is a real amount of
traffic for a new site in one metro area.

## 2. The map tiles also become non-compliant

CARTO's free basemap is non-commercial fair use. With ads running you need:

- **MapTiler** — free tier is non-commercial too; paid starts around $25/mo, or
- **Protomaps self-hosted on R2** — a single `.pmtiles` file for the whole US,
  served from the bucket you're already using. Effectively free, and you own it.

Protomaps is the right answer here. It's one `NEXT_PUBLIC_MAP_STYLE_URL` change
plus a one-off file upload, and it removes a third-party dependency rather than
adding a bill.

## 3. Alcohol content restricts which networks will take you

- **Google AdSense** restricts alcohol-related content by country and may
  limit or refuse serving. Approval is not a given.
- Some networks require a **hard age gate** — a real interstitial, not the
  dismissible 21+ notice the site has now. That notice was a deliberate choice
  (see the README); replacing it with a blocking gate will cost you first-visit
  conversions, and it is worth measuring before assuming it's required.
- Alcohol-adjacent inventory generally pays **below** general-interest rates.

---

## What's already built

`src/components/AdSlot.tsx` renders nothing unless both
`NEXT_PUBLIC_ADS_ENABLED=true` and `NEXT_PUBLIC_ADSENSE_CLIENT` are set. With
ads off, no third-party script loads at all.

It enforces two rules that are easy to lose once revenue is involved:

1. **Reserved height before load.** Ads that arrive late and push content down
   wreck Cumulative Layout Shift, and CLS is a ranking signal. An ad that costs
   you search traffic is not revenue.
2. **Never inside a listing.** Slots sit *between* cards, and the first inline
   slot is after the fifth result — the cheapest few are why people came. An ad
   that could be mistaken for a beer price is both bad UX and, on an
   alcohol-adjacent site, a compliance problem.

Current position: one inline slot in the results list. That is deliberately
conservative; add more only once you know the traffic is worth it.

---

## Enabling it

1. Move hosting off Hobby (above).
2. Switch the basemap to Protomaps or a commercial tile plan.
3. Get the ad account approved *before* changing anything else — approval is
   the step most likely to fail.
4. Add the network's script to `src/app/layout.tsx`, guarded by the same flag.
5. Set `NEXT_PUBLIC_ADS_ENABLED=true` and `NEXT_PUBLIC_ADSENSE_CLIENT`.
6. Re-check Core Web Vitals. If CLS moves, the reserved heights are wrong.

---

## An honest recommendation

**Don't turn this on yet.** The site has no traffic, so ads would earn roughly
nothing while costing $20/mo in hosting, a tile migration, and a slower page for
every visitor. Post to r/boston, see whether people actually contribute prices,
and revisit when there's an audience worth monetising.

If the goal is covering costs rather than profit, the cheaper paths are worth
considering first: the whole thing currently runs for $0, and a "buy me a beer"
link would cover a $20 month at far less cost to the experience.
