export function getRecordState(record) {
  if (!record) return "unknown";
  const status = String(record.status || "completed").toLowerCase();
  if (status === "completed" && record.transcript) return "completed";
  if (status === "failed") return "failed";
  if (status === "processing") return "processing";
  if (status === "queued") return "queued";
  return "unknown";
}

export function isRecordCompleted(record) {
  return getRecordState(record) === "completed";
}
