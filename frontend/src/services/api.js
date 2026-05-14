const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

export async function processAudio(file, options = {}) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("output_language", options.outputLanguage || "English");
  formData.append("summary_focus", options.focus || "General Summary");
  formData.append("summary_format", options.format || "Bullet Points");
  formData.append("summary_length", options.length || "Medium");
  formData.append("custom_focus", options.customFocus || "");

  const response = await fetch(`${BACKEND_URL}/process`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Something went wrong. Please try again.");
  }

  return response.json();
}

export async function createProcessingJob(file, userId, options = {}) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("user_id", userId);
  formData.append("output_language", options.outputLanguage || "English");
  formData.append("summary_focus", options.focus || "General Summary");
  formData.append("summary_format", options.format || "Bullet Points");
  formData.append("summary_length", options.length || "Medium");
  formData.append("custom_focus", options.customFocus || "");

  const response = await fetch(`${BACKEND_URL}/jobs`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Could not start processing job.");
  }

  return response.json();
}

export async function fetchJobStatus(jobId) {
  const response = await fetch(`${BACKEND_URL}/jobs/${jobId}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Could not load job status.");
  }

  return response.json();
}

export async function compareTranscripts(records) {
  return runTranscriptAnalysis("compare", records);
}

export async function mergeTranscripts(records) {
  return runTranscriptAnalysis("merge", records);
}

export async function chatWithAudio({ transcript, summary, messages, question }) {
  const response = await fetch(`${BACKEND_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transcript,
      summary,
      messages: messages.slice(-10),
      question,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Chat failed. Please try again.");
  }

  const data = await response.json();
  return data.answer;
}

async function runTranscriptAnalysis(type, records) {
  const response = await fetch(`${BACKEND_URL}/analysis/${type}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `${type} failed. Please try again.`);
  }

  const data = await response.json();
  return data.result;
}
