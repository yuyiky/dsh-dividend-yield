// 快照仓库：负责加载/保存 data/universe.json、后台抓取全市场数据、计算概览统计。
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { crawlUniverse, DATA_DIR } from './jisilu.js'

const SNAPSHOT_PATH = join(DATA_DIR, 'universe.json')
const REFRESH_MIN_GAP = 60 * 1000 // 手动刷新最短间隔
const STALE_AFTER = 2 * 60 * 60 * 1000 // 超过 2 小时自动重抓
const AUTO_REFRESH_INTERVAL = 60 * 60 * 1000 // 每小时检查一次

const finiteOrNull = (value) => (Number.isFinite(value) ? value : null)

function average(values) {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

/** 面板顶部概览：只统计有 TTM 股息率（>0）的股票。 */
export function computeSummary(stocks) {
  const sample = stocks.filter((item) => Number.isFinite(item.divYield) && item.divYield > 0)
  const yields = sample.map((item) => item.divYield)
  const buckets = [
    { key: 'lt1', label: '<1%', count: 0 },
    { key: '1to2', label: '1–2%', count: 0 },
    { key: '2to3', label: '2–3%', count: 0 },
    { key: '3to4', label: '3–4%', count: 0 },
    { key: '4to5', label: '4–5%', count: 0 },
    { key: '5to6', label: '5–6%', count: 0 },
    { key: 'gte6', label: '≥6%', count: 0 },
  ]
  for (const value of yields) {
    if (value < 1) buckets[0].count++
    else if (value < 2) buckets[1].count++
    else if (value < 3) buckets[2].count++
    else if (value < 4) buckets[3].count++
    else if (value < 5) buckets[4].count++
    else if (value < 6) buckets[5].count++
    else buckets[6].count++
  }

  const byIndustry = new Map()
  for (const item of sample) {
    const key = item.industryL1 || '未分类'
    if (!byIndustry.has(key)) byIndustry.set(key, [])
    byIndustry.get(key).push(item.divYield)
  }
  const industries = [...byIndustry.entries()]
    .map(([name, values]) => ({ name, count: values.length, avg: average(values), median: median(values) }))
    .map((item) => ({ ...item, avg: item.avg === null ? null : Math.round(item.avg * 100) / 100 }))
    .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))

  return {
    count: stocks.length,
    sampleCount: sample.length,
    withFiveYear: stocks.filter((item) => Number.isFinite(item.divYield5y) && item.divYield5y > 0).length,
    avg: yields.length ? Math.round(average(yields) * 1000) / 1000 : null,
    median: yields.length ? Math.round(median(yields) * 1000) / 1000 : null,
    ge3: sample.filter((item) => item.divYield >= 3).length,
    ge4: sample.filter((item) => item.divYield >= 4).length,
    ge5: sample.filter((item) => item.divYield >= 5).length,
    ge6: sample.filter((item) => item.divYield >= 6).length,
    buckets,
    topIndustries: industries.slice(0, 6),
    worstIndustries: industries.slice(-3).reverse(),
  }
}

function safeSnapshot(raw) {
  if (!raw || !Array.isArray(raw.stocks)) return null
  return raw
}

export class UniverseStore {
  constructor({ log = () => {} } = {}) {
    this.log = log
    this.snapshot = null
    this.phase = 'idle' // idle | loading | crawling | ready | error
    this.progress = null
    this.error = null
    this.lastRefreshAt = 0
    this.refreshing = null
    this.summary = null
  }

  status() {
    return {
      ok: true,
      phase: this.phase,
      refreshing: Boolean(this.refreshing),
      progress: this.progress,
      error: this.error,
      generatedAt: this.snapshot?.generatedAt ?? null,
      dataDate: this.snapshot?.dataDate ?? null,
      count: this.snapshot?.count ?? 0,
      validCount: this.snapshot?.validCount ?? 0,
      expectedTotal: this.snapshot?.expectedTotal ?? null,
      complete: this.snapshot?.complete ?? false,
      failedPartitions: this.snapshot?.failed?.length ?? 0,
      sampleCount: this.summary?.sampleCount ?? 0,
    }
  }

