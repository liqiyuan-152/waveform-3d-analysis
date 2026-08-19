import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_LINES = 400
const ROOT = fileURLToPath(new URL('..', import.meta.url))

const collectSourceFiles = (dir) => {
  const entries = readdirSync(dir)
  const files = []

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)

    if (stats.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'dist-demo') {
        continue
      }
      files.push(...collectSourceFiles(fullPath))
      continue
    }

    if (/\.(ts|tsx|vue)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) && entry !== 'env.d.ts') {
      files.push(fullPath)
    }
  }

  return files
}

const violations = collectSourceFiles(join(ROOT, 'src'))
  .map((file) => ({
    file,
    lines: readFileSync(file, 'utf8').split('\n').length,
  }))
  .filter(({ lines }) => lines > MAX_LINES)
  .map(({ file, lines }) => `${file.replace(ROOT, '')}: ${lines} 行（超过 ${MAX_LINES} 行）`)

if (violations.length > 0) {
  console.error(`以下文件超过 ${MAX_LINES} 行限制：`)
  violations.forEach((violation) => console.error(`  ${violation}`))
  process.exit(1)
}

console.log(`check-file-length: 通过（所有源文件均不超过 ${MAX_LINES} 行）`)
