# Braindpost

AI content workspace untuk satu user. Stack: **FastAPI (Python)** + **React + Mantine v7 (TypeScript)**.

## Status modul

| Modul | Status |
|---|---|
| Ide Topik | ✅ end-to-end (DeepSeek) |
| Workflow | 🚧 stub |
| Draft | 🚧 stub |
| Calendar | 🚧 stub |

## Port

- Backend: `http://localhost:8001`
- Frontend: `http://localhost:5174`

(Berbeda dari default 8000/5173 untuk hindari konflik dengan PyScrapr.)

## Setup

### 1. Backend

Butuh [uv](https://docs.astral.sh/uv/) (rekomendasi) atau pip + venv.

```bash
cd backend
uv sync
```

Edit `backend/.env` dan isi `DEEPSEEK_API_KEY`.

Jalankan:

```bash
uv run uvicorn app.main:app --reload --port 8001
```

Cek: `http://localhost:8001/` → `{"app":"braindpost","status":"ok"}`
Docs: `http://localhost:8001/docs`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Buka `http://localhost:5174`. Vite akan proxy `/api/*` → backend `8001`.

## Struktur

```
braindpost/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry
│   │   ├── config.py            # env settings
│   │   ├── db.py                # SQLite + SQLAlchemy
│   │   ├── models.py            # tabel Idea/Draft/Calendar/Workflow
│   │   ├── schemas.py           # Pydantic
│   │   ├── api/                 # routes per modul
│   │   │   ├── ideas.py         # ✅ implemented
│   │   │   ├── workflow.py      # 🚧 stub
│   │   │   ├── drafts.py        # 🚧 stub
│   │   │   └── calendar.py      # 🚧 stub
│   │   └── providers/llm/
│   │       ├── base.py          # abstract LLMProvider
│   │       └── deepseek.py      # DeepSeek implementation
│   ├── pyproject.toml
│   └── .env                     # API keys
└── frontend/
    ├── public/                  # logo, favicon
    └── src/
        ├── main.tsx             # MantineProvider + Router
        ├── App.tsx              # routes
        ├── theme.ts             # Mantine theme
        ├── api/client.ts        # fetch wrapper
        ├── layouts/AppShell.tsx # sidebar layout
        └── pages/               # Workflow / Ideas / Drafts / Calendar
```

## Menambah AI provider lain

1. Buat file baru di `backend/app/providers/llm/<nama>.py`
2. Inherit dari `LLMProvider` (lihat `base.py`)
3. Implement `complete()` method
4. Import & pakai di route yang relevan

Sama untuk image provider — siapkan folder `backend/app/providers/images/` saat siap.
