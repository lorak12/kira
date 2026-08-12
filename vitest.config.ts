import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

const root = import.meta.dirname

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/main/**/*.test.ts'],
    setupFiles: ['./test/setup.ts']
  },
  resolve: {
    alias: {
      electron: resolve(root, 'test/mocks/electron.ts'),
      '@electron-toolkit/utils': resolve(root, 'test/mocks/electronToolkitUtils.ts'),
      '@shared': resolve(root, 'src/shared')
    }
  }
})
