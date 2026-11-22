// dsh-dividend-yield 宿主半片：代理集思录「股息率」数据，聚合成全市场快照并提供 HTTP 接口。
//
// 数据来源：https://www.jisilu.cn/data/stock/dividend_rate/
// 由于集思录非会员单次最多返回 100 行，宿主启动后在后台按申万行业分级分区抓取，
// 合并为 data/universe.json 快照；面板通过 /snapshot 一次取回全量数据。
import { gzipSync } from 'node:zlib'
import { loadMeta, loadTaxonomy, PAGE_URL } from './jisilu.js'
import { computeSummary, UniverseStore } from './universe.js'

const ROUTE = '/api/dividend-yield'

const DEFAULT_THRESHOLDS = { watch: 5, notice: 4 }

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function jsonGzip(req, res, status, body) {
  const text = JSON.stringify(body)
  const accept = String(req.headers['accept-encoding'] ?? '')
  if (accept.includes('gzip') && text.length > 64 * 1024) {
    const compressed = gzipSync(Buffer.from(text, 'utf8'))
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('content-encoding', 'gzip')
    res.setHeader('cache-control', 'no-store')
    res.end(compressed)
    return
  }
  json(res, status, body)
}

/** 只接受本机来源：面板与宿主同源，远程访问由 DSH 自身的信任栅栏负责。 */
function requestRejection(ctx, req) {
  let connection
  try {
    connection = ctx.get?.('connection') ?? ctx.connection
  } catch {
    connection = ctx.connection
  }
  if (typeof connection?.requestRejection === 'function') {
    return connection.requestRejection({ headers: req.headers })
  }
  const address = req.socket?.remoteAddress ?? ''
  if (address === '::1' || address.startsWith('127.')) return
  return 403
}

function buildIndustryTree(taxonomy) {
  const roots = []
  const byCode = new Map()
  for (const node of taxonomy) {
    if (!node.value || node.level === 0) continue
    const entry = {
      code: node.value,
      name: node.text,
      level: node.level,
      count: node.count ?? node.cnts ?? 0,
      children: [],
    }
    byCode.set(node.value, entry)
    if (node.level === 1) roots.push(entry)
    else {
      const parent = byCode.get(node.value.slice(0, node.level === 3 ? 4 : 2))
      if (parent) parent.children.push(entry)
      else roots.push(entry)
    }
  }
  return roots
}

let runtime = null

export const name = 'dsh-dividend-yield'

export default {
  inject: ['webServer', 'connection'],
  apply(ctx) {
    const log = (...args) => ctx.logger?.info?.(`dividend-yield: ${args.join(' ')}`)
    const store = new UniverseStore({ log })
    const metaPromise = Promise.all([loadTaxonomy(), loadMeta()])
      .catch((error) => {
        log(`读取内置元数据失败：${error.message}`)
        return [null, null]
      })

    ctx.effect(() => {
      const timer = store.startAutoRefresh()
      store.start().catch((error) => log(`启动加载失败：${error.message}`))
      return () => clearInterval(timer)
    }, 'dsh-dividend-yield: 快照加载与自动刷新')

    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: ROUTE,
      handler: async (req, res) => {
        try {
          const rejection = requestRejection(ctx, req)
          if (rejection) {
            json(res, rejection, { ok: false, error: '未授权访问' })
            return
          }
          const url = new URL(req.url ?? ROUTE, 'http://localhost')
          const path = url.pathname.replace(ROUTE, '') || '/'
          const [taxonomy, meta] = await metaPromise

          if (path === '/health') {
            json(res, 200, {
              ok: true,
              source: PAGE_URL,
              phase: store.phase,
              count: store.snapshot?.count ?? 0,
              dataDate: store.snapshot?.dataDate ?? null,
            })
            return
          }

          if (path === '/status') {
            json(res, 200, store.status())
            return
          }

          if (path === '/meta') {
            json(res, 200, {
              ok: true,
              source: PAGE_URL,
              generatedAt: new Date().toISOString(),
              thresholds: DEFAULT_THRESHOLDS,
              defaultFilters: { minYield: 0, minFiveYear: 0, requireDividend: true },
              markets: meta?.markets ?? [
                { value: 'sh', label: '沪市' },
                { value: 'sz', label: '深市' },
              ],
              provinces: meta?.provinces ?? [],
              notes: meta?.notes ?? {},
              industries: taxonomy ? buildIndustryTree(taxonomy) : [],
            })
            return
          }

          if (path === '/snapshot') {
            const payload = store.snapshotPayload()
            if (!payload) {
              json(res, 503, {
                ok: false,
                error: '全市场快照尚未就绪',
                status: store.status(),
              })
              return
            }
            jsonGzip(req, res, 200, payload)
            return
          }

          if (path === '/refresh' && req.method === 'POST') {
            const force = url.searchParams.get('force') === '1'
            // 后台抓取，立即返回，避免 HTTP 请求挂住数分钟；进度由 /status 轮询。
            void store.refresh({ reason: 'manual', force })
            json(res, 200, { ok: true, started: Boolean(store.refreshing), status: store.status() })
            return
          }

          if (path === '/summary') {
            json(res, 200, {
              ok: true,
              status: store.status(),
              summary: store.summary ?? (store.snapshot ? computeSummary(store.snapshot.stocks) : null),
            })
            return
          }

          json(res, 404, { ok: false, error: `未知接口：${path}` })
        } catch (error) {
          if (res.headersSent) {
            res.end()
            return
          }
          json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      },
    }), 'dsh-dividend-yield: 股息率数据接口')

    runtime = {
      store,
      getSnapshot: () => store.snapshot,
      refresh: (force = true) => store.refresh({ reason: 'runtime', force }),
    }
  },
}

/** 最近一次 apply 暴露的运行时句柄（仅供测试/脚本使用）。 */
export function getRuntime() {
  return runtime
}

export { computeSummary, UniverseStore, buildIndustryTree }
