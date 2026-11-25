# AI Clinical Triage & Urdu Voice Receptionist (`ai-triage-saas`)

An AI-powered hospital reception, clinical triage, and appointment booking system built for healthcare facilities in Pakistan. Patients can speak naturally in **Urdu or English** with an AI voice receptionist (**Riley**), look up live doctor availability by name or symptoms, get triaged automatically via **Google Gemini**, and appear in real time on the hospital's **Reception Desk** and **Doctor Workbench**.

---

## Key Features

* **Bilingual Voice Receptionist (Urdu & English):** Powered by **Vapi.ai** and **Soniox Multilingual STT** for Pakistani Urdu/English code-switching.
* **Dynamic Doctor Directory Lookup:** Matches partial doctor names, Urdu aliases, specialties, and patient symptoms against a live Supabase `doctors` table.
* **Automated Clinical Triage:** Uses **Google Gemini** (`ai-service/app/triage.py`) to classify urgency (`priority`), route to the right `department`, generate a `clinical_summary`, and suggest a `recommended_action`.
* **Real-Time Hospital Dashboard:** Next.js frontend subscribed to **Supabase Realtime** so booked appointments appear instantly on the Reception Desk and Doctor Workbench without page refreshes.
* **Digital Prescriptions:** Doctors can generate and view patient prescriptions via `/rx/[id]`.

---

## Pilot Doctor Directory

| Doctor | Specialty | Aliases / Keywords |
| :--- | :--- | :--- |
| **Dr. Arif** | Orthopedics | Arif, Haddi Doctor, bone, knee, joint, fracture |
| **Dr. Asif** | Oncology | Asif, Cancer Doctor, tumor, chemotherapy, biopsy |
| **Dr. Zahid Awan** | General Surgery | Zahid Awan, Surgeon, hernia, appendix, gallbladder |
| **Dr. Zahid Aman** | Cardiology | Zahid Aman, Heart Doctor, chest pain, BP, ECG |

---

## Project Structure

```text
ai-triage-saas/
├── ai-service/                 # FastAPI backend & Gemini triage engine
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py             # API routes (/health, /triage, /vapi-book, /lookup-doctor)
│   │   └── triage.py           # Google Gemini clinical triage logic
│   ├── requirements.txt
│   └── .env                    # (Ignored by Git) Backend secrets
├── frontend/                   # Next.js (App Router, TypeScript, Tailwind CSS)
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx        # Reception Desk & Doctor Workbench
│   │   │   └── rx/[id]/page.tsx# Digital prescription view
│   │   ├── components/
│   │   │   └── PrescriptionModal.tsx
│   │   └── lib/
│   │       └── supabase.ts     # Supabase client setup
│   ├── package.json
│   └── .env.local              # (Ignored by Git) Frontend public keys
├── .gitignore
└── README.md
```

---

## Prerequisites

* **Python 3.10+**
* **Node.js 18+** & **npm**
* **Supabase** account (PostgreSQL + Realtime enabled)
* **Google Gemini API Key**
* **Vapi.ai** account
* **ngrok** (for local voice webhook testing)

---

## 1. Database Setup (Supabase)

In your **Supabase SQL Editor**, ensure the following tables exist with Row Level Security (RLS) configured:
1. **`triage_appointments`** — Stores patient bookings, `doctor_name`, `priority`, `department`, `clinical_summary`, `recommended_action`, and `status` (`WAITING`, etc.). Enable **Realtime** on this table.
2. **`doctors`** — Stores `full_name`, `aliases`, `specialty`, `symptoms_keywords`, `timings`, `fee`, and `is_available`.
3. **`prescriptions`** — Stores doctor prescriptions linked to appointments.

---

## 2. Environment Variables

### Backend (`ai-service/.env`)
Create `ai-service/.env` and add:
```env
GEMINI_API_KEY=your_google_gemini_api_key
SUPABASE_URL=[https://your-project-id.supabase.co](https://your-project-id.supabase.co)
SUPABASE_KEY=your_supabase_anon_or_service_key
```

### Frontend (`frontend/.env.local`)
Create `frontend/.env.local` and add:
```env
NEXT_PUBLIC_SUPABASE_URL=[https://your-project-id.supabase.co](https://your-project-id.supabase.co)
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 3. How to Run the Whole Project Locally

You will need **3 terminal tabs** running simultaneously for full end-to-end voice + dashboard testing.

### Terminal 1: Start the FastAPI Backend (`ai-service`)
```bash
cd ai-service
python3 -m venv venv
source venv/bin/activate          # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Verify it is running at: `http://localhost:8000/health`

### Terminal 2: Start the Next.js Frontend (`frontend`)
```bash
cd frontend
npm install
npm run dev
```
Open the dashboard at: `http://localhost:3000`

### Terminal 3: Expose Backend to Vapi via ngrok
```bash
ngrok http 8000
```
Copy the `https://....ngrok-free.dev` forwarding URL from ngrok.

---

## 4. Vapi.ai Voice Agent Setup

1. **Create API Tools in Vapi → Tools:**
   * **`lookup_doctor`** (`POST` → `https://<your-ngrok-url>/api/v1/lookup-doctor`)
     * Required body property: `query` (`string`)
   * **`book_appointment`** (`POST` → `https://<your-ngrok-url>/api/v1/vapi-book`)
     * Body properties: `patient_name`, `age`, `phone`, `symptoms`, `doctor_name`
2. **Configure Assistant (`Riley`):**
   * **Transcriber:** Soniox `STT RT v5` — Languages: `English`, `Urdu` (`Strict Language: On`).
   * **Model:** `GPT-4.1` with Urdu receptionist + `lookup_doctor` system prompt.
   * **Voice:** ElevenLabs (`Multilingual v2`) or Azure Urdu (`ur-PK-UzmaNeural`).
   * **Tools:** Attach both `lookup_doctor` and `book_appointment`, then click **Publish**.

---

## API Reference (`ai-service`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Service health check |
| `POST` | `/api/v1/triage` | Runs Gemini clinical triage on patient symptoms |
| `POST` | `/api/v1/lookup-doctor` | Searches available doctors in Supabase by name, alias, specialty, or symptom |
| `POST` | `/api/v1/vapi-book` | Triages symptoms via Gemini and inserts confirmed booking into Supabase |

---

## Deployment Roadmap

* **Backend (`ai-service`):** Deploy to **Render** as a Python Web Service (`uvicorn app.main:app --host 0.0.0.0 --port $PORT`) and replace the ngrok URLs in Vapi with the permanent Render URL.
* **Frontend (`frontend`):** Deploy to **Vercel** (set Root Directory to `frontend`) and add the `/call` QR code voice page using `@vapi-ai/web`.
