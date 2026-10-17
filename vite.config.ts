/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Business logic tests run in Node. Browser APIs (localStorage, geolocation)
    // are replaced with small fakes inside each test file.
    environment: 'node',
    // supabase/tests runs the SQL migrations against an in-process Postgres (see that file).
    include: ['src/**/*.test.{ts,tsx}', 'supabase/tests/**/*.test.ts'],
    // Screen tests (.test.tsx) need a browser-like DOM; they opt in with a `@vitest-environment jsdom` comment.
    testTimeout: 30_000,
  },
})
