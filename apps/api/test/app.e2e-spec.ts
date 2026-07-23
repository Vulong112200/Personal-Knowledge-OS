import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

// Black-box e2e test: spawns the real compiled server (`node dist/src/main.js`) and hits
// it over HTTP, rather than bootstrapping AppModule in-process via Nest's TestingModule.
// That in-process route triggers Prisma 7's WASM query-compiler loader (a dynamic import
// deep in @prisma/client's runtime) under ts-jest's CJS/VM sandbox, which fails outright
// ("dynamic import callback was invoked without --experimental-vm-modules") even with that
// flag set — Jest's module system and Prisma 7's WASM loader don't currently mix. Running
// the actual built server sidesteps it entirely, since that's the same `node` runtime this
// app has been manually verified against throughout development.
const PORT = 3099;
const BASE_URL = `http://localhost:${PORT}`;

function waitForServer(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolvePromise, rejectPromise) => {
    const tick = async () => {
      try {
        const res = await fetch(`${BASE_URL}/health`);
        if (res.ok) return resolvePromise();
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) return rejectPromise(new Error('Server did not start in time'));
      setTimeout(tick, 300);
    };
    tick();
  });
}

describe('AppController (e2e)', () => {
  let server: ChildProcess;

  beforeAll(async () => {
    server = spawn('node', [resolve(__dirname, '../dist/src/main.js')], {
      env: { ...process.env, PORT: String(PORT), AI_ENABLED: 'false' },
      stdio: 'pipe',
    });
    await waitForServer(20_000);
  }, 30_000);

  afterAll(() => {
    server.kill();
  });

  it('GET / is public', async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Hello World!');
  });

  it('GET /health is public', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('GET /health/db confirms a live database connection', async () => {
    const res = await fetch(`${BASE_URL}/health/db`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', db: 'connected' });
  });

  it('GET /me without a token is rejected', async () => {
    const res = await fetch(`${BASE_URL}/me`);
    expect(res.status).toBe(401);
  });

  it('GET /documents without a token is rejected', async () => {
    const res = await fetch(`${BASE_URL}/documents`);
    expect(res.status).toBe(401);
  });

  it('GET /graph without a token is rejected', async () => {
    const res = await fetch(`${BASE_URL}/graph`);
    expect(res.status).toBe(401);
  });

  it('GET /documents/:id/related/graph without a token is rejected', async () => {
    const res = await fetch(`${BASE_URL}/documents/00000000-0000-0000-0000-000000000000/related/graph`);
    expect(res.status).toBe(401);
  });

  // Auth-success paths (a valid Supabase token producing a 200 from /me, /documents,
  // etc.) require a real Supabase-issued JWT and are exercised manually against the
  // live project instead — see the milestone verification notes in the plan doc.
});
