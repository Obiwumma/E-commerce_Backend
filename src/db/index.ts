import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL!;

const sql = postgres(connectionString, {
  ssl: 'require',
});

export const db = drizzle(sql);