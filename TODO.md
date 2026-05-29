# Yaksha FAQ — TODO from ideas.md

## Phase 1 — Stabilize (Current → 10K users)

### High Priority
- [x] **Redis semantic cache** — Upstash Redis, getCachedResults/setCachedResults, 1hr TTL
- [x] **Env var validation on startup** — validateEnv() before app.listen()

### Medium Priority
- [x] **Sentry error tracking** — Sentry.init with expressIntegration, captureException on errors
- [ ] PM2 cluster mode — Express on all CPU cores

---

## Phase 2 — Scale (10K → 100K users)

- [ ] Migrate vector search to Qdrant
- [ ] Self-host embedding model on GPU (Modal.com / RunPod)
- [ ] CDN — Cloudflare for static assets
- [ ] PostgreSQL — user accounts, upvotes, comments, analytics
- [ ] Swagger UI — wire up OpenAPI spec

---

## Phase 3 — Grow (100K → 1M users)

- [ ] Kubernetes / multi-region deployment
- [ ] Multi-language embedding (Hindi, Tamil, Telugu — `paraphrase-multilingual-MiniLM-L12-v2`)
- [ ] LLM-powered follow-up answers (RAG + GPT-4o-mini → admin-approved FAQs)
- [ ] Voice search (Whisper API)

---

## Quick Wins

- [x] **Backend embeddings** — `@xenova/transformers` in Node.js (768-dim)
- [x] **Rate limiting** — `express-rate-limit` (300 req/15min)
- [x] **Health check endpoint** — `GET /api/health`
- [x] **Structured logging + request IDs** — `utils/logger.ts`
- [x] **Search analytics** — SearchLog + trending queries
- [x] **Failed-query triage** — admin panel shows zero-result queries
- [x] **Per-FAQ feedback** — thumbs up/down on answers
- [x] **Warm-up endpoint** — `POST /api/warm` for @xenova/transformers cold start
- [x] **Community Expert Layer** — expert role, expert resolve badge, "Request Expert Help" button, notifications to moderators

---

## Not Yet Started

| Item | Effort |
|------|--------|
| PM2 cluster mode | Low |
| Qdrant migration | High |
| Self-host GPU embeddings | Medium |
| CDN (Cloudflare) | Low |
| PostgreSQL | High |
| Swagger UI | Low |
| Multi-language embeddings | Medium |
| LLM RAG answers | Medium-High |
| Voice search | Low |
| Kubernetes | High |
