// 集思录股息率数据引擎。
//
// 数据来源：https://www.jisilu.cn/data/stock/dividend_rate/
// 接口：POST https://www.jisilu.cn/data/stock/dividend_rate_list/（form-urlencoded）
// 非会员限制：单次最多返回 100 行，因此按申万一级/二级/三级行业与沪深市场逐块抓取，
// 再按股票代码去重合并成全市场快照。
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = join(HERE, '..', 'data')
export const ENDPOINT = 'https://www.jisilu.cn/data/stock/dividend_rate_list/'
export const PAGE_URL = 'https://www.jisilu.cn/data/stock/dividend_rate/'
export const NON_MEMBER_LIMIT = 100

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const HEADERS = {
  'user-agent': UA,
  'referer': PAGE_URL,
  'x-requested-with': 'XMLHttpRequest',
  'origin': 'https://www.jisilu.cn',
  'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'accept': 'application/json, text/javascript, */*; q=0.01',
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function readJson(name) {
  return JSON.parse(await readFile(join(DATA_DIR, name), 'utf8'))
}

export async function loadTaxonomy() {
  return readJson('taxonomy.json')
}

export async function loadMeta() {
  return readJson('meta.json')
}

function parseCount(info) {
  const m = /(\d+)\s*个股票/.exec(String(info ?? ''))
  return m ? Number(m[1]) : null
}

// 请求一页数据。参数只包含集思录表单里的筛选字段（industry/market/province/...）。
export async function fetchDividendPage(params = {}, opts = {}) {
  const { retries = 8, timeout = 25000, backoff = 1200, log = () => {} } = opts
  const body = new URLSearchParams()
  body.set('rp', String(NON_MEMBER_LIMIT))
  body.set('page', '1')
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    body.set(key, String(value))
  }
  let lastError = null
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(`${ENDPOINT}?___jsl=LST___t=${Date.now()}`, {
        method: 'POST',
        headers: HEADERS,
        body: body.toString(),
        signal: AbortSignal.timeout(timeout),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const text = await response.text()
      const json = JSON.parse(text)
      return {
        ...json,
        count: parseCount(json.count_Info),
        rows: Array.isArray(json.rows) ? json.rows : [],
      }
    } catch (error) {
      lastError = error
      if (attempt < retries - 1) {
        const wait = backoff + Math.round(Math.random() * 500)
        log(`retry ${attempt + 1}/${retries} (${JSON.stringify(params)}) ${error.name}: ${error.message}`)
        await sleep(wait)
      }
    }
  }
  throw new Error(`集思录请求失败 ${JSON.stringify(params)}: ${lastError?.message ?? lastError}`)
}

const toNum = (value) => {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (!text || text === '--' || text === '-' || text === 'None' || text === 'null') return null
  const number = Number(text.replace(/,/g, ''))
  return Number.isFinite(number) ? number : null
}

const toStr = (value) => (value === null || value === undefined ? '' : String(value).trim())

// 把接口 cell 归一化成面板使用的股票对象。
export function normalizeCell(cell = {}) {
  const code = toStr(cell.stock_id)
  const path = toStr(cell.industry_nm2) || toStr(cell.industry_nm)
  const parts = path.split('-').map((item) => item.trim()).filter(Boolean)
  const swCode = toStr(cell.sw_cd)
  return {
    code,
    name: toStr(cell.stock_nm),
    market: code.startsWith('6') ? 'sh' : 'sz',
    // 行业：中文路径 + 申万代码前缀（2/4/6 位分别对应一/二/三级）
    industryPath: path,
    industryL1: parts[0] ?? '',
    industryL2: parts[1] ?? '',
    industryL3: parts[2] ?? '',
    swCode,
    swL1: swCode.slice(0, 2),
    swL2: swCode.slice(0, 4),
    swL3: swCode.slice(0, 6),
    province: toStr(cell.province),
    price: toNum(cell.price),
    changePct: toNum(cell.increase_rt),
    divYield: toNum(cell.dividend_rate),
    divYieldStatic: toNum(cell.dividend_rate2),
    divYield5y: toNum(cell.dividend_rate5) ?? toNum(cell.aft_dividend),
    divYieldBase: toNum(cell.dividend_rate_base),
    divYieldAvg: toNum(cell.dividend_rate_average),
    pe: toNum(cell.pe),
    pb: toNum(cell.pb),
    peTemp: toNum(cell.pe_temperature),
    pbTemp: toNum(cell.pb_temperature),
    roe: toNum(cell.roe),
    roe5y: toNum(cell.roe_average),
    marketCap: toNum(cell.total_value),
    floatCap: toNum(cell.float_value),
    shares: toNum(cell.shares),
    volume: toNum(cell.volume),
    epsGrowthTtm: toNum(cell.eps_growth_ttm),
    epsGrowth: toNum(cell.eps_growth),
    revenueCagr: toNum(cell.revenue_average),
    profitCagr: toNum(cell.profit_average),
    cashflowAvg: toNum(cell.cashflow_average),
    debtRate: toNum(cell.debt_rate),
    intDebtRate: toNum(cell.int_debt_rate),
    pledgeRt: toNum(cell.pledge_rt),
    price5y: toNum(cell.price_5year),
    accuDividend: toNum(cell.accu_dividend),
    adjRt: toNum(cell.adj_rt),
    ipoDate: toStr(cell.ipo_date),
    lastDt: toStr(cell.last_dt),
    lastTime: toStr(cell.last_time),
    pbFlag: toStr(cell.pb_flag),
    marginFlag: toStr(cell.margin_flg),
    activeFlag: toStr(cell.active_flg),
    stdevry: toStr(cell.stdevry),
    auditInfo: toStr(cell.audit_info),
    owned: toNum(cell.owned),
    holded: toNum(cell.holded),
  }
}

function buildChildrenMap(taxonomy) {
  const children = new Map()
  for (const node of taxonomy) {
    if (node.level !== 3 || !node.value) continue
    const parent = node.value.slice(0, 4)
    if (!children.has(parent)) children.set(parent, [])
    children.get(parent).push(node)
  }
  return children
}

// 全市场抓取：按二级行业分区，超过 100 行的分区继续下钻到三级行业 / 沪深市场。
export async function crawlUniverse(options = {}) {
  const {
    concurrency = 2,
    onProgress = () => {},
    signal,
    log = () => {},
    maxQueries = 400,
  } = options
  const taxonomy = await loadTaxonomy()
  const level2 = taxonomy.filter((node) => node.level === 2 && node.value)
  const childrenOf = buildChildrenMap(taxonomy)
  const startedAt = new Date()
  const stocks = new Map()
  const failed = []
  let queue = level2.map((node) => ({ params: { industry: node.value }, label: `行业 ${node.value}` }))
  let done = 0
  let queries = 0
  let lastError = null
  let overflow = 0

  const emit = () => {
    onProgress({
      phase: 'crawling',
      done,
      total: done + queue.length,
      queries,
      rows: stocks.size,
      failed: failed.length,
      overflow,
      startedAt: startedAt.toISOString(),
      elapsedMs: Date.now() - startedAt.getTime(),
      lastError,
    })
  }
  emit()

  async function worker() {
    while (true) {
      if (signal?.aborted) throw new Error('crawl aborted')
      const item = queue.shift()
      if (!item) {
        // 队列可能被其他 worker 动态追加，稍等一下再判断是否真的结束
        await sleep(30)
        if (!queue.length) return
        continue
      }
      if (queries >= maxQueries) {
        failed.push({ label: item.label, reason: `超过查询上限 ${maxQueries}` })
        done++
        continue
      }
      try {
        const page = await fetchDividendPage(item.params, { log })
        queries++
        for (const row of page.rows) {
          const stock = normalizeCell(row?.cell ?? {})
          if (stock.code) stocks.set(stock.code, stock)
        }
        const count = page.count ?? page.rows.length
        if (count > NON_MEMBER_LIMIT) {
          const hasMarket = Boolean(item.params.market)
          const children = childrenOf.get(item.params.industry) ?? []
          if (hasMarket) {
            overflow++
            failed.push({
              label: `${item.label} / ${item.params.market}`,
              reason: `单块 ${count} 只仍超过非会员 100 行上限`,
            })
          } else if (children.length) {
            for (const child of children) {
              queue.push({ params: { industry: child.value }, label: `行业 ${child.value}` })
            }
          } else {
            queue.push({ params: { industry: item.params.industry, market: 'sh' }, label: `${item.label} 沪` })
            queue.push({ params: { industry: item.params.industry, market: 'sz' }, label: `${item.label} 深` })
          }
        }
      } catch (error) {
        lastError = error.message
        failed.push({ label: item.label, reason: error.message })
      }
      done++
      emit()
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()))

  let expectedTotal = null
  try {
    const top = await fetchDividendPage({}, { log: () => {} })
    expectedTotal = top.count
  } catch {
    /* 忽略：仅用于展示覆盖率 */
  }

  const list = [...stocks.values()]
  const valid = list.filter((item) => item.divYield !== null || item.divYield5y !== null)
  const dataDate = list.reduce((latest, item) => (item.lastDt > latest ? item.lastDt : latest), '')
  return {
    version: 1,
    source: PAGE_URL,
    generatedAt: new Date().toISOString(),
    dataDate,
    count: list.length,
    validCount: valid.length,
    expectedTotal,
    complete: failed.length === 0,
    failed,
    stats: { queries, elapsedMs: Date.now() - startedAt.getTime(), overflow },
    stocks: list,
  }
}
