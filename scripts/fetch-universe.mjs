// 手动抓取全市场股息率快照：node scripts/fetch-universe.mjs [--concurrency 2] [--max-queries 400]
//
// 生成 data/universe.json。插件运行时会自动在后台调用同样的抓取逻辑，
// 这个脚本主要用于首次构建、调试或离线检查。
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crawlUniverse, DATA_DIR } from '../lib/jisilu.js'

const args = process.argv.slice(2)
const readArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  if (index === -1) return fallback
  const value = args[index + 1]
  return value === undefined ? fallback : value
}

const concurrency = Number(readArg('concurrency', 2))
const maxQueries = Number(readArg('max-queries', 400))
const outPath = join(DATA_DIR, 'universe.json')

console.error(`[fetch-universe] 开始抓取 concurrency=${concurrency} maxQueries=${maxQueries}`)
const snapshot = await crawlUniverse({
  concurrency,
  maxQueries,
  log: (message) => console.error(`[fetch-universe] ${message}`),
  onProgress: (progress) => {
    if (progress.done % 5 === 0 || progress.done === progress.total) {
      const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
      console.error(
        `[fetch-universe] ${pct}% ${progress.done}/${progress.total} 查询=${progress.queries} 股票=${progress.rows} 失败=${progress.failed}`,
      )
    }
  },
})

await mkdir(DATA_DIR, { recursive: true })
const tmpPath = `${outPath}.tmp`
await writeFile(tmpPath, JSON.stringify(snapshot), 'utf8')
await rename(tmpPath, outPath)
console.error(
  `[fetch-universe] 完成：股票=${snapshot.count} 有股息=${snapshot.validCount} 期望=${snapshot.expectedTotal ?? '?'} 失败分区=${snapshot.failed.length} 用时=${Math.round(snapshot.stats.elapsedMs / 1000)}s`,
)
console.error(`[fetch-universe] 已写入 ${outPath}`)
