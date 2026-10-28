// lib/db.js
import { createClient } from '@tursodatabase/serverless/compat';

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
