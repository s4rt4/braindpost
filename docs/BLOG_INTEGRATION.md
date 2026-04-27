# Braindpost ↔ Laravel Blog — Integration Contract

> **Status:** Final, locked-in 2026-04-26
> **Owners:** Tim Laravel Blog (`C:\laragon\www\myblog`) + Tim Braindpost (`C:\laragon\www\braindpost`)
> **Source of truth:** dokumen ini ada di kedua repo (`docs/BRAINDPOST_INTEGRATION.md` di Laravel, `docs/BLOG_INTEGRATION.md` di Braindpost). Update salah satu wajib mirror ke yang lain.

---

## 1. Overview

Braindpost = content workspace (FastAPI + React, single-user, local).
Laravel Blog = publication layer (Laravel 11 + Filament v3, AdSense-targeted).

```
Braindpost (UI: tombol "Publish to Blog" di status siap_publish)
   ↓ POST /api/v1/posts (Bearer token)
Laravel:
   1. Validate + create artikel status="processing"
   2. Background job: download images (featured + inline) → WebP convert → store local
   3. Status flip ke "draft"
Braindpost: poll GET /api/v1/posts/{id} sampai status != processing
   → tampilkan link admin_url ke user
Admin Laravel: kurasi (kategori, SEO, slug, dll) → publish
```

Key principles:
- **Braindpost = content origin**, **Laravel = curation + publication owner**
- **Idempotent** via `braindpost_id`
- **Async**: image download di background job
- **Field ownership boundary**: setelah artikel published, admin punya kontrol penuh

---

## 2. Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/posts` | Create / update artikel dari Braindpost |
| GET | `/api/v1/posts/{id}` | Polling status processing |

---

## 3. Authentication

Bearer token di header:
```
Authorization: Bearer {api_token}
```

Token di-generate dari Filament admin → Settings → "Braindpost API Token" → copy ke Braindpost settings:
```
publishing.laravel_url   = https://myblog.test
publishing.laravel_token = blog_xxx_yyy_zzz
```

Rate limit: **60 req / menit** per token.

---

## 4. POST /api/v1/posts — Request

### Headers
```
Authorization: Bearer {token}
Content-Type: application/json
Accept: application/json
```

### Body schema

```json
{
  "braindpost_id": "draft_abc123",
  "title": "Resep Soto Betawi Kuah Susu",
  "slug": "resep-soto-betawi-kuah-susu",
  "content_md": "# H1\n\n![alt](https://images.pexels.com/photos/123.jpg)\n\nKonten markdown...",
  "category": "Masakan Indonesia",
  "tags": ["soto", "betawi", "resep"],
  "keywords": ["resep soto betawi", "soto kuah susu"],
  "meta_title": "Resep Soto Betawi Kuah Susu | Tips Anti Gagal",
  "meta_description": "Cara membuat soto betawi kuah susu yang otentik dengan...",
  "featured_image_url": "https://images.pexels.com/photos/456.jpg",
  "featured_image_alt": "Semangkuk soto betawi dengan kuah susu",
  "featured_image_credit": "Foto: Jane Doe via Pexels"
}
```

### Field requirements

| Field | Type | Required | Default jika kosong |
|---|---|---|---|
| `braindpost_id` | string \| int | **Yes** | — (idempotency key) |
| `title` | string ≤255 | **Yes** | — |
| `content_md` | string | **Yes** | — |
| `slug` | string ≤255 | No | auto-generate dari title |
| `category` | string | No | null (admin isi nanti) |
| `tags` | string[] | No | `[]` |
| `keywords` | string[] | No | `[]` |
| `meta_title` | string ≤70 | No | derive dari title |
| `meta_description` | string ≤160 | No | derive dari content_md (160 char pertama) |
| `featured_image_url` | string (URL) | No | null |
| `featured_image_alt` | string | No, tapi disarankan | null |
| `featured_image_credit` | string | **Required jika `featured_image_url` ada** | — (Pexels TOS attribution) |

### Query params

| Param | Values | Effect |
|---|---|---|
| `force` | `true` | Force update artikel `published`. Lihat section 7.1. |

---

## 5. POST /api/v1/posts — Response

### 201 Created (artikel baru) atau 200 OK (re-POST update)

