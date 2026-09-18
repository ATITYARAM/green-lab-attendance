const WORKER_URL = "https://green-lab.atityaramsureshmanickam.workers.dev";

async function workerRequest(path, options = {}) {
  const sessionResult = await db.auth.getSession();
  const token = sessionResult.data.session?.access_token;

  const response = await fetch(WORKER_URL + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Worker request failed");
  }

  return data;
}
