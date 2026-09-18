import { defineConfig } from 'drizzle-kit';

const isLocal = process.env.ENVIRONMENT === 'local';

const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

export default defineConfig({
  schema: './src/infra/database/schema',
  out: './drizzle',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: {
    url: DB_URL,
    ssl: isLocal ? 'allow' : 'require',
  },
  verbose: true,
});
