import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createProcessingJob, fetchJobStatus } from "../services/api";
import { useCredits } from "./CreditsContext";

const STORAGE_KEY = "audio-transcriber-active-jobs";
const ProcessingJobsContext = createContext(null);

export function ProcessingJobsProvider({ children }) {
  const [jobs, setJobs] = useState(() => loadStoredJobs());
  const { refund } = useCredits();

  useEffect(() => {
    const storedJobs = jobs.map(({ audioUrl, file, result, ...job }) => job);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedJobs));
  }, [jobs]);

  useEffect(() => {
    const active = jobs.filter((job) => ["queued", "processing"].includes(job.status));
    if (!active.length) return;

    const interval = setInterval(async () => {
      for (const job of active) {
        try {
          const status = await fetchJobStatus(job.job_id);
          const merged = {
            ...job,
            ...status,
            result: status.status === "completed" ? normaliseJobResult(status) : job.result,
          };
          if (status.status === "failed" && !job.refundProcessed) {
            try {
              await refund({ jobId: job.job_id, recordId: job.record_id });
            } catch (refundErr) {
              console.error("[Credits] refund failed:", refundErr.message);
            }
            merged.refundProcessed = true;
          }
          setJobs((current) => upsertJob(current, merged));
        } catch (err) {
          setJobs((current) => upsertJob(current, {
            ...job,
            status: "failed",
            error_message: err.message,
          }));
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobs]);

  async function startJob({ file, userId, options }) {
    const audioUrl = URL.createObjectURL(file);
    const created = await createProcessingJob(file, userId, options);
    const job = {
      ...created,
      audio_name: file.name,
      status: created.status || "queued",
      created_at: new Date().toISOString(),
      audioUrl,
    };
    setJobs((current) => upsertJob(current, job));
    return job;
  }

  function clearFinishedJob(jobId) {
    setJobs((current) => current.filter((job) => {
      if (job.job_id === jobId && job.audioUrl) URL.revokeObjectURL(job.audioUrl);
      return job.job_id !== jobId;
    }));
  }

  const value = useMemo(() => ({
    jobs,
    activeJobs: jobs.filter((job) => ["queued", "processing"].includes(job.status)),
    latestJob: jobs[0] || null,
    startJob,
    clearFinishedJob,
  }), [jobs]);

  return (
    <ProcessingJobsContext.Provider value={value}>
      {children}
    </ProcessingJobsContext.Provider>
  );
}

export function useProcessingJobs() {
  const context = useContext(ProcessingJobsContext);
  if (!context) throw new Error("useProcessingJobs must be used inside ProcessingJobsProvider");
  return context;
}

function loadStoredJobs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((job) => ["queued", "processing"].includes(job.status))
      : [];
  } catch {
    return [];
  }
}

function upsertJob(jobs, nextJob) {
  const filtered = jobs.filter((job) => job.job_id !== nextJob.job_id);
  return [nextJob, ...filtered].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function normaliseJobResult(status) {
  return {
    transcript: status.transcript,
    summary: status.summary,
    key_points: status.key_points || [],
    detected_language: status.detected_language,
    transcript_segments: status.transcript_segments || [],
    speaker_transcript: status.speaker_transcript,
    speaker_count: status.speaker_count,
    audio_type: status.audio_type,
    quality_score: status.quality_score,
    quality_flags: status.quality_flags || [],
    warning: status.warning || status.error_message || "",
  };
}
