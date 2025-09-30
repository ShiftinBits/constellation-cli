import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  dts: false,  // No types needed for executable
  sourcemap: false,
  clean: true,
  minify: true,
  splitting: false,
  external: [],
  treeshake: true,
  bundle: true,
  outDir: 'dist',
  banner: {
    js: '#!/usr/bin/env node'
  }
})
