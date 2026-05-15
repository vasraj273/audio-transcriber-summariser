import { useEffect, useState } from "react";

const STAGES = ["Uploading audio", "Transcribing", "Generating summary", "Finalizing"];

export default function ProcessingStages({ starting, status, hasResult }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (hasResult || status === "completed" || status === "failed") return;
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [hasResult, status]);

  const active = getActiveStep(starting, status, hasResult, elapsed);
  const allDone = active >= STAGES.length;

  return (
    <div className="mt-8 rounded-xl border border-indigo-100 bg-indigo-50 p-5">
      <ol className="space-y-2">
        {STAGES.map((label, idx) => {
          const state = allDone ? "done" : idx < active ? "done" : idx === active ? "active" : "pending";
          return (
            <li key={label} className="flex items-center gap-3 text-sm">
              <StepIcon state={state} />
              <span className={
                state === "done"
                  ? "font-medium text-indigo-900"
                  : state === "active"
                  ? "font-semibold text-indigo-900"
                  : "text-indigo-400"
              }>
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-xs text-indigo-700">
        You can open History or leave this page. Processing continues in the background.
      </p>
    </div>
  );
}

function getActiveStep(starting, status, hasResult, elapsed) {
  if (hasResult || status === "completed") return STAGES.length;
  if (starting && !status) return 0;
  if (!status || status === "queued") return 1;
  if (status === "processing") {
    return elapsed >= 20 ? 2 : 1;
  }
  return 1;
}

function StepIcon({ state }) {
  if (state === "done") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white">
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm ring-2 ring-indigo-500">
        <svg className="h-3.5 w-3.5 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </span>
    );
  }
  return <span className="h-6 w-6 rounded-full bg-white ring-1 ring-gray-200" />;
}
