# Unsolicited Coverage

Email a video URL to a Resend inbound address. The desk ingests it into Mux, runs Mux Robots (`summarize`, `generate-chapters`, `find-key-moments`), and replies with a deadpan Hollywood coverage report: logline, genre guess, comps, chapter reel, key moments, and a **CONSIDER / PASS / RECOMMEND** stamp.

Voice: exhausted studio reader. Watched it once. Unreasonably confident.

Mux × Resend hackathon — Best reply wins.

## Pipeline

1. Resend webhook `email.received` hits `POST /api/webhooks/resend`.
2. The handler fetches the full message via the Receiving API (webhooks are metadata-only), then takes the first video/media URL from the body or a video attachment download link.
3. `POST /video/v1/assets` creates a Mux asset from that URL. Asset `passthrough` stores `{ emailId, from, subject, replyTo }` (trimmed to Mux’s 255-character asset limit). The same JSON is stored in Redis and sent in full on Robots jobs.
4. On `video.asset.ready`, three Robots jobs start. Token needs the `robots:*` scope.
5. `POST /api/webhooks/mux` collects completed jobs (event names use underscores: `robots.job.find_key_moments.completed`). When all three are terminal, Resend sends `RE: {original subject}`.

Both webhook signatures are verified (Resend/Svix and Mux `mux-signature`).

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Landing: what it is, where to email, hackathon line |
| `POST` | `/api/webhooks/resend` | Inbound `email.received` |
| `POST` | `/api/webhooks/mux` | `video.asset.ready` / `errored` + Robots job events |

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Deploy on Vercel. Point public webhooks at the production URL.

### Environment

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Send + Receiving API |
| `RESEND_WEBHOOK_SECRET` | Svix signing secret for the inbound webhook |
| `RESEND_FROM` | From address, e.g. `Coverage Desk <coverage@inbound.ctey.dev>` |
| `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` | Mux access token with Video **and** `robots:*` |
| `MUX_WEBHOOK_SECRET` | Mux webhook signing secret |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis (used if the KV vars are unset) |

Pending jobs live in Redis so serverless invocations can wait for all three Robots webhooks.

### Resend

1. Verify a sending domain (or use the inbound `.resend.app` address for receive).
2. Enable inbound / MX so mail reaches Resend.
3. Webhook: `email.received` → `https://<host>/api/webhooks/resend`.

### Mux

1. Create an access token with Video + `robots:*`.
2. Webhook → `https://<host>/api/webhooks/mux`.
3. Subscribe at least to:
   - `video.asset.ready`
   - `video.asset.errored`
   - `robots.job.summarize.completed` / `.errored`
   - `robots.job.generate_chapters.completed` / `.errored`
   - `robots.job.find_key_moments.completed` / `.errored`

Multi-word Robots workflows use hyphens on the API and underscores in webhook names.

### Use

Email a direct `.mp4` / `.mov` / `.webm` (or a Mux/Vimeo/YouTube URL) to the inbound address. Wait. Coverage arrives as a reply. YouTube ingest is a coin flip; direct files are the desk’s preference.

No Polar. No auth UI. No admin. The inbox is the product.
