import { config } from 'dotenv';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

config({ path: join(__dirname, '..', '..', '.env') });

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
  },
});
