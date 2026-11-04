// Fill an EMPTY database with demo data (customers, orders, a shipment round, payments…): `npm run seed`
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test'; // don't auto-listen on PORT
const { app } = await import('../server/index.js');
const { get } = await import('../server/db.js');
const { client, runFlow } = await import('./flow.js');

if (get('SELECT 1 FROM customers LIMIT 1')) {
  console.error('Database already has customers — demo seed only runs on an empty database.');
  process.exit(1);
}
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
try {
  await runFlow(client(base), (s) => console.log('•', s));
  console.log('\nDemo data created. Sign in as admin / (your admin password), or lee / lee12345 for a warehouse role.');
} finally {
  server.close();
}
