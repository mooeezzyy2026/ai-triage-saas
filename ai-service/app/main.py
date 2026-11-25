import os
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from app.triage import analyze_symptoms, TriageResult

load_dotenv()

app = FastAPI(
    title="AI Clinical Triage Microservice",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://dashboard.vapi.ai"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TriageRequest(BaseModel):
    patient_name: str = Field(..., min_length=2)
    age: int = Field(..., ge=0, le=120)
    symptoms: str = Field(..., min_length=5)


@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "ai-triage-microservice"}


@app.post("/api/v1/triage", response_model=TriageResult)
def triage_patient(request: TriageRequest):
    try:
        return analyze_symptoms(request.symptoms, request.age)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Triage analysis failed: {str(e)}")


@app.post("/api/v1/vapi-book")
async def vapi_book_appointment(request: Request):
    body = await request.json()
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")

    patient_name = str(body.get("patient_name") or "Unknown Patient").strip()
    age = int(body.get("age") or 30)
    phone = str(body.get("phone") or "").strip()
    symptoms = str(body.get("symptoms") or "General consultation").strip()
    doctor_name = str(body.get("doctor_name") or "General OPD").strip() or "General OPD"

    # 1. Run Gemini triage
    triage = analyze_symptoms(symptoms, age)
    triage_data = triage.model_dump() if hasattr(triage, "model_dump") else triage

    # 2. Save directly to Supabase (triggers Realtime update on Next.js)
    record = {
        "patient_name": patient_name,
        "age": age,
        "phone": phone or None,
        "symptoms": symptoms,
        "doctor_name": doctor_name,
        "priority": triage_data["priority"],
        "department": triage_data["department"],
        "clinical_summary": triage_data["clinical_summary"],
        "recommended_action": triage_data["recommended_action"],
        "status": "WAITING",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.post(
            f"{supabase_url}/rest/v1/triage_appointments",
            headers={
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
            json=record,
        )

    if res.status_code >= 400:
        return {
            "status": "error",
            "message": "Could not save appointment. Please hold for reception.",
        }

    return {
        "status": "confirmed",
        "patient_name": patient_name,
        "doctor_name": doctor_name,
        "department": triage_data["department"],
        "priority": triage_data["priority"],
        "recommended_action": triage_data["recommended_action"],
    }


@app.post("/api/v1/lookup-doctor")
async def lookup_doctor(request: Request):
    body = await request.json()
    query = str(body.get("query") or "").strip().lower()

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")

    async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.get(
            f"{supabase_url}/rest/v1/doctors?is_available=eq.true&select=*",
            headers={
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
            },
        )

    if res.status_code >= 400:
        return {"matches": [], "message": "Doctor directory is temporarily unavailable."}

    doctors = res.json()
    if not query:
        return {
            "matches": [
                {
                    "doctor_name": d["full_name"],
                    "specialty": d["specialty"],
                    "timings": d["timings"],
                    "fee": f"{d['fee']} PKR",
                }
                for d in doctors[:5]
            ]
        }

    # Split query into keywords (ignore common words like "dr" or "doctor")
    tokens = [
        t
        for t in query.replace(".", " ").split()
        if t not in {"dr", "doctor", "sahab", "saab"}
    ]
    if not tokens:
        tokens = [query]

    matches = []
    for doc in doctors:
        searchable = " ".join(
            [
                doc.get("full_name", ""),
                doc.get("aliases", ""),
                doc.get("specialty", ""),
                doc.get("symptoms_keywords", ""),
            ]
        ).lower()

        if any(token in searchable for token in tokens):
            matches.append(
                {
                    "doctor_name": doc["full_name"],
                    "specialty": doc["specialty"],
                    "timings": doc["timings"],
                    "fee": f"{doc['fee']} PKR",
                }
            )

    if not matches:
        return {
            "matches": [],
            "message": "No specific specialist found for that query. You can offer General OPD.",
        }

    return {"matches": matches[:5]}
