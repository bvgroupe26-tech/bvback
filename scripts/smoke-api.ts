/**
 * Smoke tests API — à lancer avec le backend démarré (npm run start:dev).
 * Usage: npx ts-node scripts/smoke-api.ts [BASE_URL]
 * Exemple: npx ts-node scripts/smoke-api.ts http://localhost:3000/api
 */

const BASE = (process.argv[2] ?? process.env.API_BASE ?? 'http://localhost:3000/api').replace(
  /\/$/,
  '',
);

const ADMIN_EMAIL = process.env.SMOKE_EMAIL ?? 'admin@bvgroupe.com';
const ADMIN_PASSWORD = process.env.SMOKE_PASSWORD ?? 'Admin@2026';

type Result = { name: string; ok: boolean; detail?: string };

const results: Result[] = [];

function pass(name: string, detail?: string): void {
  results.push({ name, ok: true, detail });
  console.log(`  OK  ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, detail: string): void {
  results.push({ name, ok: false, detail });
  console.error(` FAIL ${name} — ${detail}`);
}

async function request(
  method: string,
  path: string,
  options: {
    token?: string;
    body?: unknown;
    expectStatus?: number;
  } = {},
): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  const expected = options.expectStatus ?? (method === 'POST' && path.includes('/delete') ? 204 : 200);
  if (res.status !== expected) {
    const msg =
      typeof json === 'object' && json !== null && 'error' in json
        ? String((json as { error: unknown }).error)
        : `HTTP ${res.status}, attendu ${expected}`;
    throw new Error(msg);
  }

  return { status: res.status, json };
}

function getData<T>(json: unknown): T {
  if (typeof json === 'object' && json !== null && 'data' in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

async function main(): Promise<void> {
  console.log(`\nSmoke tests API — ${BASE}\n`);

  let token: string | undefined;

  // 1. Login
  try {
    const { json } = await request('POST', '/auth/login', {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      expectStatus: 200,
    });
    const data = getData<{ access_token?: string; accessToken?: string }>(json);
    token = data.access_token ?? data.accessToken;
    if (!token) throw new Error('Pas de token dans la réponse');
    pass('POST /auth/login');
  } catch (e) {
    fail('POST /auth/login', e instanceof Error ? e.message : String(e));
    printSummary();
    process.exit(1);
  }

  // 2. Me
  try {
    await request('GET', '/auth/me', { token });
    pass('GET /auth/me');
  } catch (e) {
    fail('GET /auth/me', e instanceof Error ? e.message : String(e));
  }

  // 3. snake_case body → employé (intercepteur)
  let employeId: number | undefined;
  try {
    const { json } = await request('POST', '/employes', {
      token,
      body: {
        nom: 'Smoke',
        prenom: 'Test',
        type_contrat: 'CDI',
        salaire_base: 150000,
      },
      expectStatus: 201,
    });
    const emp = getData<{ id: number }>(json);
    employeId = emp.id;
    pass('POST /employes (snake_case body)', `id=${employeId}`);
  } catch (e) {
    fail('POST /employes (snake_case)', e instanceof Error ? e.message : String(e));
  }

  // 4. Query snake_case
  try {
    await request('GET', '/employes?statut=actif&limit=5', { token });
    pass('GET /employes?statut=actif (query snake_case)');
  } catch (e) {
    fail('GET /employes (filtres)', e instanceof Error ? e.message : String(e));
  }

  // 5. Soft delete POST .../delete
  if (employeId) {
    try {
      await request('POST', `/employes/${employeId}/delete`, {
        token,
        expectStatus: 204,
      });
      pass('POST /employes/:id/delete (soft delete)');
    } catch (e) {
      fail('POST /employes/:id/delete', e instanceof Error ? e.message : String(e));
    }
  }

  // 6. Dashboard & modules clés
  const getRoutes = [
    '/dashboard/stats',
    '/employes/stats',
    '/presences/today',
    '/absences',
    '/paie/stats',
    '/offres',
    '/budget/synthese?annee=2026',
    '/statistiques/synthese',
    '/public/stats',
  ];

  for (const route of getRoutes) {
    try {
      const needsAuth = !route.startsWith('/public');
      await request('GET', route, { token: needsAuth ? token : undefined });
      pass(`GET ${route.split('?')[0]}`);
    } catch (e) {
      fail(`GET ${route}`, e instanceof Error ? e.message : String(e));
    }
  }

  // 7. Register sans password_confirm (simulation front)
  const regEmail = `smoke-${Date.now()}@test.local`;
  try {
    await request('POST', '/auth/register', {
      body: {
        email: regEmail,
        password: 'TestPass123!',
        nom: 'Smoke',
        prenom: 'Reg',
        role: 'rh',
      },
      expectStatus: 201,
    });
    pass('POST /auth/register (sans password_confirm)');
  } catch (e) {
    fail('POST /auth/register', e instanceof Error ? e.message : String(e));
  }

  printSummary();
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

function printSummary(): void {
  const ok = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n--- Résumé: ${ok}/${total} tests réussis ---\n`);
}

void main();
