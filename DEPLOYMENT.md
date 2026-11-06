# CardFlow Production & Zero-Cost Deployment Guide

This guide covers deploying CardFlow for **$0/month** using **Vercel (Frontend)**, **Render Free Tier or Hugging Face Spaces (Python OCR Backend)**, and **Supabase Free Tier (PostgreSQL + RLS + Private Storage)**—including our built-in **4-Layer Anti-Sleep Architecture** so Render never disrupts user workflows.

---

## 1. Tackling Render Free-Tier Sleep (4-Layer Seamless Architecture)

Render's free web services sleep after **15 minutes of inactivity** and provide **750 free instance hours/month** (more than the `744` hours in a 31-day month, meaning 1 service can stay awake 24/7 all month for free). CardFlow tackles this with four layers already built into the repository:

1. **Layer 1: Lightweight Keep-Alive Endpoint (`GET /api/v1/ping`)**:
   - Implemented in [main.py](file:///c:/Users/devil/Desktop/business-card-ocr/backend/app/main.py#L275-L283) and proxied via [src/app/api/keep-alive/route.ts](file:///c:/Users/devil/Desktop/business-card-ocr/src/app/api/keep-alive/route.ts).
   - Responds in `< 2ms` without touching the database or OCR engine.
2. **Layer 2: Automated 10-Minute External Cron Pinger**:
   - **Option A (cron-job.org / UptimeRobot - Recommended, 100% Free)**: Create a free monitor on `cron-job.org` or `uptimerobot.com` pointing to `https://<your-render-service>.onrender.com/api/v1/ping` every **10 minutes**. Because `10 min < 15 min`, Render **never spins down**.
   - **Option B (GitHub Actions Workflow Included)**: [.github/workflows/keep-backend-awake.yml](file:///c:/Users/devil/Desktop/business-card-ocr/.github/workflows/keep-backend-awake.yml) runs on a `*/10 * * * *` schedule. Add `BACKEND_PING_URL` to your GitHub repository secrets.
3. **Layer 3: Proactive Browser Pre-Warming on Page Load**:
   - Implemented in [AuthContext.tsx](file:///c:/Users/devil/Desktop/business-card-ocr/src/context/AuthContext.tsx#L51-L55) via [`api.warmupBackend()`](file:///c:/Users/devil/Desktop/business-card-ocr/src/lib/api.ts#L118-L128).
   - The instant a user opens `/login` or `/dashboard` on Vercel, the browser fires a non-blocking wake-up ping to the backend in the background while the user is still reading the screen or picking a visiting card image.
4. **Layer 4: Automatic Cold-Start Retry & 512 MB RAM Optimization**:
   - [`request()`](file:///c:/Users/devil/Desktop/business-card-ocr/src/lib/api.ts#L67-L115) in `src/lib/api.ts` automatically retries `502`, `503`, `504`, or transient network errors with exponential backoff (`2s`, `4s`) if Render is mid-wakeup.
   - [backend/Dockerfile](file:///c:/Users/devil/Desktop/business-card-ocr/backend/Dockerfile) and [ocr_engine.py](file:///c:/Users/devil/Desktop/business-card-ocr/backend/app/services/ocr_engine.py#L41-L55) enable `OCR_LOW_MEMORY_MODE=1` on Render Free Tier (`512 MB RAM`), pre-caching lightweight `PP-OCRv5_mobile_det` and `PP-OCRv5_mobile_rec` models at Docker build time so cold starts require **zero weight downloads** and stay well under 512 MB RAM.

---

## 2. Step-by-Step Free Deployment

### Step 1: Supabase Database & Storage (Already Provisioned)
Your Supabase project (`pfuysishdwypdmdksbnn`) is already configured with all 9 tables, Row Level Security (`RLS`), and both private storage buckets (`visiting-cards-original` and `visiting-cards-processed`).

### Step 2: Deploy Python OCR Backend to Render (Free Tier)
1. Push your repository to GitHub (`.env.local` and `pw.txt` are git-ignored).
2. In the **Render Dashboard**, click **New + -> Blueprint** (uses [render.yaml](file:///c:/Users/devil/Desktop/business-card-ocr/render.yaml)) or **New + -> Web Service** with:
   - **Runtime**: `Docker`
   - **Dockerfile Path**: `./backend/Dockerfile`
   - **Docker Context Directory**: `./backend`
   - **Instance Type**: `Free`
3. Set the following Environment Variables in Render:
   - `OCR_LOW_MEMORY_MODE=1`
   - `MAX_CONCURRENT_OCR_WORKERS=1`
   - `SUPABASE_URL=https://pfuysishdwypdmdksbnn.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>`
   - `OCR_INTERNAL_SHARED_SECRET=<any-strong-random-string>`
   - `OCR_SERVICE_URL=https://<your-render-service>.onrender.com`
   - `DATABASE_URL=postgresql://postgres.pfuysishdwypdmdksbnn:<URL-ENCODED-DB-PASSWORD>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require` *(Using Supabase PostgreSQL ensures all data persists across Render restarts)*.
4. Add `https://<your-render-service>.onrender.com/api/v1/ping` to **UptimeRobot** or **cron-job.org** (interval: **10 minutes**).

> **Alternative Free Backend Option (16 GB RAM, Zero OOM)**: You can also deploy the exact same [backend/Dockerfile](file:///c:/Users/devil/Desktop/business-card-ocr/backend/Dockerfile) to **Hugging Face Spaces (Free CPU Basic: 2 vCPU, 16 GB RAM)** by creating a new Space with SDK = `Docker` and setting `PORT=7860`.

### Step 3: Deploy Next.js Frontend to Vercel (Free Hobby Tier)
1. Import the repository into **Vercel** (uses [vercel.json](file:///c:/Users/devil/Desktop/business-card-ocr/vercel.json)).
2. Configure the Vercel Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL=https://pfuysishdwypdmdksbnn.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>`
   - `NEXT_PUBLIC_OCR_API_URL=https://<your-render-service>.onrender.com`
3. Click **Deploy**. Notice that `backend/app/main.py` already whitelists `https://*.vercel.app` via `allow_origin_regex`, so preview and production Vercel URLs work out of the box.
