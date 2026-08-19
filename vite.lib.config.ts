import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// 与 peerDependencies/dependencies 对应的外部化包：库构建时不打包，由宿主提供
const externalPackages = [
  'vue',
  'ant-design-vue',
  '@ant-design/icons-vue',
  '@vueuse/core',
  'plotly.js-dist-min',
  'plotly.js',
]

export default defineConfig({
  plugins: [vue()],
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: 'vue',
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'Waveform3DAnalysis',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
      cssFileName: 'style',
    },
    rolldownOptions: {
      external: (id) =>
        externalPackages.some((dependency) => id === dependency || id.startsWith(`${dependency}/`)),
    },
  },
})
