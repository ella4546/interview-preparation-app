# Interview Prep App

An AI-powered interview preparation platform. Users answer technical questions, get graded feedback from Gemini, watch curated YouTube explanations for concepts they missed, and earn XP as they build streaks.

## Stack

- Frontend: React + Vite + TypeScript + Tailwind CSS
- Backend: FastAPI (Python 3.11+)
- Database + Auth: Supabase (Postgres)
- AI: Google Gemini
- Video lookup: YouTube Data API v3

## Project structure

- `backend/` — FastAPI server
- `frontend/` — React app
- `.github/` — CI workflows

## Prerequisites

- Python 3.11+
- Node.js 20+
- A Supabase project (free tier is fine)
- A Google Gemini API key
- A YouTube Data API v3 key

## Setup

### 1. Configure environment

Copy the example env files and fill in your keys:

    cp backend/.env.example backend/.env
    cp frontend/.env.example frontend/.env

### 2. Backend

    cd backend
    python -m venv .venv
    .venv\Scripts\activate
    pip install -e .
    uvicorn app.main:app --reload

Backend runs on http://localhost:8000. API docs at http://localhost:8000/docs.

### 3. Frontend

    cd frontend
    npm install
    npm run dev

Frontend runs on http://localhost:5173.

### 4. Database

Apply the SQL migration in `backend/migrations/0001_init.sql` via the Supabase SQL editor.

## Development

- Backend lint/format: `ruff check .` and `ruff format .`
- Backend tests: `pytest`
- Frontend lint: `npm run lint`
- Frontend build: `npm run build`

## License

MIT