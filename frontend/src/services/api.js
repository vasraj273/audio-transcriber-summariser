const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

export async function getHistory(token) {
  const response = await fetch(`${BACKEND_URL}/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to load history.");
  return response.json();
}

export async function processAudio(file, token) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${BACKEND_URL}/process`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Something went wrong. Please try again.");
  }

  return response.json();
}