```json
{
  "id": 42,
  "braindpost_id": "draft_abc123",
  "slug": "resep-soto-betawi-kuah-susu",
  "status": "processing",
  "admin_url": "https://myblog.test/admin/articles/42/edit",
  "public_url": null,
  "updated_fields": ["title", "content_md"],
  "preserved_fields": ["slug", "category", "tags", "featured_image", "meta_title", "meta_description"],
  "created_at": "2026-04-26T10:00:00Z",
  "updated_at": "2026-04-26T10:00:00Z"
}
```

- `updated_fields` & `preserved_fields` selalu dikirim. Pada create awal, `preserved_fields = []`.
- `public_url = null` kecuali artikel sudah `published`.

### Error responses

| Status | Trigger | Body |
|---|---|---|
| `400` | Payload invalid | `{ "error": "validation", "errors": { "field": ["msg"] } }` |
| `401` | Token salah / missing | `{ "error": "unauthorized" }` |
| `409` | `braindpost_id` exists & artikel `published`, tanpa `?force=true` | `{ "error": "conflict", "message": "Artikel sudah published. Pakai ?force=true.", "admin_url": "..." }` |
| `422` | URL gambar invalid / SSRF blocked / >5MB | `{ "error": "image_validation", "message": "..." }` |
| `429` | Rate limit | `{ "error": "rate_limited", "retry_after": 60 }` |
| `500` | Server error | `{ "error": "server_error", "message": "..." }` |

---

## 6. GET /api/v1/posts/{id} — Polling

### Headers
```
Authorization: Bearer {token}
```

### Response 200 OK

```json
{
  "id": 42,
  "braindpost_id": "draft_abc123",
  "slug": "resep-soto-betawi-kuah-susu",
  "status": "draft",
  "processing_error": null,
  "admin_url": "https://myblog.test/admin/articles/42/edit",
  "public_url": null,
  "downloaded_images": 5,
  "total_images": 5,
  "updated_at": "2026-04-26T10:01:30Z"
}
```

### Status values

| Status | Meaning |
|---|---|
| `processing` | Background job sedang download images |
| `draft` | Job selesai, siap admin kurasi |
| `processing_failed` | Job gagal — cek `processing_error`, fix manual via `admin_url` |
| `scheduled` | Admin set scheduled publish |
| `published` | Live di blog (admin publish) |

### Polling strategy (saran sisi Braindpost)

Exponential backoff: `[3s, 5s, 8s, 13s, 20s, 30s]`, max ~80 detik total. Stop saat status != `processing`.

---

## 7. Idempotency & Re-POST Rules

`braindpost_id` adalah idempotency key.

### Matrix

| Skenario | Perilaku Laravel |
|---|---|
| `braindpost_id` baru | Create artikel, status=`processing` |
| Same `braindpost_id`, status Laravel = `draft` | Overwrite `title` + `content_md`. Field admin (kategori, tags, slug, SEO meta, featured_image) **tidak di-overwrite** kalau sudah diisi admin |
| Same `braindpost_id`, status Laravel = `published`, tanpa `?force=true` | **409 Conflict** |
| Same `braindpost_id`, status Laravel = `published`, dengan `?force=true` | Update field whitelist (lihat 7.1) |
| Same `braindpost_id` POST 2x dalam <5 detik (race) | Return existing record (idempotent dedup) |

### 7.1 Force update whitelist (`?force=true`)

| Field | Updateable? | Alasan |
|---|---|---|
| `title` | ✅ | Slug stays — URL stabil |
| `content_md` | ✅ | Alasan utama force update (typo / info update) |
| `meta_title` | ✅ | Tidak terkait URL |
| `meta_description` | ✅ | Aman |
| `keywords` | ✅ | Aman |
| `slug` | ❌ | URL Google index NEVER change |
| `category`, `tags` | ❌ | Admin-managed |
| `featured_image_*` | ❌ | Admin mungkin sudah ganti |
| `status`, `published_at` | ❌ | Admin-managed |

Response selalu kirim `updated_fields` + `preserved_fields` — Braindpost UI tampilkan ke user:
> *"Updated: title, content. Preserved by admin: slug, category, tags, featured image."*

