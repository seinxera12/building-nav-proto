# Day 9 — Robo-BN Integration Tasks

## Tasks

- [x] 1. Add `httpx` to `backend/requirements.txt`
- [x] 2. Add `ROBO_BN_URL` to `.env` and `docker-compose.yml`
- [x] 3. Fix `/tts/instruction` — decouple from circuit breaker and fix response buffering
- [x] 4. Add `/api/detect-language` call for text-only Auto input
- [x] 5. Fix clarification response language propagation
- [x] 6. Add Robo-BN startup health probe to `main.py`
- [ ] 7. Expand `search_terms` synonyms in `backend/seed.py`
