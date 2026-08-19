import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

rmSync(resolve('dist/types'), { recursive: true, force: true })
