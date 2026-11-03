// Runs the checks of seo-output.ts on the real build. Run after `npm run build`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { seoProblems } from './seo-output.ts'

const DIST = join(dirname(fileURLToPath(import.meta.url)), '../.vitepress/dist')
const paths = readdirSync(DIST, { recursive: true, encoding: 'utf8' })
  .filter((path) => statSync(join(DIST, path)).isFile())
  .map((path) => path.split(sep).join('/'))
const problems = seoProblems({
  paths,
  read: (path) => readFileSync(join(DIST, path), 'utf8'),
  size: (path) => statSync(join(DIST, path)).size,
})
for (const problem of problems) console.error(problem)
console.log(`seo output: ${problems.length} problem(s)`)
process.exit(problems.length === 0 ? 0 : 1)
