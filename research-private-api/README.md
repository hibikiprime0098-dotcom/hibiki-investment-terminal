# Private investment market data backend (Vercel)

This folder is for a **separate Vercel project**, NOT for hosting EODHD data publicly on GitHub Pages. Publish a new Vercel project using this folder as its Root Directory (`research-private-api`), framework "Other", and add two secret production environment variables in Vercel Project Settings:

- `EODHD_API_TOKEN` — issued by EODHD to the user; this API plan must include international historical prices, including Japan (.TSE)
- `RESEARCH_ACCESS_KEY` — a user-created random passphrase, **minimum 20 characters**, to protect this API. Never share it publicly.

After redeploying, enter the Vercel API base URL (for example `https://YOUR-PROJECT.vercel.app`) and your access key into Investment Research Studio once. The frontend calls `/api/data?mode=history&code=8035`, obtains the latest **end-of-day** chart data for that user only, and recalculates five price checkpoints privately in their browser. You can also request `mode=fundamentals` for backed-by-vendor PER/PBR/PSR, ROE, etc.

This API permits only 78 configured symbols and the established GitHub Pages origin. It requires a Bearer access key and does not include the EODHD private key in responses. Do not send provider data to any public GitHub repository or republish it.

**Licence and cost:** EODHD personal terms prohibit redistribution/public display. A *paid* international-historical-data plan may be needed; the free plan offers only 20 calls per day, less than 78 symbols, and fundamentals require a separate entitlement. https://eodhd.com/financial-apis/terms-conditions

**Important:** The static GitHub Pages site remains accessible without this backend, but cannot automatically retrieve private EODHD data without an authenticated API.

Data-quality caveat: older OHLC values are adjusted using the vendor's adjusted_close ratio relative to the latest raw close. The method includes split and dividend effects; review splits and large discontinuities before placing any trade. Trailing PER/PBR/PSR are provider estimates with their own timestamps; not a promise of an executable live price.