  snapshotPayload() {
    if (!this.snapshot) return null
    return {
      ok: true,
      source: this.snapshot.source,
      generatedAt: this.snapshot.generatedAt,
      dataDate: this.snapshot.dataDate,
      count: this.snapshot.count,
      validCount: this.snapshot.validCount,
      expectedTotal: this.snapshot.expectedTotal,
      complete: this.snapshot.complete,
      failed: this.snapshot.failed ?? [],
      stats: this.snapshot.stats ?? null,
      summary: this.summary,
      stocks: this.snapshot.stocks,
    }
  }

  async loadFromDisk() {
    this.phase = this.snapshot ? this.phase : 'loading'
    try {
      const raw = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'))
      const snapshot = safeSnapshot(raw)
      if (!snapshot) throw new Error('快照格式不正确：缺少 stocks 数组')
      this.snapshot = snapshot
      this.summary = computeSummary(snapshot.stocks)
      this.phase = 'ready'
      this.error = null
      this.log(`已加载本地快照：${snapshot.count} 只股票，数据日期 ${snapshot.dataDate || '未知'}`)
      return true
    } catch (error) {
      if (error?.code !== 'ENOENT') this.log(`读取本地快照失败：${error.message}`)
      if (!this.snapshot) this.phase = 'idle'
      return false
    }
  }

  async persist(snapshot) {
    await mkdir(DATA_DIR, { recursive: true })
    const tmpPath = `${SNAPSHOT_PATH}.tmp`
    await writeFile(tmpPath, JSON.stringify(snapshot), 'utf8')
    await rename(tmpPath, SNAPSHOT_PATH)
    this.log(`快照已写入 ${SNAPSHOT_PATH}`)
  }

  refresh({ reason = 'manual', force = false } = {}) {
    if (this.refreshing) return this.refreshing
    const since = Date.now() - this.lastRefreshAt
    if (!force && since < REFRESH_MIN_GAP) {
      this.log(`忽略刷新请求（${reason}）：距上次刷新仅 ${Math.round(since / 1000)}s`)
      return Promise.resolve(false)
    }
    this.lastRefreshAt = Date.now()
    this.phase = 'crawling'
    this.progress = {
      phase: 'crawling',
      done: 0,
      total: 0,
      queries: 0,
      rows: this.snapshot?.count ?? 0,
      failed: 0,
      startedAt: new Date().toISOString(),
      elapsedMs: 0,
    }
    this.error = null
    this.refreshing = (async () => {
      try {
        const snapshot = await crawlUniverse({
          concurrency: 3,
          log: (message) => this.log(message),
          onProgress: (progress) => {
            this.progress = progress
          },
        })
        this.snapshot = snapshot
        this.summary = computeSummary(snapshot.stocks)
        this.phase = 'ready'
        this.progress = null
        await this.persist(snapshot)
        this.log(
          `刷新完成：${snapshot.count} 只股票（有股息 ${snapshot.stocks.filter((item) => item.divYield > 0).length} 只），` +
            `${snapshot.stats?.queries ?? 0} 次请求，用时 ${Math.round((snapshot.stats?.elapsedMs ?? 0) / 1000)}s`,
        )
        return true
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error)
        this.phase = this.snapshot ? 'ready' : 'error'
        this.log(`刷新失败：${this.error}`)
        return false
      } finally {
        this.refreshing = null
      }
    })()
    return this.refreshing
  }

  /** 启动时：先读本地快照，过期则在后台重抓；再挂一个低频率检查定时器。 */
  async start() {
    await this.loadFromDisk()
    if (!this.snapshot || Date.now() - Date.parse(this.snapshot.generatedAt || 0) > STALE_AFTER) {
      void this.refresh({ reason: 'startup', force: true })
    }
    return null
  }

  startAutoRefresh() {
    const timer = setInterval(() => {
      if (this.refreshing) return
      const generatedAt = Date.parse(this.snapshot?.generatedAt || '')
      if (!Number.isFinite(generatedAt) || Date.now() - generatedAt > STALE_AFTER) {
        void this.refresh({ reason: 'auto', force: true })
      }
    }, AUTO_REFRESH_INTERVAL)
    if (typeof timer.unref === 'function') timer.unref()
    return timer
  }
}
