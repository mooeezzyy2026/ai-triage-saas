"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Stethoscope,
  Send,
  Loader2,
  ShieldAlert,
  UserCheck,
  Building2,
  Phone,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import PrescriptionModal from "@/components/PrescriptionModal";

type PriorityLevel = "EMERGENCY" | "URGENT" | "ROUTINE";
type AppointmentStatus = "WAITING" | "IN_CONSULTATION" | "COMPLETED";
type ViewMode = "RECEPTION" | "DOCTOR";

interface TriageResult {
  priority: PriorityLevel;
  department: string;
  clinical_summary: string;
  recommended_action: string;
}

interface AppointmentRecord extends TriageResult {
  id: string;
  patient_name: string;
  age: number;
  phone: string | null;
  symptoms: string;
  status: AppointmentStatus;
  created_at: string;
}

const priorityOrder: Record<PriorityLevel, number> = {
  EMERGENCY: 0,
  URGENT: 1,
  ROUTINE: 2,
};

const priorityStyles: Record<
  PriorityLevel,
  { badge: string; border: string; icon: React.ReactNode }
> = {
  EMERGENCY: {
    badge: "bg-red-500/15 text-red-400 border-red-500/40",
    border: "border-red-500/40",
    icon: <ShieldAlert className="w-5 h-5 text-red-400" />,
  },
  URGENT: {
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/40",
    border: "border-amber-500/40",
    icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
  },
  ROUTINE: {
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
    border: "border-emerald-500/40",
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
  },
};

const statusStyles: Record<AppointmentStatus, string> = {
  WAITING: "bg-slate-800 text-slate-300 border-slate-700",
  IN_CONSULTATION: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
  COMPLETED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
};

