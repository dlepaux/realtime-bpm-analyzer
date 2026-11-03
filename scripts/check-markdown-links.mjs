import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const targets = ['readme.md', 'docs', 'examples', 'packages/cli/readme.md', 'packages/mcp/readme.md']

function collectMarkdownFiles() {
  const files = []

  for (const target of targets) {
    const resolved = path.join(repoRoot, target)
    if (!fs.existsSync(resolved)) continue

    const stat = fs.statSync(resolved)
    if (stat.isFile()) {
      if (/\.md$/i.test(resolved)) files.push(resolved)
      continue
    }

    const walk = (current) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name)
        if (entry.isDirectory()) {
          walk(fullPath)
          continue
        }

        if (entry.isFile() && /\.md$/i.test(entry.name)) files.push(fullPath)
      }
    }

    walk(resolved)
  }

  return [...new Set(files)].sort()
}

function slugifyHeading(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
}

function collectAnchors(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const anchors = new Set()

  for (const match of source.matchAll(/<[^>]+\s+(?:id|name)=["']([^"']+)["'][^>]*>/gi)) {
    anchors.add(match[1].trim())
  }

  for (const line of source.split(/\r?\n/)) {
    const headingMatch = line.match(/^#{1,6}\s+(.*)$/)
    if (!headingMatch) continue
    const slug = slugifyHeading(headingMatch[1])
    if (slug) anchors.add(slug)
  }

  return anchors
}

function resolveTarget(filePath, target) {
  if (target.startsWith('#')) return null
  if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:') || target.startsWith('tel:')) return null
  if (target.startsWith('/')) return null

  const [relativePath, fragment] = target.split('#')
  const candidate = path.resolve(path.dirname(filePath), relativePath)
  return { candidate, fragment }
}

function validateFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const markdownLinks = [...source.matchAll(/!??\[[^\]]*\]\(([^)]+)\)/g)]
  const issues = []

  for (const match of markdownLinks) {
    const target = match[1].trim()
    if (!target || target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:') || target.startsWith('tel:') || target.startsWith('#') || target.startsWith('/')) {
      continue
    }

    const resolved = resolveTarget(filePath, target)
    if (!resolved) continue

    const { candidate, fragment } = resolved
    if (!fs.existsSync(candidate)) {
      issues.push(`${path.relative(repoRoot, filePath)}: missing link ${target}`)
      continue
    }

    const stat = fs.statSync(candidate)
    if (stat.isDirectory()) {
      const index = path.join(candidate, 'index.md')
      const readme = path.join(candidate, 'readme.md')
      if (!fs.existsSync(index) && !fs.existsSync(readme)) {
        issues.push(`${path.relative(repoRoot, filePath)}: missing directory index for ${target}`)
      }
      continue
    }

    const ext = path.extname(candidate).toLowerCase()
    if (fragment && (ext === '.md' || ext === '.html')) {
      const anchors = collectAnchors(candidate)
      if (!anchors.has(fragment)) {
        issues.push(`${path.relative(repoRoot, filePath)}: missing anchor ${fragment} in ${path.relative(repoRoot, candidate)}`)
      }
    }
  }

  return issues
}

function main() {
  const files = collectMarkdownFiles()
  const issues = []

  for (const file of files) {
    issues.push(...validateFile(file))
  }

  if (issues.length > 0) {
    console.error('Broken markdown links found:')
    for (const issue of issues) console.error(`- ${issue}`)
    process.exitCode = 1
    return
  }

  console.log(`Markdown links verified for ${files.length} files.`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { collectMarkdownFiles, validateFile, main }
