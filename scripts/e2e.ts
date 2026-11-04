// End-to-end API test on a throw-away database: `npm test`
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jjcargo-test-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD = 'admin123';

const { app } = await import('../server/index.js');
const { client, runFlow, permissionChecks } = await import('./flow.js');

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
let failed = false;
try {
  await runFlow(client(base), (s) => console.log('  ✓', s));
  await permissionChecks(base);
  console.log('  ✓ permissions');
  console.log('\nAll checks passed');
} catch (e) {
  failed = true;
  console.error('\nFAILED:', e);
} finally {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