---

## 8. Image Handling

### Flow

1. Braindpost kirim URL (Pexels/Unsplash/Pixabay/dll) di `featured_image_url` + URL inline di `content_md`.
2. Laravel parse `content_md`, regex `!\[([^\]]*)\]\((https?://[^)]+)\)` → kumpulkan semua image URLs.
3. `ProcessPostMediaJob` (queue) download semua → simpan via Spatie Media Library → convert WebP (Intervention Image, q=85).
4. Resize: max **1920px** width, preserve aspect ratio.
5. Markdown di-rewrite: `![alt](pexels.com/...)` → `![alt](/storage/media/{id}.webp)`.
6. Featured image attribution disimpan di `featured_image_credit` → tampil di blog public + EXIF metadata.

### Constraints

- **Max ukuran:** 5 MB per image (sebelum resize). Lebih besar → reject (`422`).
- **Timeout download:** 30 detik per image.
- **URL only `http(s)://`** — private IP / localhost / link-local **diblokir** (SSRF protection).
- **Format diterima:** JPEG, PNG, WebP, AVIF, GIF (akan di-convert ke WebP).
- **Inline image** yang URL-nya sudah `https://{LARAVEL_URL}/...` → skip download (idempotent re-POST aman).
- **Duplicate URLs** (mis. featured = inline ke-1) → dedup via SHA-256 hash.

### Pexels attribution

`featured_image_credit` **wajib** kalau `featured_image_url` dari Pexels. Format saran: `"Foto: {photographer} via Pexels"`.

Akan ditampilkan:
- Public blog: caption kecil di bawah hero image
- File metadata (EXIF): copyright field

---

## 9. Staging Mode

Laravel side support env var `BLOG_MODE=staging|production`.

Saat `BLOG_MODE=staging`:
- Header `X-Robots-Tag: noindex, nofollow` di semua response → Google tidak index
- Banner kuning di top page: `[STAGING — konten percobaan]`
- `sitemap.xml` return 404
- Skip GSC API submission (kalau ada nanti)
- Token & DB terpisah dari production

**Cara pakai:** spin up Laragon site kedua di `staging.myblog.test`, set `BLOG_MODE=staging` di `.env`. Braindpost ganti `publishing.laravel_url` ke staging URL untuk testing.

---

## 10. Versioning

URL prefix: `/api/v1/`. Versi 2 nanti = route group baru `/api/v2/`. Tidak break v1.

Header `Accept` **tidak digunakan** untuk versioning.

---

## 11. Out of Scope (untuk MVP)

- Webhook callback Laravel → Braindpost (polling cukup; Braindpost local-only, tidak punya public URL).
- Multi-target publishing (1 Laravel target untuk MVP).
- Scheduled publish trigger dari Braindpost (admin Laravel handle scheduling).
- Real-time / streaming responses.
- Auto-republish on Braindpost edit (manual `?force=true` cukup).

---

## 12. Changelog

| Date | Change | Note |
|---|---|---|
| 2026-04-26 | Initial contract finalized | Hasil diskusi tim Laravel + tim Braindpost |
| 2026-04-26 | Sprint 5 — Laravel side LIVE | Lihat section 13 untuk implementation notes |

---

## 13. Implementation Notes (Sprint 5 — Laravel side LIVE)

> **Status: endpoint operational dan sudah di-smoke-test.** Spec di section 1-12 di atas adalah contract — tidak berubah. Section ini = catatan operasional untuk tim Braindpost.

### 13.1 Token format & cara dapat token

- Format: `blog_` + 48 chars alphanumeric (mis. `blog_aB7xY9pQ2mNvK8rT4wL6sJ1hG5fD3eC9zX0`)
- Cara generate (admin Laravel):
  1. Login ke `/admin` Filament
  2. Buka **Pengaturan → tab Braindpost**
  3. Klik tombol **🔄 (Generate token baru)** di samping field "Braindpost API Token"
  4. Klik **Simpan**
  5. Copy token, paste ke setting Braindpost: `publishing.laravel_token`

Token dibandingkan dengan **`hash_equals`** (timing-safe). Token selalu di-treat sebagai opaque string — Braindpost cukup simpan & kirim apa adanya di `Authorization: Bearer ...`.

