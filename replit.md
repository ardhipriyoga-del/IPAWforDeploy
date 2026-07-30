# IP Admission Workspace (EMC)

Aplikasi manajemen rawat inap rumah sakit EMC — mencakup Admission, Billing, Operan, Monitoring, Kasir, Cloud Backup, dan AI Assistant.

## Run & Operate

- `pnpm --filter @workspace/emc-admission run dev` — frontend React/Vite (port 26052)
- `pnpm --filter @workspace/api-server run dev` — API Express server (port 8080)
- `pnpm run typecheck` — full typecheck semua package
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks dari OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + Tailwind CSS v4 + shadcn/ui
- API: Express 5 (serverless-compatible via `serverless-http`)
- State: TanStack Query, IndexedDB (idb), localStorage
- Routing: Wouter (hash-based untuk SPA)
- PDF: jsPDF + jspdf-autotable
- Excel: xlsx
- Charts: Recharts

## Where things live

- `artifacts/emc-admission/src/` — frontend React app
  - `pages/` — semua halaman (dashboard, patients, billing, kasir, dll)
  - `context/` — AuthContext, AppContext
  - `components/` — Layout, BillingCheckerPanel, EstimasiPanel
- `artifacts/api-server/src/routes/` — API routes:
  - `trakcare.ts` — scraping data pasien dari TrakCare
  - `cloud.ts` — proxy ke Google Apps Script (backup/restore)
  - `aiAssistant.ts` — SSE streaming ke Groq API
  - `ktm.ts` — monitoring KTM pasien
  - `health.ts` — health check
- `netlify/functions/api.ts` — Netlify serverless wrapper (serverless-http)
- `netlify.toml` — konfigurasi build & redirect Netlify
- `lib/api-spec/openapi.yaml` — OpenAPI spec

## Arsitektur Netlify Deployment

```
Browser → Netlify CDN
  /api/*  → Netlify Function (netlify/functions/api.ts)
           wraps Express app via serverless-http
  /*      → Static Vite build (artifacts/emc-admission/dist/public)
```

Build command: `pnpm install && pnpm --filter @workspace/emc-admission run build`
Publish dir: `artifacts/emc-admission/dist/public`

## API Routes

| Method | Path | Fungsi |
|--------|------|--------|
| GET | /api/healthz | Health check |
| GET | /api/trakcare/inpatients | Data rawat inap dari TrakCare |
| GET | /api/trakcare/igd-patients | Data IGD dari TrakCare |
| GET | /api/cloud/status | Cek koneksi ke Google Apps Script |
| POST | /api/cloud/backup | Backup data ke GAS/Google Drive |
| GET | /api/cloud/restore | Restore data dari GAS |
| POST | /api/ai/chat | AI Assistant streaming (Groq) |
| GET | /api/ktm/patients | Monitoring KTM pasien |

## Gotchas

- API server tidak menggunakan database — semua data disimpan di IndexedDB client-side
- Untuk deploy ke Netlify: push ke GitHub, lalu connect repo ke Netlify (build command sudah dikonfigurasi di `netlify.toml`)
- `VITE_HAS_API_PROXY=true` di `netlify.toml` memberitahu frontend bahwa `/api/*` tersedia via Netlify Functions
- AI Assistant menggunakan Groq API — butuh env var `GROQ_API_KEY` di Netlify environment variables

## User preferences

_Populate as needed._
