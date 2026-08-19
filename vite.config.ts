import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: process.env.DEMO_BASE_PATH ?? '/',
  plugins: [vue()],
  // 组件使用 TSX 编写：类型检查用 preserve（vue/jsx 全局命名空间），
  // 构建时由 oxc 按 Vue 的 automatic JSX 运行时转换（vue/jsx-runtime）
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: 'vue',
    },
  },
  server: {
    host: '0.0.0.0',
  },
  preview: {
    host: '0.0.0.0',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    css: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  build: {
    outDir: 'dist-demo',
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'framework',
              test: /node_modules[\\/](?:@vue|vue)[\\/]/,
              priority: 4,
              includeDependenciesRecursively: false,
            },
            {
              name: 'visualization',
              test: /node_modules[\\/]plotly\.js(?:-[^\\/]+)?[\\/]/,
              priority: 3,
              includeDependenciesRecursively: false,
            },
            {
              name: 'ui',
              test: /node_modules[\\/](?:@ant-design|@vueuse|ant-design-vue|classnames)[\\/]/,
              priority: 2,
              includeDependenciesRecursively: false,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              priority: 1,
              includeDependenciesRecursively: true,
            },
          ],
        },
      },
    },
  },
})
