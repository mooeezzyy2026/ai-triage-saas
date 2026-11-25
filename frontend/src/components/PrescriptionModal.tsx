"use client";

import { useState } from "react";
import { X, Plus, Trash2, FileText, Send, Printer, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export interface MedicationItem {
  name: string;
  strength: string;
  dose: string;
  frequency: string;
  duration: string;
  instructions: string;
}

interface PatientAppointment {
  id: string;
  patient_name: string;
  age: number;
  phone: string | null;
  department: string;
  clinical_summary: string;
}

interface PrescriptionModalProps {
  appointment: PatientAppointment;
  onClose: () => void;
  onCompleted: (appointmentId: string) => void;
}

function formatWhatsAppNumber(phone: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "92" + digits.slice(1);
  return digits;
}

export default function PrescriptionModal({
  appointment,
  onClose,
  onCompleted,
}: PrescriptionModalProps) {
  const [doctorName, setDoctorName] = useState("Dr. ");
  const [diagnosis, setDiagnosis] = useState("");
  const [allergies, setAllergies] = useState("NKDA (No Known Drug Allergies)");
  const [advice, setAdvice] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [medications, setMedications] = useState<MedicationItem[]>([
    {
      name: "",
      strength: "",
      dose: "1 tab (Oral)",
      frequency: "BD (Twice daily)",
      duration: "5 days",
      instructions: "After meals",
    },
  ]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedRx, setSavedRx] = useState<{ id: string; rx_number: string } | null>(null);

  function addMedication() {
    setMedications((prev) => [
      ...prev,
      {
        name: "",
        strength: "",
        dose: "1 tab (Oral)",
        frequency: "BD (Twice daily)",
        duration: "5 days",
        instructions: "After meals",
      },
    ]);
  }

  function removeMedication(index: number) {
    setMedications((prev) => prev.filter((_, i) => i !== index));
  }

  function updateMedication(index: number, field: keyof MedicationItem, value: string) {
    setMedications((prev) =>
      prev.map((med, i) => (i === index ? { ...med, [field]: value } : med))
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const validMeds = medications.filter((m) => m.name.trim() !== "");
    if (validMeds.length === 0) {
      setError("Please add at least one medication.");
      setSaving(false);
      return;
    }

    const rxNumber = `RX-${Date.now().toString().slice(-6)}`;

    const { data, error: dbError } = await supabase
      .from("prescriptions")
      .insert({
        appointment_id: appointment.id,
        rx_number: rxNumber,
        patient_name: appointment.patient_name,
        patient_age: appointment.age,
        patient_phone: appointment.phone,
        doctor_name: doctorName.trim(),
        diagnosis: diagnosis.trim(),
        allergies: allergies.trim() || "NKDA",
        medications: validMeds,
        advice: advice.trim() || null,
        follow_up_date: followUpDate || null,
      })
      .select("id, rx_number")
      .single();

    if (dbError) {
      setError(dbError.message);
      setSaving(false);
      return;
    }

    // Mark appointment as completed
    await supabase
      .from("triage_appointments")
      .update({ status: "COMPLETED" })
      .eq("id", appointment.id);

    onCompleted(appointment.id);
    setSavedRx(data);
    setSaving(false);
  }

  function handleSendWhatsApp() {
    if (!savedRx) return;
    const rxUrl = `${window.location.origin}/rx/${savedRx.id}`;
    const medLines = medications
      .filter((m) => m.name.trim() !== "")
      .map(
        (m, idx) =>
          `${idx + 1}. *${m.name}* (${m.strength}) — ${m.dose}, ${m.frequency} for ${m.duration} [${m.instructions}]`
      )
      .join("\n");

    const message = [
      `*e-Prescription (${savedRx.rx_number})*`,
      `Patient: *${appointment.patient_name}* (${appointment.age}y)`,
      `Doctor: ${doctorName}`,
      `Diagnosis: ${diagnosis}`,
      `Allergies: ${allergies}`,
      ``,
      `*Medications:*`,
      medLines,
      advice ? `\n*Advice:* ${advice}` : "",
      followUpDate ? `*Follow-up:* ${followUpDate}` : "",
      ``,
      `View / Print Official Rx: ${rxUrl}`,
    ]
      .filter(Boolean)
      .join("\n");

    const waPhone = formatWhatsAppNumber(appointment.phone);
    const waUrl = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(waUrl, "_blank");
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-lg font-semibold">Write e-Prescription</h2>
              <p className="text-xs text-slate-400">
                {appointment.patient_name} ({appointment.age}y) • {appointment.department}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {savedRx ? (
          <div className="space-y-5 py-4 text-center">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
              e-Prescription <strong>{savedRx.rx_number}</strong> saved and consultation marked completed.
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={handleSendWhatsApp}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm cursor-pointer"
              >
                <Send className="w-4 h-4" />
                Send to Patient WhatsApp
              </button>
              <a
                href={`/rx/${savedRx.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-sm"
              >
                <Printer className="w-4 h-4" />
                View / Print Rx
              </a>
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-sm cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Prescribing Doctor</label>
                <input
                  type="text"
                  required
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  placeholder="Dr. Ahmed Khan"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Allergies</label>
                <input
                  type="text"
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  placeholder="NKDA or Penicillin"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Primary Diagnosis</label>
              <input
                type="text"
                required
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder="e.g., Acute Viral Pyrexia / Upper Respiratory Tract Infection"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Structured Medications */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-200">Medications (Rx)</label>
                <button
                  type="button"
                  onClick={addMedication}
                  className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Medicine
                </button>
              </div>

              {medications.map((med, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <input
                      type="text"
                      required
                      placeholder="Generic Name (e.g., Paracetamol)"
                      value={med.name}
                      onChange={(e) => updateMedication(idx, "name", e.target.value)}
                      className="sm:col-span-5 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs focus:outline-none focus:border-cyan-500"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Strength & Form (500mg Tab)"
                      value={med.strength}
                      onChange={(e) => updateMedication(idx, "strength", e.target.value)}
                      className="sm:col-span-4 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs focus:outline-none focus:border-cyan-500"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Dose (1 tab Oral)"
                      value={med.dose}
                      onChange={(e) => updateMedication(idx, "dose", e.target.value)}
                      className="sm:col-span-3 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                    <input
                      type="text"
                      required
                      placeholder="Frequency (TDS / 8 hourly)"
                      value={med.frequency}
                      onChange={(e) => updateMedication(idx, "frequency", e.target.value)}
                      className="sm:col-span-4 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs focus:outline-none focus:border-cyan-500"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Duration (5 days)"
                      value={med.duration}
                      onChange={(e) => updateMedication(idx, "duration", e.target.value)}
                      className="sm:col-span-3 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs focus:outline-none focus:border-cyan-500"
                    />
                    <input
                      type="text"
                      placeholder="Instructions (After meals)"
                      value={med.instructions}
                      onChange={(e) => updateMedication(idx, "instructions", e.target.value)}
                      className="sm:col-span-4 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs focus:outline-none focus:border-cyan-500"
                    />
                    {medications.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMedication(idx)}
                        className="sm:col-span-1 flex justify-center text-red-400 hover:text-red-300 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-300 mb-1">
                  Clinical Advice &amp; Red Flags
                </label>
                <textarea
                  rows={2}
                  value={advice}
                  onChange={(e) => setAdvice(e.target.value)}
                  placeholder="Hydration, rest; return immediately if fever persists >3 days..."
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Follow-up Date</label>
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-sm cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                  </>
                ) : (
                  "Issue e-Prescription"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
