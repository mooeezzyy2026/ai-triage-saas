"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Printer, Activity } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { MedicationItem } from "@/components/PrescriptionModal";

interface PrescriptionRecord {
  id: string;
  rx_number: string;
  patient_name: string;
  patient_age: number;
  patient_phone: string | null;
  doctor_name: string;
  diagnosis: string;
  allergies: string;
  medications: MedicationItem[];
  advice: string | null;
  follow_up_date: string | null;
  created_at: string;
}

export default function PrintableRxPage() {
  const params = useParams();
  const [rx, setRx] = useState<PrescriptionRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRx() {
      const { data } = await supabase
        .from("prescriptions")
        .select("*")
        .eq("id", params.id)
        .single();
      if (data) setRx(data as PrescriptionRecord);
      setLoading(false);
    }
    if (params.id) loadRx();
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-600 text-sm">
        Loading e-Prescription...
      </div>
    );
  }

  if (!rx) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 text-red-600 text-sm">
        Prescription not found.
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:p-0">
      <div className="max-w-3xl mx-auto bg-white text-slate-900 rounded-2xl shadow-lg p-8 space-y-6 print:shadow-none print:rounded-none">
        {/* Top Bar */}
        <div className="flex items-start justify-between border-b-2 border-slate-900 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-600 text-white">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Electronic Prescription (e-Rx)</h1>
              <p className="text-xs text-slate-500">
                Prescriber: <strong className="text-slate-800">{rx.doctor_name}</strong>
              </p>
            </div>
          </div>

          <div className="text-right text-xs space-y-1">
            <p className="font-bold text-sm text-cyan-700">{rx.rx_number}</p>
            <p className="text-slate-500">
              Date: {new Date(rx.created_at).toLocaleDateString()}
            </p>
            <button
              onClick={() => window.print()}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 cursor-pointer print:hidden"
            >
              <Printer className="w-3.5 h-3.5" /> Print / Save PDF
            </button>
          </div>
        </div>

        {/* Patient & Clinical Info */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
          <div>
            <p className="text-slate-500">Patient Name</p>
            <p className="font-semibold text-sm mt-0.5">{rx.patient_name}</p>
          </div>
          <div>
            <p className="text-slate-500">Age</p>
            <p className="font-semibold text-sm mt-0.5">{rx.patient_age} Years</p>
          </div>
          <div>
            <p className="text-slate-500">Phone</p>
            <p className="font-semibold text-sm mt-0.5">{rx.patient_phone || "—"}</p>
          </div>
          <div>
            <p className="text-slate-500">Allergies</p>
            <p className="font-semibold text-sm mt-0.5 text-red-600">{rx.allergies}</p>
          </div>
        </div>

        <div className="text-sm">
          <span className="font-semibold text-slate-600">Diagnosis: </span>
          <span className="font-medium text-slate-900">{rx.diagnosis}</span>
        </div>

        {/* Medications Table */}
        <div>
          <h2 className="text-base font-bold mb-2">Rx — Prescribed Medications</h2>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-slate-300 text-slate-600">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Medication &amp; Strength</th>
                <th className="py-2 pr-2">Dose &amp; Route</th>
                <th className="py-2 pr-2">Frequency</th>
                <th className="py-2 pr-2">Duration</th>
                <th className="py-2">Instructions</th>
              </tr>
            </thead>
            <tbody>
              {rx.medications.map((med, i) => (
                <tr key={i} className="border-b border-slate-200">
                  <td className="py-3 pr-2 font-semibold">{i + 1}</td>
                  <td className="py-3 pr-2">
                    <p className="font-bold text-slate-900">{med.name}</p>
                    <p className="text-slate-500">{med.strength}</p>
                  </td>
                  <td className="py-3 pr-2">{med.dose}</td>
                  <td className="py-3 pr-2 font-medium">{med.frequency}</td>
                  <td className="py-3 pr-2">{med.duration}</td>
                  <td className="py-3 text-slate-600">{med.instructions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Advice & Follow-up */}
        {(rx.advice || rx.follow_up_date) && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
            {rx.advice && (
              <p>
                <strong className="text-slate-700">Clinical Advice:</strong> {rx.advice}
              </p>
            )}
            {rx.follow_up_date && (
              <p>
                <strong className="text-slate-700">Follow-up Date:</strong> {rx.follow_up_date}
              </p>
            )}
          </div>
        )}

        <div className="pt-6 border-t border-slate-200 flex justify-between items-end text-xs text-slate-500">
          <p>Digitally generated e-Prescription • {rx.rx_number}</p>
          <div className="text-right">
            <p className="font-semibold text-slate-800">{rx.doctor_name}</p>
            <p>Electronically Signed</p>
          </div>
        </div>
      </div>
    </main>
  );
}