### 13.2 Headers wajib dikirim Braindpost

```
Authorization: Bearer {token}
Content-Type: application/json
Accept: application/json     ← PENTING! lihat 13.3
```

### 13.3 Pentingnya `Accept: application/json`

Laravel di mode `APP_DEBUG=true` (dev) akan render **HTML error page** kalau request tidak punya `Accept: application/json`. Untuk Braindpost yang parse JSON, ini bakal crash.

**Solusi:** Selalu kirim `Accept: application/json`. Laravel akan return JSON error responses (400/401/409/422/429/500) dengan format yang konsisten.

### 13.4 Status flow — sync vs async queue

Contract bilang response.status awal = `processing`, lalu polling sampai `draft`. Realitanya tergantung mode queue di Laravel:

| Queue mode | Response saat create | Polling perlu? |
|---|---|---|
| `sync` (dev default) | langsung `draft` (job inline) | Tidak perlu — sudah final |
| `redis` / `database` (production) | `processing` | Ya — poll sampai != processing |

**Saran sisi Braindpost:** **selalu polling** terlepas dari status awal. Kalau status sudah `draft`/`processing_failed` di response create, polling pertama langsung dapat hasil final → no harm. Kalau `processing`, polling exponential backoff sesuai section 6.

### 13.5 Sample curl commands

**Create:**
```bash
curl -X POST https://myblog.test/api/v1/posts \
  -H 'Authorization: Bearer blog_xxxx' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "braindpost_id": "draft_abc123",
    "title": "Resep Soto Betawi",
    "content_md": "# Hello\n\n![alt](https://images.pexels.com/photos/123.jpg)\n\nKonten...",
    "category": "Masakan",
    "tags": ["soto", "betawi"],
    "meta_title": "Resep Soto Betawi | Tips",
    "meta_description": "...",
    "featured_image_url": "https://images.pexels.com/photos/456.jpg",
    "featured_image_alt": "Foto soto",
    "featured_image_credit": "Foto: Jane Doe via Pexels"
  }'
```

**Polling:**
```bash
curl https://myblog.test/api/v1/posts/42 \
  -H 'Authorization: Bearer blog_xxxx' \
  -H 'Accept: application/json'
```

**Force update (artikel sudah published):**
```bash
curl -X POST 'https://myblog.test/api/v1/posts?force=true' \
  -H 'Authorization: Bearer blog_xxxx' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{"braindpost_id":"draft_abc123","title":"Typo fixed","content_md":"..."}'
```

### 13.6 Storage URL pattern (downloaded images)

Setelah `ProcessPostMediaJob` selesai, gambar tersimpan via Spatie Media Library di:

```
{APP_URL}/storage/{media_id}/{filename}
```

Contoh:
- Original: `https://myblog.test/storage/1/pexels-photo-1640772.jpeg`
- WebP thumb conversion: `https://myblog.test/storage/1/conversions/pexels-photo-1640772-thumb.webp`
- WebP medium: `.../conversions/pexels-photo-1640772-medium.webp`
- WebP large: `.../conversions/pexels-photo-1640772-large.webp`

URL inline image di `content_md` di-rewrite dari URL Pexels asli → URL local (path `/storage/...`). Format Markdown tetap `![alt](url)`.

### 13.7 Race condition handling

Server pakai Cache-based **named lock** (Redis) per `braindpost_id` selama 10 detik. Kalau Braindpost POST 2x dalam window itu (misal user double-click), request kedua akan langsung **return existing record** (dedup), bukan create duplicate.

Kalau lock tidak bisa diakuisisi DAN tidak ada existing record → `429 rate_limited` (sangat jarang).

Plus rate limit Laravel-default: **60 req/menit per token** via `throttle:60,1` middleware. Kalau di-exceed: `429 Too Many Requests`.

### 13.8 Field ownership matrix — implementasi pasti

Confirmed via smoke test:

**New article (status=processing→draft):**
- Semua field dari payload tersimpan
- Slug: pakai payload kalau ada, else auto-generate dari title
- Category & tags: auto-create kalau belum ada di master list (no need to sync upfront)

