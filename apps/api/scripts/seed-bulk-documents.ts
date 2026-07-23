/**
 * Seeds a throwaway test account with ~250 synthetic documents so the document list,
 * search, and graph (2D/3D) views can be sanity-checked at a scale far beyond a handful
 * of manually-uploaded files.
 *
 * Usage:
 *   pnpm --filter @pkos/api exec ts-node scripts/seed-bulk-documents.ts
 *
 * Env (all optional, defaults shown):
 *   SEED_USER_EMAIL=pkos-seed-test@example.com
 *   SEED_USER_PASSWORD=<random if unset — printed to stdout, save it if you want to log in>
 *   SEED_DOC_COUNT=250
 *   SEED_CONCURRENCY=8
 *   API_BASE_URL=http://localhost:3001
 *
 * Clean-up: this account should be deleted via `DELETE /me` (Settings → Delete account)
 * once you're done inspecting it — that removes the workspace, every seeded document
 * (DB rows + physical files), and the Supabase auth user in one shot.
 */

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

const SEED_USER_EMAIL = process.env.SEED_USER_EMAIL ?? 'pkos-seed-test@example.com';
const SEED_USER_PASSWORD = process.env.SEED_USER_PASSWORD ?? `Seed-${Math.random().toString(36).slice(2)}!23`;
const SEED_DOC_COUNT = Number(process.env.SEED_DOC_COUNT ?? 250);
const SEED_CONCURRENCY = Number(process.env.SEED_CONCURRENCY ?? 8);

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see apps/api/.env).');
  process.exit(1);
}

// Topics are grouped into clusters so documents mostly co-occur with same-cluster topics,
// producing visible clustering in the tag graph instead of one giant hub or fully isolated
// stars (has_tag edges are document<->tag only — see graph.service.ts relateByTags).
const CLUSTERS: string[][] = [
  ['budget', 'forecast', 'expenses', 'revenue', 'invoicing'],
  ['roadmap', 'architecture', 'migration', 'deployment', 'refactor'],
  ['onboarding', 'hiring', 'retention', 'feedback', 'culture'],
  ['compliance', 'security', 'encryption', 'audit', 'governance'],
  ['vendor', 'pricing', 'partnership', 'procurement', 'contract'],
];

const TEMPLATES = [
  (t: string, reps: string) => `Notes on ${t}: ${reps}`,
  (t: string, reps: string) => `${reps} — summary of key ${t} considerations for this quarter.`,
  (t: string, reps: string) => `Overview regarding ${t}. ${reps}`,
  (t: string, reps: string) => `${reps} (internal draft memo about ${t})`,
];

const FILLER_SENTENCES = [
  'The meeting ran longer than expected and covered several unrelated items.',
  'Please review the attached spreadsheet before Friday.',
  'Weather delayed the shipment by roughly two days.',
  'The team celebrated the launch with a small gathering.',
  'Several stakeholders requested a follow-up call next week.',
  'The printer on the third floor is still out of toner.',
  'Coffee consumption in the office has noticeably increased.',
  'A new intern joined the design team this morning.',
  'The conference room booking system needs a minor fix.',
  'Traffic near the office has been unusually heavy lately.',
  'The quarterly newsletter went out a day late.',
  'Someone left a plant on the windowsill unattended.',
  'The office move is tentatively scheduled for next spring.',
  'A brief power outage interrupted the afternoon session.',
  'The cafeteria menu changed for the third time this month.',
];

function randInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function pick<T>(arr: T[]): T {
  return arr[randInt(arr.length)];
}

function pickTopics(): string[] {
  const cluster = pick(CLUSTERS);
  const count = 2 + randInt(2); // 2 or 3
  const chosen = new Set<string>();
  while (chosen.size < count) chosen.add(pick(cluster));
  // Small chance of one bridge topic from a different cluster, to link clusters together.
  if (Math.random() < 0.12) {
    const otherCluster = pick(CLUSTERS.filter((c) => c !== cluster));
    chosen.add(pick(otherCluster));
  }
  return [...chosen];
}

function buildContent(topics: string[]): string {
  const topicBlocks = topics.map((topic) => {
    const reps = Array.from({ length: 13 }, () => topic).join(' ');
    return pick(TEMPLATES)(topic, reps);
  });
  const filler = Array.from({ length: 6 }, () => pick(FILLER_SENTENCES));
  return [...topicBlocks, ...filler].join(' ');
}

async function ensureTestUser(): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ email: SEED_USER_EMAIL, password: SEED_USER_PASSWORD, email_confirm: true }),
  });
  if (res.ok) {
    console.log(`Created test user ${SEED_USER_EMAIL}`);
    return;
  }
  const body = await res.text();
  if (res.status === 422 || body.includes('already been registered')) {
    console.log(`Test user ${SEED_USER_EMAIL} already exists — reusing it.`);
    return;
  }
  throw new Error(`Failed to create test user: ${res.status} ${body}`);
}

async function signIn(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY },
    body: JSON.stringify({ email: SEED_USER_EMAIL, password: SEED_USER_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`Sign-in failed: ${res.status} ${await res.text()}`);
  }
  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
}

async function uploadDocument(token: string, index: number): Promise<void> {
  const topics = pickTopics();
  const content = buildContent(topics);
  const ext = index % 3 === 0 ? '.md' : '.txt';
  const filename = `seed-doc-${String(index).padStart(4, '0')}-${topics[0]}${ext}`;

  const form = new FormData();
  form.append('file', new Blob([content], { type: 'text/plain' }), filename);

  const res = await fetch(`${API_BASE_URL}/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Upload failed for ${filename}: ${res.status} ${await res.text()}`);
  }
}

async function runPool(total: number, concurrency: number, task: (index: number) => Promise<void>) {
  let next = 0;
  let succeeded = 0;
  let failed = 0;

  async function worker() {
    while (next < total) {
      const index = next++;
      try {
        await task(index);
        succeeded++;
      } catch (err) {
        failed++;
        console.error((err as Error).message);
      }
      if ((succeeded + failed) % 25 === 0) {
        console.log(`Progress: ${succeeded + failed}/${total} (${failed} failed)`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { succeeded, failed };
}

async function main() {
  await ensureTestUser();
  const token = await signIn();
  console.log(`Signed in as ${SEED_USER_EMAIL}. Uploading ${SEED_DOC_COUNT} documents...`);

  const { succeeded, failed } = await runPool(SEED_DOC_COUNT, SEED_CONCURRENCY, (i) => uploadDocument(token, i));

  console.log(`Done. ${succeeded} uploaded, ${failed} failed.`);
  console.log(`Test account: ${SEED_USER_EMAIL} / ${SEED_USER_PASSWORD}`);
  console.log('Log in as this account to inspect /documents, /search, and /graph, then delete it via Settings when done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
