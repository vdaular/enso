/// <reference types="histoire" />

import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import { COOP_COEP_CORP_HEADERS } from 'enso-common'
import { getDefines, readEnvironmentFromFile } from 'enso-common/src/appConfig'
import { fileURLToPath } from 'node:url'
import postcssNesting from 'postcss-nesting'
import tailwindcss from 'tailwindcss'
import tailwindcssNesting from 'tailwindcss/nesting'
import { defineConfig, type Plugin } from 'vite'
import VueDevTools from 'vite-plugin-vue-devtools'
import wasm from 'vite-plugin-wasm'
import tailwindConfig from './tailwind.config'

const dynHostnameWsUrl = (port: number) => JSON.stringify(`ws://__HOSTNAME__:${port}`)
const projectManagerUrl = dynHostnameWsUrl(process.env.E2E === 'true' ? 30536 : 30535)
const IS_CLOUD_BUILD = process.env.CLOUD_BUILD === 'true'
const YDOC_SERVER_URL =
  process.env.ENSO_POLYGLOT_YDOC_SERVER ? JSON.stringify(process.env.ENSO_POLYGLOT_YDOC_SERVER)
  : process.env.NODE_ENV === 'development' ? dynHostnameWsUrl(5976)
  : undefined

await readEnvironmentFromFile()

const entrypoint =
  process.env.E2E === 'true' ? './src/project-view/e2e-entrypoint.ts' : './src/entrypoint.ts'

// NOTE(Frizi): This rename is for the sake of forward compatibility with not yet merged config refactor on bazel branch,
// and because Vite's HTML env replacements only work with import.meta.env variables, not defines.
process.env.ENSO_IDE_VERSION = process.env.ENSO_CLOUD_DASHBOARD_VERSION

// https://vitejs.dev/config/
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../../node_modules/.cache/vite', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    wasm(),
    ...(process.env.NODE_ENV === 'development' ? [await VueDevTools()] : []),
    vue({
      customElement: ['**/components/visualizations/**', '**/components/shared/**'],
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('enso-'),
        },
      },
    }),
    react({
      include: fileURLToPath(new URL('./src/dashboard/**/*.tsx', import.meta.url)),
      babel: {
        plugins: [
          '@babel/plugin-syntax-import-attributes',
          ['babel-plugin-react-compiler', { target: '18' }],
        ],
      },
    }),
    ...(process.env.NODE_ENV === 'development' ? [await projectManagerShim()] : []),
  ],
  optimizeDeps: {
    entries: fileURLToPath(new URL('./index.html', import.meta.url)),
  },
  server: {
    headers: Object.fromEntries(COOP_COEP_CORP_HEADERS),
    ...(process.env.GUI_HOSTNAME ? { host: process.env.GUI_HOSTNAME } : {}),
  },
  resolve: {
    conditions: ['source'],
    alias: {
      '/src/entrypoint.ts': fileURLToPath(new URL(entrypoint, import.meta.url)),
      shared: fileURLToPath(new URL('./shared', import.meta.url)),
      '@': fileURLToPath(new URL('./src/project-view', import.meta.url)),
      '#': fileURLToPath(new URL('./src/dashboard', import.meta.url)),
    },
  },
  envPrefix: 'ENSO_IDE_',
  define: {
    ...getDefines(),
    IS_CLOUD_BUILD: JSON.stringify(IS_CLOUD_BUILD),
    PROJECT_MANAGER_URL: projectManagerUrl,
    YDOC_SERVER_URL: YDOC_SERVER_URL,
    'import.meta.vitest': false,
    // Single hardcoded usage of `global` in aws-amplify.
    'global.TYPED_ARRAY_SUPPORT': true,
  },
  esbuild: {
    dropLabels: process.env.NODE_ENV === 'development' ? [] : ['DEV'],
    supported: {
      'top-level-await': true,
    },
  },
  assetsInclude: ['**/*.svg'],
  css: {
    postcss: {
      plugins: [tailwindcssNesting(postcssNesting()), tailwindcss(tailwindConfig)],
    },
  },
  build: {
    // dashboard chunk size is larger than the default warning limit
    chunkSizeWarningLimit: 700,
  },
})
async function projectManagerShim(): Promise<Plugin> {
  const module = await import('./project-manager-shim-middleware')
  return {
    name: 'project-manager-shim',
    configureServer(server) {
      server.middlewares.use(module.default)
    },
  }
}
