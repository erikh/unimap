# Examples

Run from the repo root after `npm install`.

| Command | What it does | Needs network? | Needs keys? |
| --- | --- | --- | --- |
| `npm run example:offline` | Boots the in-process mock and runs geocode/route/places across providers, all returning the same unified shape. | No | No |
| `npm run example` | Same unified API against **real** providers (OpenStreetMap by default; Google/Apple added if their env vars are set). | Yes | Optional |

Equivalent direct invocations:

```bash
npx tsx examples/offline.ts
npx tsx examples/try.ts

# add real Google / Apple providers (with fallback) to examples/try.ts:
GOOGLE_MAPS_API_KEY=… npx tsx examples/try.ts
APPLE_MAPS_PRIVATE_KEY="$(cat AuthKey.p8)" APPLE_MAPS_KEY_ID=… APPLE_MAPS_TEAM_ID=… npx tsx examples/try.ts
```

`examples/offline.ts` is the most reliable first run — deterministic, no network, no credentials.