export default function Home() {
  const [viewMode, setViewMode] = useState<ViewMode>("RECEPTION");
  const [departmentFilter, setDepartmentFilter] = useState<string>("ALL");

  const [patientName, setPatientName] = useState("");
  const [age, setAge] = useState("");
  const [phone, setPhone] = useState("");
  const [symptoms, setSymptoms] = useState("");

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<AppointmentRecord | null>(null);
  const [queue, setQueue] = useState<AppointmentRecord[]>([]);
  const [activeRxPatient, setActiveRxPatient] = useState<AppointmentRecord | null>(null);

  // Load persisted appointments from Supabase + subscribe to Realtime updates
  useEffect(() => {
    async function fetchAppointments() {
      const { data, error: dbError } = await supabase
        .from("triage_appointments")
        .select("*")
        .order("created_at", { ascending: false });

      if (dbError) {
        setError(`Database error: ${dbError.message}`);
      } else if (data) {
        setQueue(data as AppointmentRecord[]);
      }
      setFetching(false);
    }

    fetchAppointments();

    const channel = supabase
      .channel("triage_appointments_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "triage_appointments" },
        () => {
          fetchAppointments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Run AI Triage via FastAPI
      const res = await fetch("http://127.0.0.1:8000/api/v1/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: patientName.trim(),
          age: Number(age),
          symptoms: symptoms.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server responded with ${res.status}`);
      }

      const aiData: TriageResult = await res.json();

      // 2. Persist to Supabase PostgreSQL
      const { data: inserted, error: insertError } = await supabase
        .from("triage_appointments")
        .insert({
          patient_name: patientName.trim(),
          age: Number(age),
          phone: phone.trim() || null,
          symptoms: symptoms.trim(),
          priority: aiData.priority,
          department: aiData.department,
          clinical_summary: aiData.clinical_summary,
          recommended_action: aiData.recommended_action,
          status: "WAITING",
        })
        .select()
        .single();

      if (insertError) throw new Error(`Supabase insert failed: ${insertError.message}`);

      const record = inserted as AppointmentRecord;
      setLatestResult(record);
      setQueue((prev) => [record, ...prev.filter((r) => r.id !== record.id)]);

      setPatientName("");
      setAge("");
      setPhone("");
      setSymptoms("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not complete triage and save appointment."
      );
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: AppointmentStatus) {
    const { error: updateError } = await supabase
      .from("triage_appointments")
      .update({ status })
      .eq("id", id);

    if (updateError) {
      setError(`Could not update status: ${updateError.message}`);
      return;
    }

    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item))
    );
  }

  // Unique departments for Doctor filter
  const departments = useMemo(() => {
    const set = new Set(queue.map((q) => q.department));
    return ["ALL", ...Array.from(set)];
  }, [queue]);

  // Auto-sort: Active patients first, then EMERGENCY -> URGENT -> ROUTINE
  const sortedQueue = useMemo(() => {
    return [...queue]
      .filter((item) =>
        departmentFilter === "ALL" ? true : item.department === departmentFilter
      )
      .sort((a, b) => {
        if (a.status === "COMPLETED" && b.status !== "COMPLETED") return 1;
        if (a.status !== "COMPLETED" && b.status === "COMPLETED") return -1;
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
  }, [queue, departmentFilter]);

  const activeEmergencies = queue.filter(
    (q) => q.priority === "EMERGENCY" && q.status !== "COMPLETED"
  ).length;
  const waitingCount = queue.filter((q) => q.status === "WAITING").length;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header + View Switcher */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30">
              <Activity className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                AI Clinical Triage &amp; Appointment SaaS
              </h1>
              <p className="text-sm text-slate-400">
                Real-time urgency classification, department routing &amp; live queue
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800 w-fit">
            <button
              onClick={() => setViewMode("RECEPTION")}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${viewMode === "RECEPTION"
                  ? "bg-cyan-500 text-slate-950"
                  : "text-slate-400 hover:text-slate-200"
                }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Reception Desk
            </button>
            <button
              onClick={() => setViewMode("DOCTOR")}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${viewMode === "DOCTOR"
                  ? "bg-cyan-500 text-slate-950"
                  : "text-slate-400 hover:text-slate-200"
                }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              Doctor Workbench
            </button>
          </div>
        </header>

        {/* Metrics Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
            <p className="text-xs text-slate-400">Total Triaged</p>
            <p className="text-2xl font-bold mt-1">{queue.length}</p>
          </div>
          <div className="bg-slate-900/70 border border-red-500/30 rounded-2xl p-4">
            <p className="text-xs text-red-400">Active Emergencies</p>
            <p className="text-2xl font-bold text-red-400 mt-1">{activeEmergencies}</p>
          </div>
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
            <p className="text-xs text-slate-400">Waiting in Queue</p>
            <p className="text-2xl font-bold text-cyan-400 mt-1">{waitingCount}</p>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
            {error}
          </div>
        )}

        {viewMode === "RECEPTION" ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Intake Form */}
            <section className="lg:col-span-5 bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-cyan-400" />
                <h2 className="text-lg font-semibold">Patient Intake Form</h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1.5">
                    Patient Full Name
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="e.g., Ali Khan"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-300 mb-1.5">Age</label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={120}
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      placeholder="e.g., 54"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1.5">
                      Phone / WhatsApp
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0300-1234567"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-1.5">
                    Symptoms &amp; Clinical Notes
                  </label>
                  <textarea
                    required
                    minLength={5}
                    rows={4}
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                    placeholder="Describe symptoms, duration, and severity..."
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm focus:outline-none focus:border-cyan-500 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold py-2.5 text-sm transition cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing with AI...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Run AI Triage &amp; Save to Queue
                    </>
                  )}
                </button>
              </form>
            </section>

            {/* Right Panel: Latest Assessment + Live Queue */}
            <section className="lg:col-span-7 space-y-6">
              <AnimatePresence mode="wait">
                {latestResult ? (
                  <motion.div
                    key={latestResult.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    className={`bg-slate-900/80 border ${priorityStyles[latestResult.priority].border
                      } rounded-2xl p-6 space-y-4`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        {priorityStyles[latestResult.priority].icon}
                        <h3 className="text-lg font-semibold">
                          {latestResult.patient_name} ({latestResult.age}y)
                        </h3>
                      </div>
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full border ${priorityStyles[latestResult.priority].badge
                          }`}
                      >
                        {latestResult.priority}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5">
                        <p className="text-xs text-slate-400 mb-1">Assigned Department</p>
                        <p className="font-semibold text-cyan-300">
                          {latestResult.department}
                        </p>
                      </div>
                      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5">
                        <p className="text-xs text-slate-400 mb-1">Recommended Action</p>
                        <p className="font-medium text-slate-200">
                          {latestResult.recommended_action}
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-sm">
                      <p className="text-xs text-slate-400 mb-1">AI Clinical Summary</p>
                      <p className="text-slate-200">{latestResult.clinical_summary}</p>
                    </div>
                  </motion.div>
                ) : (
                  <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-sm">
                    Submit a patient intake form to run AI triage and persist the record to Supabase.
                  </div>
                )}
              </AnimatePresence>

              {/* Priority-Sorted Live Queue */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  Live Priority Queue ({queue.length})
                </h3>

                {fetching ? (
                  <p className="text-xs text-slate-500">Loading database records...</p>
                ) : sortedQueue.length === 0 ? (
                  <p className="text-xs text-slate-500">No patients in queue yet.</p>
                ) : (
                  <div className="space-y-2.5">
                    {sortedQueue.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-4 bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-3 text-sm"
                      >
                        <div>
                          <p className="font-medium text-slate-100">
                            {item.patient_name}{" "}
                            <span className="text-xs text-slate-400">
                              ({item.age}y) • {item.department}
                            </span>
                          </p>
                          <p className="text-xs text-slate-400 line-clamp-1">
                            {item.clinical_summary}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusStyles[item.status]
                              }`}
                          >
                            {item.status.replace("_", " ")}
                          </span>
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${priorityStyles[item.priority].badge
                              }`}
                          >
                            {item.priority}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : (
          /* DOCTOR WORKBENCH VIEW */
          <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Doctor Triage Workbench</h2>
                <p className="text-xs text-slate-400">
                  Auto-sorted by clinical urgency. Emergencies always appear first.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {departments.map((dept) => (
                  <button
                    key={dept}
                    onClick={() => setDepartmentFilter(dept)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${departmentFilter === dept
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                        : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
                      }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
            </div>

            {sortedQueue.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">
                No patients assigned to this department.
              </p>
            ) : (
              <div className="space-y-3">
                {sortedQueue.map((item) => (
                  <div
                    key={item.id}
                    className={`bg-slate-950/80 border ${item.status === "COMPLETED"
                        ? "border-slate-800/60 opacity-60"
                        : priorityStyles[item.priority].border
                      } rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-base">
                          {item.patient_name} ({item.age}y)
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${priorityStyles[item.priority].badge
                            }`}
                        >
                          {item.priority}
                        </span>
                        <span className="text-xs text-cyan-400 font-medium">
                          {item.department}
                        </span>
                        {item.phone && (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {item.phone}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-200">{item.clinical_summary}</p>
                      <p className="text-xs text-slate-400">
                        <strong className="text-slate-300">Action:</strong>{" "}
                        {item.recommended_action}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.status !== "COMPLETED" && (
                        <button
                          onClick={() => setActiveRxPatient(item)}
                          className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 text-xs font-semibold cursor-pointer"
                        >
                          Write e-Rx
                        </button>
                      )}
                      {item.status === "WAITING" && (
                        <button
                          onClick={() => updateStatus(item.id, "IN_CONSULTATION")}
                          className="px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold cursor-pointer"
                        >
                          Start Consultation
                        </button>
                      )}
                      {item.status === "IN_CONSULTATION" && (
                        <button
                          onClick={() => updateStatus(item.id, "COMPLETED")}
                          className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold cursor-pointer"
                        >
                          Mark Completed
                        </button>
                      )}
                      {item.status === "COMPLETED" && (
                        <span className="text-xs text-emerald-400 font-medium px-3 py-1.5">
                          Completed ✓
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {activeRxPatient && (
        <PrescriptionModal
          appointment={activeRxPatient}
          onClose={() => setActiveRxPatient(null)}
          onCompleted={(id) =>
            setQueue((prev) =>
              prev.map((item) => (item.id === id ? { ...item, status: "COMPLETED" } : item))
            )
          }
        />
      )}
    </main>
  );
}
