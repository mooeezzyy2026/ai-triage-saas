import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from enum import Enum
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

class PriorityLevel(str, Enum):
    EMERGENCY = "EMERGENCY"
    URGENT = "URGENT"
    ROUTINE = "ROUTINE"

class TriageResult(BaseModel):
    priority: PriorityLevel = Field(
        description="Urgency level: EMERGENCY (life-threatening), URGENT (needs care within 24h), or ROUTINE."
    )
    department: str = Field(
        description="Recommended hospital department (e.g., Cardiology, Orthopedics, General Medicine, ER)."
    )
    clinical_summary: str = Field(
        description="A concise 1-sentence clinical summary of the patient's symptoms."
    )
    recommended_action: str = Field(
        description="Immediate next step for the patient."
    )

def _fallback_triage(patient_notes: str, age: int) -> TriageResult:
    notes = patient_notes.lower()
    emergency_keywords = ["chest pain", "heart attack", "heat attack", "stroke", "bleeding", "unconscious", "breathing", "seizure"]
    urgent_keywords = ["fever", "fracture", "broken", "migraine", "infection", "vomiting", "dizziness"]

    if any(k in notes for k in emergency_keywords):
        return TriageResult(
            priority=PriorityLevel.EMERGENCY,
            department="Emergency / Cardiology" if "heart" in notes or "heat attack" in notes or "chest" in notes else "Emergency Department (ER)",
            clinical_summary=f"Age {age} patient reporting high-risk acute symptoms: {patient_notes} (Fallback Triage).",
            recommended_action="Immediate emergency evaluation required; alert on-call ER team.",
        )
    if any(k in notes for k in urgent_keywords):
        return TriageResult(
            priority=PriorityLevel.URGENT,
            department="General Medicine",
            clinical_summary=f"Age {age} patient reporting urgent symptoms requiring same-day care: {patient_notes} (Fallback Triage).",
            recommended_action="Schedule priority same-day physician consultation within 4–24 hours.",
        )
    return TriageResult(
        priority=PriorityLevel.ROUTINE,
        department="Outpatient General Medicine",
        clinical_summary=f"Age {age} patient reporting non-urgent symptoms: {patient_notes} (Fallback Triage).",
        recommended_action="Book standard outpatient appointment.",
    )

def _call_gemini(prompt: str) -> TriageResult:
    response = client.models.generate_content(
        model="gemini-3.8-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=TriageResult,
            temperature=0.1,
        ),
    )
    return TriageResult.model_validate_json(response.text)

def analyze_symptoms(patient_notes: str, age: int) -> TriageResult:
    prompt = f"""
    You are a clinical triage assistant for a hospital appointment system.
    Analyze the patient's notes and classify the urgency, target department, and next steps.

    Patient Age: {age}
    Reported Symptoms: {patient_notes}
    """

    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(_call_gemini, prompt)
    try:
        return future.result(timeout=6)
    except (FuturesTimeoutError, Exception) as e:
        print(f"Gemini API slow or unavailable ({e}), using fallback triage.")
        return _fallback_triage(patient_notes, age)
    finally:
        executor.shutdown(wait=False)
