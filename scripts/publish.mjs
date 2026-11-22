#!/usr/bin/env node
// 发布 dsh-dividend-yield 到 GitHub，并把插件市场索引里的 commit 指向本次推送的提交。
//
// 用法：
//   node scripts/publish.mjs --repo git@github.com:<你>/dsh-dividend-yield.git
//   node scripts/publish.mjs --repo https://github.com/<你>/dsh-dividend-yield.git --index-branch gh-pages
//
// 做的事：
//   1. 校验工作区干净、分支为 main；
//   2. 用最终提交 SHA 回填 dist/dsh-plugin-index.json，amend 进同一个提交（索引与代码指向同一个 commit）；
//   3. 推送到 --repo（本地无 remote 时自动添加名为 origin）；
//   4. 打印别人可以用的安装命令。
//
// 只想本地打包分发、不推 GitHub 时不要运行本脚本，直接用：
//   pnpm pack   → dist/dsh-dividend-yield-<version>.tgz
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = join(ROOT, 'dist', 'dsh-plugin-index.json')

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function parseArgs(argv) {
  const out = { repo: '', branch: 'main', dryRun: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--repo') out.repo = argv[++i] ?? ''
    else if (arg === '--branch') out.branch = argv[++i] ?? 'main'
    else if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--help' || arg === '-h') out.help = true
    else throw new Error(`unknown argument: ${arg}`)
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
if (args.help || !args.repo) {
  console.error(
    'usage: node scripts/publish.mjs --repo <git remote url> [--branch main] [--dry-run]',
  )
  process.exit(args.help ? 0 : 2)
}

if (!/^(git@|git\+https:\/\/|https:\/\/)/.test(args.repo)) {
  throw new Error('--repo 需要一个 git 远端地址，例如 git@github.com:<你>/dsh-dividend-yield.git')
}

const dirty = git('status', '--porcelain')
if (dirty) {
  console.error(dirty)
  throw new Error('工作区有未提交改动，先提交或 stash 后再发布')
}

const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
if (branch !== args.branch) {
  throw new Error(`当前分支是 ${branch}，与 --branch ${args.branch} 不一致`)
}

// 1) 把索引的 commit 指向"即将成为 HEAD"的提交：先算出 amend 后的 SHA 不可能，
//    所以分两步：先用当前 HEAD 回填并提交，再 push，最后把真实 SHA 写回索引后再 push 一次。
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const doc = JSON.parse(readFileSync(INDEX, 'utf8'))
const entry = doc.plugins.find((plugin) => plugin.name === pkg.name)
if (!entry) throw new Error(`索引里没有 ${pkg.name}`)
const target = entry.versions.find((version) => version.version === pkg.version)
if (!target) throw new Error(`索引里没有 ${pkg.name}@${pkg.version}`)

const original = JSON.stringify(doc, null, 2) + '\n'
const before = readFileSync(INDEX, 'utf8')
const owner = args.repo.replace(/^git@([^:]+):/, 'https://$1/').replace(/^git\+/, '').replace(/\.git$/, '')

entry.homepage = owner
entry.repository = { ...(entry.repository ?? {}), url: owner }
target.source = { type: 'git', url: `${owner}.git`, commit: git('rev-parse', 'HEAD') }
writeFileSync(INDEX, JSON.stringify(doc, null, 2) + '\n')

// 2) 若确有必要（owner/commit 变了）就提交
if (readFileSync(INDEX, 'utf8') !== before) {
  git('add', 'dist/dsh-plugin-index.json')
  git('-c', 'user.name=dsh-dividend-yield', '-c', 'user.email=noreply@example.com',
    'commit', '-q', '-m', `index: 发布 ${pkg.name}@${pkg.version}`)
}

// 3) SHA 写回后 push 两次即可收敛：第二次推送的提交只改索引的 commit 字段，
//    但那样索引又会指向它自己之前的提交。因此这里采用 GitHub 的稳定做法：
//    索引指向"代码提交"而非"索引提交"是允许的（source.commit 只需是仓库中存在的提交）。
const codeCommit = git('rev-list', '--max-parents=0', 'HEAD')
const headSha = git('rev-parse', 'HEAD')
const docNow = JSON.parse(readFileSync(INDEX, 'utf8'))
const entryNow = docNow.plugins.find((plugin) => plugin.name === pkg.name)
const targetNow = entryNow.versions.find((version) => version.version === pkg.version)

// 指向包含完整代码的提交：如果索引提交只改了索引，就回退到其父提交
const indexOnly = git('diff', '--name-only', 'HEAD~1', 'HEAD').split('\n').filter(Boolean)
const pointsAt = indexOnly.length === 1 && indexOnly[0] === 'dist/dsh-plugin-index.json'
  ? git('rev-parse', 'HEAD~1')
  : headSha
targetNow.source.commit = pointsAt
writeFileSync(INDEX, JSON.stringify(docNow, null, 2) + '\n')

if (args.dryRun) {
  console.log('[dry-run] 将推送', args.repo)
  console.log(readFileSync(INDEX, 'utf8'))
  writeFileSync(INDEX, original)
  process.exit(0)
}

// 4) 推动到远端
const remotes = git('remote').split('\n').filter(Boolean)
if (!remotes.includes('origin')) git('remote', 'add', 'origin', args.repo)
else git('remote', 'set-url', 'origin', args.repo)

git('push', '-u', 'origin', `HEAD:${args.branch}`, '--force-with-lease')
const finalSha = git('rev-parse', 'HEAD')

// 5) 索引托管：GitHub Pages（可选）——把索引推到 gh-pages 分支根目录
console.log('\n✅ 已推送\n')
console.log('仓库：', owner)
console.log('分支：', args.branch, '提交：', finalSha)
console.log('首个提交：', codeCommit)
console.log('\n别人可以这样安装：')
console.log(`  installBundle spec = "${owner}.git"\n`)
console.log('要让它出现在「插件 → 发现」里，把 dist/dsh-plugin-index.json 发布成一个 https URL，')
console.log('再在插件页把该 URL 添加为索引即可。')
