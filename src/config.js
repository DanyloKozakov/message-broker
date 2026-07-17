export function parseAllowedWorkerIds(value) {
  const ids = String(value ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const uniqueIds = [...new Set(ids)];

  if (uniqueIds.length !== 2) {
    throw new Error("ALLOWED_WORKER_IDS must contain exactly two unique, comma-separated IDs");
  }

  return uniqueIds;
}
