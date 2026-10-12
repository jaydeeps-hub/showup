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
    include: ['src/**/*.test.ts'],
  },
})
