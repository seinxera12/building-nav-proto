# Daily Start Guide

## 1. Start Backend and Database

From the repo root:

```powershell
docker compose up --build -d
```

Check backend health:

```powershell
curl.exe http://localhost:8000/health
```

Expected:

```json
{"status":"ok","nodes":14}
```

If `nodes` is `0`, seed and restart:

```powershell
docker compose exec backend python seed.py
docker compose restart backend
```

## 2. Start Frontend

In a second terminal:

```powershell
cd frontend
npm run dev -- --host 0.0.0.0
```

Vite will print the available URLs. Use the `https://localhost:<port>` URL on desktop.

For phone testing, use the network URL Vite prints, for example:

```text
https://192.168.1.78:<port>
```

The port is usually `5173`, but Vite may choose `5174`, `5175`, etc. if earlier ports are busy.

## 3. Useful Test URLs

Desktop demo mode without camera:

```text
https://localhost:<port>/?demo=1
```

Debug node labels:

```text
https://localhost:<port>/?debug=1
```

Demo mode plus debug labels:

```text
https://localhost:<port>/?demo=1&debug=1
```

## 4. Generate QR Printouts

```powershell
docker compose exec backend python tools/generate_qr.py
```

Output files:

```text
backend/seed/qr_printouts/
```

## 5. Stop Everything

Stop frontend with `Ctrl+C` in the frontend terminal.

Stop backend/database:

```powershell
docker compose down
```
