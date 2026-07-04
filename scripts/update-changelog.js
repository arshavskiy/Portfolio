// Fold `Changelog:` trailers from commits being pushed to master into today's
// changelog entry (client/src/data/changelog.js). Run by the pre-push hook.
//
// Usage: node scripts/update-changelog.js <range>
//   <range> is a git revision range, e.g. "origin/master..HEAD" or a single SHA.
//
// A commit is included only if its message has one or more lines like:
//   Changelog: Fixed the watchlist freeze
// Each such line becomes a bullet under today's entry. Internal commits with no
// trailer are ignored, keeping the user-facing changelog curated.
//
// Exit codes:
//   0  no changes made (nothing to add, or already present)
//   2  changelog file was modified — caller should commit it and push again

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const CHANGELOG = path.resolve(__dirname, '..', 'client', 'src', 'data', 'changelog.js')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function todayParts() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return {
    version: `${yyyy}.${mm}.${dd}`,
    date: `${MONTHS[d.getMonth()]} ${d.getDate()}, ${yyyy}`,
  }
}

// Pull `Changelog:` trailer lines from every commit in the range.
function collectChangelogLines(range) {
  let raw = ''
  try {
    // %B = full body; \x1e separates commits so multi-line bodies stay intact.
    raw = execSync(`git log ${range} --format=%B%x1e`, { encoding: 'utf8' })
  } catch {
    return []
  }
  const lines = []
  for (const commit of raw.split('\x1e')) {
    for (const line of commit.split('\n')) {
      const m = /^\s*Changelog:\s*(.+?)\s*$/i.exec(line)
      if (m && m[1]) lines.push(m[1])
    }
  }
  return lines
}

function jsString(s) {
  return JSON.stringify(s)
}

// Insert `changes` into today's entry, creating it if the top entry isn't today.
// Works on the source text directly to preserve formatting of other entries.
function applyChanges(source, changes) {
  const { version, date } = todayParts()
  const arrStart = source.indexOf('export const changelog = [')
  if (arrStart === -1) throw new Error('changelog array not found')
  const openBracket = source.indexOf('[', arrStart)

  const topVersionMatch = /version:\s*['"]([\d.]+)['"]/.exec(source.slice(openBracket))
  const topVersion = topVersionMatch ? topVersionMatch[1] : null

  if (topVersion === version) {
    // Append to today's existing entry — find its `changes: [` and its close.
    const changesIdx = source.indexOf('changes: [', openBracket)
    const changesOpen = source.indexOf('[', changesIdx)
    const changesClose = source.indexOf(']', changesOpen)
    const existing = source.slice(changesOpen + 1, changesClose)
    const toAdd = changes.filter((c) => !existing.includes(jsString(c)) && !existing.includes(`'${c}'`))
    if (!toAdd.length) return null
    const bullets = toAdd.map((c) => `      ${jsString(c)},`).join('\n')
    const trimmed = existing.replace(/\s*$/, '')
    const sep = trimmed.trim().endsWith(',') || trimmed.trim() === '' ? '' : ','
    return source.slice(0, changesClose).replace(/\s*$/, '') + sep + '\n' + bullets + '\n    ' + source.slice(changesClose)
  }

  // Create a fresh entry for today at the top of the array.
  const bullets = changes.map((c) => `      ${jsString(c)},`).join('\n')
  const entry =
    `\n  {\n` +
    `    version: '${version}',\n` +
    `    date: '${date}',\n` +
    `    title: 'Updates',\n` +
    `    changes: [\n${bullets}\n    ],\n` +
    `  },`
  return source.slice(0, openBracket + 1) + entry + source.slice(openBracket + 1)
}

function main() {
  const range = process.argv[2]
  if (!range) {
    console.error('update-changelog: missing range argument')
    process.exit(0)
  }
  const changes = collectChangelogLines(range)
  if (!changes.length) process.exit(0)

  const source = fs.readFileSync(CHANGELOG, 'utf8')
  const updated = applyChanges(source, changes)
  if (!updated || updated === source) process.exit(0)

  fs.writeFileSync(CHANGELOG, updated)
  console.error('\n  Changelog updated with:')
  for (const c of changes) console.error(`    • ${c}`)
  console.error('\n  Commit client/src/data/changelog.js and push again.\n')
  process.exit(2)
}

main()
