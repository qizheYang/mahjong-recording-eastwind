#!/usr/bin/env node
/**
 * CLI script to create an admin account.
 * Usage: npx tsx packages/server/src/create-admin.ts <username> <password>
 */
import { createAdmin } from './services/admin-service.js';

const [username, password] = process.argv.slice(2);

if (!username || !password) {
  console.error('Usage: npx tsx packages/server/src/create-admin.ts <username> <password>');
  process.exit(1);
}

try {
  createAdmin(username, password);
  console.log(`Admin account "${username}" created successfully.`);
} catch (err: any) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
