import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

// We export this 'db' instance so ANY file in our project can import and use it
const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, {
  max: 10,               // Do not open more than 10 simultaneous phone lines
  idle_timeout: 20,      // If a line is quiet for 20 seconds, Express will hang it up cleanly itself
  max_lifetime: 60 * 30, // Force a completely fresh connection every 30 minutes
});
export const db = drizzle(client);