**Re-POST, status Laravel = `draft`:**
- `title`, `content_md`: SELALU overwrite (kalau berbeda)
- `meta_title`, `meta_description`, `keywords`: overwrite **HANYA KALAU admin belum isi** (set-if-empty)
- `category`, `tags`: same — set-if-empty
- `featured_image`: download via job HANYA KALAU admin belum upload
- `slug`: **NEVER** changes
- Response include `updated_fields` + `preserved_fields` — Braindpost UI tampilkan ke user

**Re-POST, status Laravel = `published`, no `?force=true`:**
- 409 Conflict, dengan `admin_url` di body

**Re-POST, status Laravel = `published`, dengan `?force=true`:**
- Whitelist: `title`, `content_md`, `meta_title`, `meta_description`, `keywords`
- Always preserved: `slug`, `category`, `tags`, `featured_image`, `status`, `published_at`

### 13.9 Image processing — tested behaviors

Test #9 (SSRF block):
- POST `featured_image_url=http://127.0.0.1/evil.jpg` → response 201 dengan status=draft initially, BUT job synchronously fail → final status=`processing_failed`, `processing_error`: "SSRF blocked: IP private/loopback/link-local terdeteksi (127.0.0.1)..."
- Polling endpoint langsung kasih status final + error message

Test #10 (Real Pexels):
- POST `featured_image_url=https://images.pexels.com/photos/.../image.jpeg` → SSRF guard pass (Pexels CDN public IP), download success
- Spatie Media Library attach: `pexels-photo-1640772.jpeg`, MIME `image/jpeg`, 203KB
- WebP conversions auto-generated: `thumb`, `medium`, `large` di `/storage/.../conversions/...-thumb.webp` dst.
- Custom property `source_url` preserved untuk audit trail

### 13.10 Error scenarios — confirmed responses

| Skenario | HTTP | Body |
|---|---|---|
| No `Authorization` header | 401 | `{"error":"unauthorized","message":"Bearer token invalid atau hilang."}` |
| Wrong token | 401 | sama |
| Missing `title` / `content_md` | 400 | `{"error":"validation","errors":{"title":[...]}}` |
| Missing `featured_image_credit` saat `featured_image_url` ada | 400 | validation: required_with rule |
| `braindpost_id` exists + status=published, no force | 409 | `{"error":"conflict","admin_url":"..."}` |
| Image SSRF (private IP) | 201 (article created) → polling shows `processing_failed` | `processing_error` field |
| Image >5MB | 201 → polling `processing_failed` | error: "Image terlalu besar" |
| Image URL 404 | 201 → polling `processing_failed` | error: "HTTP 404 saat download..." |

### 13.11 Untuk Braindpost agent — TLDR

1. **Selalu kirim 3 headers**: `Authorization: Bearer ...`, `Content-Type: application/json`, `Accept: application/json`.
2. **Setelah POST sukses (201/200)**, baca `id` dari response, lalu poll `GET /api/v1/posts/{id}` dengan exponential backoff sampai status != `processing` ATAU 80 detik berlalu (timeout).
3. **Jika 409 di re-POST**: tampilkan ke user "Artikel sudah live, force update?" → POST ulang dengan `?force=true`.
4. **Jika polling akhir = `processing_failed`**: tampilkan `processing_error` ke user + link `admin_url` untuk fix manual.
5. **Featured image credit wajib** kalau kirim `featured_image_url` (Pexels TOS attribution).
6. **`braindpost_id` adalah idempotency key** — pakai ID stabil dari Braindpost DB, jangan random per-request.
7. **Inline images di `content_md`**: tetap kirim URL Pexels asli — Laravel akan download & rewrite ke URL lokal otomatis.

### 13.12 Operational

- Laravel side current QUEUE_CONNECTION: **`sync`** (dev) — production sebaiknya flip ke `redis` + run `php artisan queue:work` daemon.
- Token rotation: regenerate via Settings UI → update setting di Braindpost. No downtime kalau Braindpost re-baca setting before next request.
- Rate limit: 60 req/menit per IP. Kalau Braindpost batch publish, throttle di sisi Braindpost (≥1 req/sec).
- Logging: server log Laravel (`storage/logs/laravel.log`) catat semua failed jobs dengan stack trace.
