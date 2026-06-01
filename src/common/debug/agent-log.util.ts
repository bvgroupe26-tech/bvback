import { appendFileSync } from 'fs';
import { join } from 'path';

const DEBUG_LOG_FILE = join(process.cwd(), 'debug-8a3f4a.log');
const INGEST_URL =
  'http://127.0.0.1:7769/ingest/551853aa-2b95-4694-9381-9b8e41955abe';
const SESSION_ID = '8a3f4a';

export function agentLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = 'pre-fix',
): void {
  const entry = {
    sessionId: SESSION_ID,
    runId,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };

  try {
    appendFileSync(DEBUG_LOG_FILE, `${JSON.stringify(entry)}\n`);
  } catch {
    // ignore (ex. read-only FS sur certains hébergeurs)
  }

  fetch(INGEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': SESSION_ID,
    },
    body: JSON.stringify(entry),
  }).catch(() => {});
}
