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
