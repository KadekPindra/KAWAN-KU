# KAWAN

**Garuda Hacks 7.0 · Health track** — *automated link worker*: skrining kesepian UCLA-3 bulanan yang proaktif, deteksi deterministik, lalu merutekan orang ke aktivitas komunitas nyata dengan bingkai **kebutuhan** ("tim futsal kurang 1 orang"), bukan ajakan. Hidup di dalam Slack, bukan aplikasi baru.

Sumber kebenaran desain: [kawan-pitch-detail.md](kawan-pitch-detail.md) (why) · [kawan-tech-spec.md](kawan-tech-spec.md) (how) · [kawan-progress-plan.md](kawan-progress-plan.md) (progress).

---

## Prasyarat

- **Node.js 20+** dan npm
- (Opsional) **Postgres 14+** — hanya jika ingin persistence nyata; secara default proyek pakai repo in-memory
- (Opsional) **Slack app** (Socket Mode) + **Gemini API key** — hanya untuk jalur Slack/LLM live

```bash
npm install
```

Salin env template lalu isi sesuai kebutuhan:

```bash
cp .env.example .env
```

`.env` (semua opsional kecuali saat memakai jalur terkait):

| Var | Untuk | Default |
|---|---|---|
| `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_SIGNING_SECRET` | jalur Slack (`slack`, `slack:demo`) | — |
| `GEMINI_API_KEY` | LLM parse/compose (ada fallback template) | — |
| `KAWAN_LLM=template` | paksa offline (skip LLM, pakai template) | off |
| `KAWAN_REPO=postgres` | pakai Postgres, bukan in-memory | in-memory |
| `DATABASE_URL` | koneksi Postgres | `postgresql://kawan:kawan@localhost:5432/kawan` |
| `SCREEN_TICK_MS`, `ROUTE_TICK_MS` | interval scheduler proaktif | 1 jam · 1 minggu |

---

## Cara run

### 1. Demo headless (paling cepat — tanpa Slack/LLM/DB)

Seluruh alur (deteksi → routing need-framed → claim → klinis → agregat) tercetak di konsol:

```bash
npm run demo            # atau: KAWAN_LLM=template npm run demo  (offline penuh)
```

### 2. Test & typecheck

```bash
npm run typecheck
npm test
```

### 3. Seed & tampilan agregat (in-memory)

```bash
npm run seed            # cetak tabel tim demo + open needs
npm run metrics         # tampilan institusi (agregat k-anon; tak ada data per-orang)
```

### 4. Slack — sistem proaktif (produksi)

Scheduler menjalankan sendiri screen-tick + weekly-route; **tak ada perintah manual** (sesuai desain).

```bash
npm run slack
```

### 5. Slack — DEMO panggung (`/kawanku`)

Entrypoint terpisah dengan **satu** trigger manual untuk panggung: ketik `/kawanku` → bot kirim 3 pertanyaan UCLA-3 sekali → **langsung** menawarkan aktivitas (need-framed).

```bash
npm run slack:demo
```

> Trigger `/kawanku` sengaja dipisah dari `npm run slack` supaya jalur produksi tetap murni proaktif. Daftarkan slash command `/kawanku` di konfigurasi Slack app kamu (Socket Mode + interactivity aktif).

---

## Menjalankan dengan Postgres

Secara default proyek pakai repo **in-memory** (tak butuh DB). Untuk persistence nyata, aktifkan Postgres:

### a. Siapkan Postgres

Cara tercepat via Docker (cocok dengan `DATABASE_URL` default):

```bash
docker run --name kawan-pg \
  -e POSTGRES_USER=kawan -e POSTGRES_PASSWORD=kawan -e POSTGRES_DB=kawan \
  -p 5432:5432 -d postgres:16
```

Atau pakai Postgres lokal/hosted apa pun — cukup set `DATABASE_URL` di `.env`:

```
DATABASE_URL=postgresql://<user>:<pass>@<host>:5432/<db>
```

### b. Buat skema + seed data demo

Satu perintah ini membaca [src/adapters/postgres/schema.sql](src/adapters/postgres/schema.sql), membuat semua tabel (§4), lalu men-seed tim demo + needs:

```bash
npm run db:seed
```

Output sukses: `Postgres siap: skema dibuat, 15 orang + need demo di-seed ke garuda-demo.`

### c. Jalankan apa pun dengan Postgres

Set `KAWAN_REPO=postgres` di depan perintah (atau di `.env`):

```bash
KAWAN_REPO=postgres npm run slack        # sistem proaktif, data di Postgres
KAWAN_REPO=postgres npm run slack:demo    # demo /kawanku, data di Postgres
KAWAN_REPO=postgres npm run metrics       # agregat dibaca dari Postgres
```

> Catatan privasi (§8): tabel `institution_metrics` **tak punya `person_id`** dan tak pernah join ke `people` — secara struktural tak ada tempat melihat individu. Baris disuppress bila responder < `K_ANON`.

---

## Struktur (hexagonal — core tanpa impor SDK Slack)

```
src/
  config/      tunable §9 (threshold, interval adaptif, jitter, k-anon, …)
  domain/      tipe murni
  ports/       MessagingPort · Repository (interface)
  core/        Screening · Detection · BatchMatcher · NeedParser/InviteComposer · ClinicalRouter · Metrics · screenSchedule
  pipelines/   scheduler (proaktif) · monthly · weekly · continuous
  adapters/    slack (run=proaktif, demo=/kawanku) · portal (stub) · postgres · inMemory · llm(gemini)
  seed/ demo/ views/
tests/         79+ unit test (deterministik, tanpa Slack/DB/LLM)
```

## Skrip npm

| Skrip | Fungsi |
|---|---|
| `demo` | alur end-to-end headless di konsol |
| `slack` | Slack, **proaktif** (scheduler, tanpa trigger manual) |
| `slack:demo` | Slack, trigger demo `/kawanku` |
| `seed` / `metrics` | seed in-memory / tampilan agregat |
| `db:seed` | buat skema Postgres + seed |
| `typecheck` / `test` | tsc --noEmit / vitest |
