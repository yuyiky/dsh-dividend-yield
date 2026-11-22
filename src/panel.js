// dsh-dividend-yield 面板：纯 DOM 实现，经 ModuleLoader 注入到 DSH Web GUI 的 main 插槽。
//
// 数据流：宿主半片 /meta（行业/地区选项）→ /status（快照进度）→ /snapshot（全市场数据）。
// 筛选、排序、分页、自选、详情抽屉全部在浏览器本地完成，不额外打接口。

const API = '/api/dividend-yield'
const STYLE_ID = 'dsh-dividend-yield-style'
const WATCH_KEY = 'dsh-dividend-yield:watchlist:v1'

const COLUMNS = [
  { key: 'name', label: '名称 / 代码', width: 132, align: 'left', sticky: true },
  { key: 'industryL2', label: '行业', width: 112, align: 'left' },
  { key: 'province', label: '地区', width: 60, align: 'left' },
  { key: 'price', label: '现价', width: 68, align: 'right', format: 'price' },
  { key: 'changePct', label: '涨跌幅', width: 70, align: 'right', format: 'change' },
  { key: 'divYield', label: '股息率TTM', width: 86, align: 'right', format: 'yield', strong: true },
  { key: 'divYieldStatic', label: '静态股息率', width: 82, align: 'right', format: 'yield' },
  { key: 'divYield5y', label: '5年平均', width: 78, align: 'right', format: 'yield' },
  { key: 'divYieldAvg', label: '分红率5年复合', width: 102, align: 'right', format: 'pct' },
  { key: 'marketCap', label: '总市值(亿)', width: 82, align: 'right', format: 'cap' },
  { key: 'pe', label: 'PE TTM', width: 70, align: 'right', format: 'num2' },
  { key: 'peTemp', label: 'PE温度', width: 70, align: 'right', format: 'temp' },
  { key: 'pb', label: 'PB', width: 60, align: 'right', format: 'num2' },
  { key: 'pbTemp', label: 'PB温度', width: 70, align: 'right', format: 'temp' },
  { key: 'roe', label: 'ROE', width: 62, align: 'right', format: 'pct' },
  { key: 'roe5y', label: '5年ROE', width: 68, align: 'right', format: 'pct' },
  { key: 'epsGrowthTtm', label: '净利同比', width: 74, align: 'right', format: 'change' },
  { key: 'revenueCagr', label: '营收5年复合', width: 92, align: 'right', format: 'pct' },
  { key: 'profitCagr', label: '利润5年复合', width: 92, align: 'right', format: 'pct' },
  { key: 'debtRate', label: '资产负债率', width: 84, align: 'right', format: 'pct' },
  { key: 'intDebtRate', label: '有息负债率', width: 84, align: 'right', format: 'pct' },
]

const PRESETS = [
  { key: 'all', label: '全部' },
  { key: 'y5', label: '股息率 ≥ 5%', patch: { minYield: 5 } },
  { key: 'y4', label: '股息率 ≥ 4%', patch: { minYield: 4 } },
  { key: 'y3', label: '股息率 ≥ 3%', patch: { minYield: 3 } },
  { key: 'f5', label: '5年均值 ≥ 5%', patch: { min5y: 5 } },
  { key: 'watch', label: '自选', patch: { onlyWatch: true } },
]

const EMPTY_FILTERS = {
  keyword: '',
  market: '',
  industryL1: '',
  industryL2: '',
  province: '',
  minYield: '',
  min5y: '',
  onlyWatch: false,
  requireDividend: true,
}

const CSS = `
.dyd-root {
  --dyd-bg: var(--dsw-alias-bg-base, #ffffff);
  --dyd-surface: var(--dsw-alias-bg-layer-1, #f7f8fa);
  --dyd-surface-2: var(--dsw-alias-bg-layer-2, #eef1f5);
  --dyd-border: var(--dsw-alias-border-l1, rgba(15, 23, 42, .1));
  --dyd-border-soft: var(--dsw-alias-border-l2, rgba(15, 23, 42, .06));
  --dyd-text: var(--dsw-alias-label-primary, #1b2230);
  --dyd-text-2: var(--dsw-alias-label-secondary, #5b6678);
  --dyd-text-3: var(--dsw-alias-label-tertiary, #8b96a8);
  --dyd-accent: var(--dsw-alias-state-business-primary, #3568f5);
  --dyd-up: var(--dsw-alias-state-error-primary, #e0453a);
  --dyd-down: var(--dsw-alias-state-success-primary, #1f9d63);
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  color: var(--dyd-text);
  background: var(--dyd-bg);
  font-size: 13px;
  line-height: 1.45;
  overflow: hidden;
}
body[data-ds-dark-theme] .dyd-root {
  --dyd-bg: var(--dsw-alias-bg-base, #171a20);
  --dyd-surface: var(--dsw-alias-bg-layer-1, #1f232b);
  --dyd-surface-2: var(--dsw-alias-bg-layer-2, #262b34);
  --dyd-border: rgba(255, 255, 255, .13);
  --dyd-border-soft: rgba(255, 255, 255, .07);
  --dyd-text: #e8ebf1;
  --dyd-text-2: #a6afc0;
  --dyd-text-3: #7b8598;
}
.dyd-scroll { overflow: auto; }
.dyd-header {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
  padding: 16px 20px 10px; flex-wrap: wrap;
}
.dyd-title { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.dyd-title h2 { margin: 0; font-size: 18px; font-weight: 650; letter-spacing: .2px; }
.dyd-sub { color: var(--dyd-text-3); font-size: 12px; }
.dyd-header-right { display: flex; align-items: center; gap: 10px; }
.dyd-pill {
  display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px;
  border-radius: 999px; background: var(--dyd-surface); color: var(--dyd-text-2);
  border: 1px solid var(--dyd-border-soft); font-size: 12px; white-space: nowrap;
}
.dyd-pill .dyd-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dyd-accent); }
.dyd-pill.dyd-live .dyd-dot { background: var(--dyd-down); }
.dyd-pill.dyd-busy .dyd-dot { background: #f0a020; animation: dyd-pulse 1.1s infinite; }
@keyframes dyd-pulse { 0%, 100% { opacity: 1 } 50% { opacity: .35 } }
.dyd-btn {
  height: 28px; padding: 0 12px; border-radius: 7px; border: 1px solid var(--dyd-border);
  background: var(--dyd-surface); color: var(--dyd-text); font-size: 12px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;
}
.dyd-btn:hover { background: var(--dyd-surface-2); }
.dyd-btn:disabled { opacity: .55; cursor: default; }
.dyd-btn.dyd-primary { background: var(--dyd-accent); border-color: transparent; color: #fff; }
.dyd-progress { display: flex; align-items: center; gap: 10px; padding: 0 20px 8px; }
.dyd-progress-bar { flex: 1; height: 5px; border-radius: 999px; background: var(--dyd-surface-2); overflow: hidden; }
.dyd-progress-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #4f8cff, #2fb5a3); transition: width .3s ease; }
.dyd-progress-text { font-size: 12px; color: var(--dyd-text-3); white-space: nowrap; font-variant-numeric: tabular-nums; }
.dyd-cards { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; padding: 4px 20px 12px; }
@media (max-width: 1100px) { .dyd-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.dyd-card {
  background: var(--dyd-surface); border: 1px solid var(--dyd-border-soft); border-radius: 10px;
  padding: 10px 12px; min-width: 0;
}
.dyd-card-label { color: var(--dyd-text-3); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dyd-card-value { font-size: 20px; font-weight: 650; margin-top: 2px; font-variant-numeric: tabular-nums; letter-spacing: .2px; }
.dyd-card-value small { font-size: 12px; font-weight: 500; color: var(--dyd-text-3); margin-left: 3px; }
.dyd-card-sub { color: var(--dyd-text-3); font-size: 11px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dyd-card.dyd-dist {
  grid-column: span 2; display: flex; flex-direction: column; justify-content: space-between;
}
@media (max-width: 1100px) { .dyd-card.dyd-dist { grid-column: span 3; } }
.dyd-buckets { display: flex; align-items: flex-end; gap: 5px; height: 46px; margin-top: 6px; }
.dyd-bucket { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0; }
.dyd-bucket-bar { width: 100%; border-radius: 3px 3px 0 0; background: linear-gradient(180deg, #7aa5ff, #3f6fe0); min-height: 2px; }
.dyd-bucket.dyd-b-hot .dyd-bucket-bar { background: linear-gradient(180deg, #ffb454, #ef7d2a); }
.dyd-bucket-label { font-size: 10px; color: var(--dyd-text-3); white-space: nowrap; }
.dyd-filters { padding: 0 20px 10px; display: flex; flex-direction: column; gap: 8px; }
.dyd-chips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.dyd-chip {
  height: 26px; padding: 0 11px; border-radius: 999px; border: 1px solid var(--dyd-border);
  background: transparent; color: var(--dyd-text-2); font-size: 12px; cursor: pointer;
}
.dyd-chip:hover { border-color: var(--dyd-accent); color: var(--dyd-accent); }
.dyd-chip.dyd-active { background: var(--dyd-accent); border-color: transparent; color: #fff; }
.dyd-chip.dyd-ghost { border-style: dashed; }
.dyd-filter-row { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.dyd-field { display: inline-flex; align-items: center; gap: 5px; color: var(--dyd-text-3); font-size: 12px; white-space: nowrap; }
.dyd-field input[type="text"], .dyd-field input[type="number"], .dyd-field select {
  height: 28px; border-radius: 7px; border: 1px solid var(--dyd-border); background: var(--dyd-bg);
  color: var(--dyd-text); padding: 0 7px; font-size: 12px; outline: none;
}
.dyd-field input[type="text"] { width: 132px; }
.dyd-field input[type="number"] { width: 64px; }
.dyd-field select { max-width: 150px; }
.dyd-field input:focus, .dyd-field select:focus { border-color: var(--dyd-accent); }
.dyd-check { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--dyd-text-2); cursor: pointer; user-select: none; }
.dyd-check input { accent-color: var(--dyd-accent); }
.dyd-table-wrap {
  flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 0 20px;
}
.dyd-table-scroll { flex: 1; min-height: 0; overflow: auto; border: 1px solid var(--dyd-border-soft); border-radius: 10px; background: var(--dyd-bg); }
table.dyd-table { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; font-size: 12px; }
.dyd-table thead th {
  position: sticky; top: 0; z-index: 2; background: var(--dyd-surface); color: var(--dyd-text-2);
  font-weight: 550; text-align: right; padding: 8px 9px; border-bottom: 1px solid var(--dyd-border);
  white-space: nowrap; cursor: pointer; user-select: none;
}
.dyd-table thead th.dyd-left { text-align: left; }
.dyd-table thead th:hover { color: var(--dyd-text); }
.dyd-table thead th .dyd-sort { opacity: .45; margin-left: 2px; font-size: 10px; }
.dyd-table thead th.dyd-sorted { color: var(--dyd-accent); }
.dyd-table thead th.dyd-sorted .dyd-sort { opacity: 1; }
.dyd-table tbody td {
  padding: 6px 9px; border-bottom: 1px solid var(--dyd-border-soft); text-align: right;
  white-space: nowrap; font-variant-numeric: tabular-nums;
}
.dyd-table tbody td.dyd-left { text-align: left; }
.dyd-table tbody tr { cursor: pointer; }
.dyd-table tbody tr:hover td { background: var(--dyd-surface); }
.dyd-table tbody tr.dyd-hot td { background: rgba(240, 160, 32, .06); }
.dyd-table tbody tr.dyd-hot:hover td { background: rgba(240, 160, 32, .12); }
.dyd-table tbody tr.dyd-focused td { background: rgba(53, 104, 245, .1); }
.dyd-name { font-weight: 550; }
.dyd-code { color: var(--dyd-text-3); font-size: 11px; font-variant-numeric: tabular-nums; }
.dyd-star {
  border: none; background: none; cursor: pointer; padding: 0 2px 0 0; width: 20px;
  color: var(--dyd-text-3); font-size: 15px; line-height: 1; vertical-align: middle;
}
.dyd-star.dyd-on { color: #f0a020; }
.dyd-star:hover { color: #f0a020; }
.dyd-y {
  display: inline-block; min-width: 52px; padding: 1px 5px; border-radius: 5px; text-align: right;
  font-weight: 550;
}
.dyd-y.dyd-y-hot { background: rgba(228, 90, 45, .16); color: #d84f1f; }
.dyd-y.dyd-y-warm { background: rgba(240, 160, 32, .16); color: #c47a0a; }
.dyd-y.dyd-y-mid { background: rgba(47, 158, 110, .14); color: #1f8a5f; }
.dyd-y.dyd-y-cool { background: rgba(53, 104, 245, .1); color: #3568f5; }
body[data-ds-dark-theme] .dyd-y.dyd-y-hot { color: #ff9b74; }
body[data-ds-dark-theme] .dyd-y.dyd-y-warm { color: #f5c26b; }
body[data-ds-dark-theme] .dyd-y.dyd-y-mid { color: #6fd3a5; }
body[data-ds-dark-theme] .dyd-y.dyd-y-cool { color: #8fb4ff; }
.dyd-up { color: var(--dyd-up); }
.dyd-down { color: var(--dyd-down); }
.dyd-muted { color: var(--dyd-text-3); }
.dyd-pager { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 2px; color: var(--dyd-text-3); font-size: 12px; }
.dyd-pager-left, .dyd-pager-right { display: flex; align-items: center; gap: 8px; }
.dyd-pager select { height: 26px; border-radius: 6px; border: 1px solid var(--dyd-border); background: var(--dyd-bg); color: var(--dyd-text); font-size: 12px; }
.dyd-empty { padding: 48px 20px; text-align: center; color: var(--dyd-text-3); }
.dyd-footer { padding: 8px 20px 12px; color: var(--dyd-text-3); font-size: 11px; line-height: 1.6; }
.dyd-footer a { color: var(--dyd-accent); text-decoration: none; }
.dyd-drawer-mask { position: fixed; inset: 0; z-index: 24; background: rgba(0, 0, 0, .28); display: flex; justify-content: flex-end; }
.dyd-drawer {
  width: min(460px, 94vw); height: 100%; background: var(--dyd-bg); color: var(--dyd-text);
  border-left: 1px solid var(--dyd-border); box-shadow: -12px 0 32px rgba(0, 0, 0, .18);
  display: flex; flex-direction: column; animation: dyd-slide .18s ease;
}
@keyframes dyd-slide { from { transform: translateX(24px); opacity: .6 } to { transform: none; opacity: 1 } }
.dyd-drawer-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 16px 18px 12px; border-bottom: 1px solid var(--dyd-border-soft); }
.dyd-drawer-title { font-size: 17px; font-weight: 650; }
.dyd-drawer-sub { color: var(--dyd-text-3); font-size: 12px; margin-top: 3px; }
.dyd-close { border: none; background: none; color: var(--dyd-text-3); font-size: 18px; cursor: pointer; line-height: 1; padding: 2px 4px; }
.dyd-close:hover { color: var(--dyd-text); }
.dyd-drawer-body { flex: 1; overflow: auto; padding: 14px 18px 24px; }
.dyd-section { margin-bottom: 14px; }
.dyd-section h4 { margin: 0 0 6px; font-size: 12px; color: var(--dyd-text-3); font-weight: 600; letter-spacing: .3px; }
.dyd-kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 14px; }
.dyd-kv-item { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 5px 8px; border-radius: 6px; background: var(--dyd-surface); }
.dyd-kv-key { color: var(--dyd-text-3); font-size: 12px; white-space: nowrap; }
.dyd-kv-val { font-weight: 550; font-variant-numeric: tabular-nums; text-align: right; }
.dyd-skeleton { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--dyd-text-3); padding: 40px; }
.dyd-spinner { width: 26px; height: 26px; border-radius: 50%; border: 3px solid var(--dyd-surface-2); border-top-color: var(--dyd-accent); animation: dyd-spin .9s linear infinite; }
@keyframes dyd-spin { to { transform: rotate(360deg) } }
.dyd-retry { margin-top: 4px; }
`

function injectStyle() {
  const previous = document.getElementById(STYLE_ID)
  if (previous) previous.remove()
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  return style
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]))
}

const num = (value) => (value === null || value === undefined || value === '' ? null : Number(value))
const isNum = (value) => typeof value === 'number' && Number.isFinite(value)

function fmt(value, digits = 2) {
  if (!isNum(value)) return '—'
  return value.toFixed(digits)
}

function fmtCap(value) {
  if (!isNum(value)) return '—'
  if (value >= 10000) return `${(value / 10000).toFixed(2)}万`
  if (value >= 1000) return value.toFixed(0)
  if (value >= 100) return value.toFixed(1)
  return value.toFixed(1)
}

function fmtYield(value) {
  if (!isNum(value)) return '—'
  return `${value.toFixed(2)}%`
}

function yieldClass(value) {
  if (!isNum(value)) return ''
  if (value >= 6) return 'dyd-y dyd-y-hot'
  if (value >= 5) return 'dyd-y dyd-y-warm'
  if (value >= 4) return 'dyd-y dyd-y-mid'
  if (value >= 3) return 'dyd-y dyd-y-cool'
  return 'dyd-y'
}

function fmtCell(stock, column) {
  const value = stock[column.key]
  if (column.key === 'name') {
    return `<div class="dyd-name">${escapeHtml(stock.name || '—')}</div><div class="dyd-code">${escapeHtml(stock.code)}</div>`
  }
  if (column.key === 'industryL2') return escapeHtml(stock.industryL2 || stock.industryL1 || '—')
  if (column.key === 'province') return escapeHtml(stock.province || '—')
  if (column.format === 'price') return isNum(value) ? value.toFixed(2) : '—'
  if (column.format === 'yield') {
    return `<span class="${yieldClass(value)}">${fmtYield(value)}</span>`
  }
  if (column.format === 'change') {
    if (!isNum(value)) return '—'
    const cls = value > 0 ? 'dyd-up' : value < 0 ? 'dyd-down' : 'dyd-muted'
    return `<span class="${cls}">${value > 0 ? '+' : ''}${value.toFixed(2)}%</span>`
  }
  if (column.format === 'cap') return fmtCap(value)
  if (column.format === 'temp') return isNum(value) ? value.toFixed(1) : '—'
  if (column.format === 'pct') return isNum(value) ? `${value.toFixed(2)}%` : '—'
  return isNum(value) ? value.toFixed(2) : '—'
}

function loadWatchlist() {
  try {
    const raw = localStorage.getItem(WATCH_KEY)
    const list = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [])
  } catch {
    return new Set()
  }
}

function saveWatchlist(watch) {
  try {
    localStorage.setItem(WATCH_KEY, JSON.stringify([...watch]))
  } catch {
    /* localStorage 不可用时仅当前会话有效 */
  }
}

function readInitialFilters() {
  return { ...EMPTY_FILTERS }
}

export function mountPanel(host) {
  if (!host) return { destroy() {} }

  const state = {
    meta: null,
    status: null,
    snapshot: null,
    byCode: new Map(),
    watch: loadWatchlist(),
    loading: true,
    error: null,
    filters: readInitialFilters(),
    sortKey: 'divYield',
    sortDir: 'desc',
    page: 1,
    pageSize: 50,
    drawerCode: null,
    notice: '',
  }
  let destroyed = false
  let pollTimer = null
  let root = null
  let styleEl = null

  injectStyle()
  root = document.createElement('div')
  root.className = 'dyd-root'
  host.appendChild(root)

  function onKeyDown(event) {
    if (event.key === 'Escape' && state.drawerCode) {
      state.drawerCode = null
      renderChrome()
    }
  }
  document.addEventListener('keydown', onKeyDown)

  // ---------- 数据加载 ----------

  async function fetchJson(path, options) {
    const response = await fetch(API + path, {
      headers: { accept: 'application/json' },
      ...options,
    })
    if (!response.ok) {
      let message = `HTTP ${response.status}`
      try {
        const body = await response.json()
        if (body?.error) message = body.error
      } catch {
        /* ignore */
      }
      throw new Error(message)
    }
    return response.json()
  }

  async function loadMeta() {
    try {
      state.meta = await fetchJson('/meta')
    } catch (error) {
      state.meta = null
      state.error = error instanceof Error ? error.message : String(error)
    }
  }

  async function loadSnapshot(forceRender = true) {
    try {
      const payload = await fetchJson('/snapshot')
      if (destroyed) return
      state.snapshot = payload
      state.byCode = new Map((payload.stocks || []).map((stock) => [stock.code, stock]))
      state.loading = false
      state.error = null
      if (forceRender) renderChrome()
      else renderTable()
      updateStatusUI()
    } catch (error) {
      state.loading = false
      state.error = error instanceof Error ? error.message : String(error)
      renderChrome()
    }
  }

  function setNotice(text) {
    state.notice = text
    const el = root.querySelector('[data-role="notice"]')
    if (el) el.textContent = text
  }

  function applyStatus(status) {
    if (destroyed || !status) return
    state.status = status
    updateStatusUI()
    const transient = state.notice.startsWith('正在') || state.notice.startsWith('已触发')
    if (status.phase === 'ready' && !status.refreshing && transient) {
      setNotice('')
    } else if (status.refreshing && status.progress) {
      const progress = status.progress
      setNotice(`正在抓取：${progress.done}/${progress.total} 块 · ${progress.rows} 只 · 失败 ${progress.failed}`)
    }
    if (status.phase === 'ready' && status.count > 0) {
      const generatedAt = status.generatedAt
      const current = state.snapshot?.generatedAt
      if (!state.snapshot || (generatedAt && generatedAt !== current)) {
        void loadSnapshot()
      }
    } else if (!state.snapshot) {
      state.loading = true
      schedulePoll(1500)
    }
    updatePollCadence()
  }

  async function pollStatus() {
    try {
      const status = await fetchJson('/status')
      applyStatus(status)
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error)
      updateStatusUI()
    }
  }

  function schedulePoll(delay) {
    if (destroyed) return
    clearTimeout(pollTimer)
    pollTimer = setTimeout(async () => {
      await pollStatus()
      if (destroyed) return
      updatePollCadence()
    }, delay)
  }

  function updatePollCadence() {
    const busy = !state.snapshot || state.status?.refreshing || state.status?.phase === 'crawling'
    schedulePoll(busy ? 1800 : 45000)
  }

  // ---------- 过滤 / 排序 ----------

  function filteredStocks() {
    const { filters } = state
    const keyword = filters.keyword.trim().toLowerCase()
    const minYield = num(filters.minYield)
    const min5y = num(filters.min5y)
    const rows = []
    for (const stock of state.snapshot?.stocks ?? []) {
      if (filters.requireDividend) {
        const ttm = num(stock.divYield)
        const five = num(stock.divYield5y)
        if (!(isNum(ttm) && ttm > 0) && !(isNum(five) && five > 0)) continue
      }
      const ttm = num(stock.divYield)
      if (isNum(minYield) && !(isNum(ttm) && ttm >= minYield)) continue
      const five = num(stock.divYield5y)
      if (isNum(min5y) && !(isNum(five) && five >= min5y)) continue
      if (filters.market && stock.market !== filters.market) continue
      if (filters.industryL1 && stock.industryL1 !== filters.industryL1) continue
      if (filters.industryL2 && stock.industryL2 !== filters.industryL2) continue
      if (filters.province && stock.province !== filters.province) continue
      if (filters.onlyWatch && !state.watch.has(stock.code)) continue
      if (keyword) {
        const haystack = `${stock.code} ${stock.name} ${stock.industryPath}`.toLowerCase()
        if (!haystack.includes(keyword)) continue
      }
      rows.push(stock)
    }
    rows.sort((a, b) => compareStocks(a, b))
    return rows
  }

  function compareStocks(a, b) {
    const key = state.sortKey
    const dir = state.sortDir === 'asc' ? 1 : -1
    const av = a[key]
    const bv = b[key]
    const aNull = av === null || av === undefined || av === ''
    const bNull = bv === null || bv === undefined || bv === ''
    if (aNull && bNull) return String(a.code).localeCompare(String(b.code))
    if (aNull) return 1
    if (bNull) return -1
    let result
    if (typeof av === 'number' && typeof bv === 'number') result = av - bv
    else result = String(av).localeCompare(String(bv), 'zh-Hans-CN')
    if (result === 0) result = String(a.code).localeCompare(String(b.code))
    return result * dir
  }

  function industryOptions(level1) {
    const industries = state.meta?.industries ?? []
    if (!level1) return []
    const match = industries.find((item) => item.name === level1)
    return match?.children ?? []
  }

  // ---------- 渲染 ----------

  function statusPill() {
    const status = state.status
    if (state.error && !state.snapshot) {
      return `<span class="dyd-pill dyd-busy"><span class="dyd-dot"></span>数据异常</span>`
    }
    if (!state.snapshot) {
      if (status?.phase === 'crawling') {
        const progress = status.progress
        const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0
        return `<span class="dyd-pill dyd-busy"><span class="dyd-dot"></span>首次构建 ${pct}%</span>`
      }
      return `<span class="dyd-pill dyd-busy"><span class="dyd-dot"></span>等待数据</span>`
    }
    if (status?.refreshing || status?.phase === 'crawling') {
      return `<span class="dyd-pill dyd-busy"><span class="dyd-dot"></span>刷新中</span>`
    }
    return `<span class="dyd-pill dyd-live"><span class="dyd-dot"></span>快照就绪</span>`
  }

  function headerHTML() {
    const snapshot = state.snapshot
    const status = state.status
    const subtitleBits = []
    if (snapshot) {
      subtitleBits.push(`数据日期 ${escapeHtml(snapshot.dataDate || '—')}`)
      subtitleBits.push(`${snapshot.count.toLocaleString()} 只股票`)
      subtitleBits.push(`有股息 ${snapshot.summary?.sampleCount?.toLocaleString?.() ?? '—'} 只`)
    } else if (status?.progress) {
      subtitleBits.push(`抓取中 ${status.progress.done}/${status.progress.total}`)
    } else {
      subtitleBits.push('正在连接集思录数据…')
    }
    const updated = snapshot?.generatedAt ? new Date(snapshot.generatedAt).toLocaleString('zh-CN', { hour12: false }) : '—'
    return `
      <div class="dyd-header">
        <div class="dyd-title">
          <h2>股息率监控</h2>
          <span class="dyd-sub">${subtitleBits.join(' · ')}</span>
        </div>
        <div class="dyd-header-right">
          <span class="dyd-sub">更新 ${escapeHtml(updated)}</span>
          ${statusPill()}
          <button class="dyd-btn dyd-primary" data-action="refresh" ${status?.refreshing ? 'disabled' : ''}>↻ 刷新数据</button>
        </div>
      </div>
      ${progressHTML()}
    `
  }

  function progressHTML() {
    const progress = state.status?.progress
    if (!progress || state.status?.phase !== 'crawling') return ''
    const pct = progress.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0
    return `
      <div class="dyd-progress" data-role="progress">
        <div class="dyd-progress-bar"><div class="dyd-progress-fill" style="width:${pct}%"></div></div>
        <span class="dyd-progress-text" data-role="progress-text">已抓取 ${progress.done}/${progress.total} 块 · ${progress.rows} 只 · 失败 ${progress.failed}</span>
      </div>
    `
  }

  function summaryHTML() {
    const summary = state.snapshot?.summary
    if (!summary) return ''
    const cards = [
      { label: '有股息股票', value: summary.sampleCount.toLocaleString(), sub: `全市场 ${summary.count.toLocaleString()} 只` },
      { label: '平均股息率 TTM', value: summary.avg === null ? '—' : summary.avg.toFixed(2), sub: '单位：%', unit: '%' },
      { label: '中位股息率 TTM', value: summary.median === null ? '—' : summary.median.toFixed(2), sub: '单位：%', unit: '%' },
      { label: '股息率 ≥ 5%', value: summary.ge5.toLocaleString(), sub: `≥4% ${summary.ge4} 只 · ≥3% ${summary.ge3} 只` },
      { label: '最高行业均值', value: summary.topIndustries?.[0]?.name ?? '—', sub: summary.topIndustries?.[0] ? `均值 ${summary.topIndustries[0].avg.toFixed(2)}% · ${summary.topIndustries[0].count} 只` : '', small: true },
    ]
    const maxBucket = Math.max(1, ...(summary.buckets ?? []).map((bucket) => bucket.count))
    const bucketBars = (summary.buckets ?? [])
      .map(
        (bucket) => `
        <div class="dyd-bucket ${bucket.key === 'gte6' ? 'dyd-b-hot' : ''}" title="${bucket.label}：${bucket.count} 只">
          <div class="dyd-bucket-bar" style="height:${Math.max(2, Math.round((bucket.count / maxBucket) * 30))}px"></div>
          <div class="dyd-bucket-label">${bucket.label}</div>
        </div>`,
      )
      .join('')
    const distCard = `
      <div class="dyd-card dyd-dist">
        <div class="dyd-card-label">股息率 TTM 分布（只）</div>
        <div class="dyd-buckets">${bucketBars}</div>
      </div>
    `
    const cardsHTML = cards
      .map(
        (card) => `
        <div class="dyd-card">
          <div class="dyd-card-label">${card.label}</div>
          <div class="dyd-card-value" style="${card.small ? 'font-size:15px' : ''}">${escapeHtml(card.value)}${card.unit ?? ''}</div>
          <div class="dyd-card-sub">${escapeHtml(card.sub)}</div>
        </div>`,
      )
      .join('')
    return `<div class="dyd-cards">${cardsHTML}${distCard}</div>`
  }

  function filtersHTML() {
    const meta = state.meta
    const filters = state.filters
    const markets = meta?.markets ?? []
    const provinces = meta?.provinces ?? []
    const l1Options = (meta?.industries ?? [])
      .map((item) => `<option value="${escapeHtml(item.name)}" ${filters.industryL1 === item.name ? 'selected' : ''}>${escapeHtml(item.name)}</option>`)
      .join('')
    const l2Options = industryOptions(filters.industryL1)
      .map((item) => `<option value="${escapeHtml(item.name)}" ${filters.industryL2 === item.name ? 'selected' : ''}>${escapeHtml(item.name)}</option>`)
      .join('')
    const marketOptions = markets
      .map((item) => `<option value="${escapeHtml(item.value)}" ${filters.market === item.value ? 'selected' : ''}>${escapeHtml(item.label)}</option>`)
      .join('')
    const provinceOptions = provinces
      .map((item) => `<option value="${escapeHtml(item.name)}" ${filters.province === item.name ? 'selected' : ''}>${escapeHtml(item.name)}</option>`)
      .join('')

    const chips = PRESETS.map((preset) => {
      let active = false
      if (preset.key === 'all') {
        active = !filters.minYield && !filters.min5y && !filters.onlyWatch
      } else if (preset.key === 'watch') {
        active = filters.onlyWatch
      } else if (preset.patch?.minYield) {
        active = String(filters.minYield) === String(preset.patch.minYield) && !filters.onlyWatch
      } else if (preset.patch?.min5y) {
        active = String(filters.min5y) === String(preset.patch.min5y) && !filters.onlyWatch
      }
      return `<button class="dyd-chip ${active ? 'dyd-active' : ''}" data-preset="${preset.key}">${preset.label}</button>`
    }).join('')

    return `
      <div class="dyd-filters">
        <div class="dyd-chips">
          ${chips}
          <button class="dyd-chip dyd-ghost" data-action="reset">重置筛选</button>
        </div>
        <div class="dyd-filter-row">
          <label class="dyd-field">关键词
            <input type="text" data-filter="keyword" value="${escapeHtml(filters.keyword)}" placeholder="代码 / 名称 / 行业" />
          </label>
          <label class="dyd-field">市场
            <select data-filter="market"><option value="">全部</option>${marketOptions}</select>
          </label>
          <label class="dyd-field">行业
            <select data-filter="industryL1"><option value="">全部</option>${l1Options}</select>
          </label>
          <label class="dyd-field">二级
            <select data-filter="industryL2" ${filters.industryL1 ? '' : 'disabled'}><option value="">全部</option>${l2Options}</select>
          </label>
          <label class="dyd-field">地区
            <select data-filter="province"><option value="">全部</option>${provinceOptions}</select>
          </label>
          <label class="dyd-field">最低TTM(%)
            <input type="number" step="0.5" min="0" max="30" data-filter="minYield" value="${escapeHtml(filters.minYield)}" placeholder="不限" />
          </label>
          <label class="dyd-field">最低5年均值(%)
            <input type="number" step="0.5" min="0" max="30" data-filter="min5y" value="${escapeHtml(filters.min5y)}" placeholder="不限" />
          </label>
          <label class="dyd-check"><input type="checkbox" data-filter="requireDividend" ${filters.requireDividend ? 'checked' : ''} /> 仅看有股息</label>
          <label class="dyd-check"><input type="checkbox" data-filter="onlyWatch" ${filters.onlyWatch ? 'checked' : ''} /> 仅看自选</label>
          <span class="dyd-sub" data-role="notice">${escapeHtml(state.notice || '')}</span>
        </div>
      </div>
    `
  }

  function tableHTML() {
    const rows = filteredStocks()
    const total = rows.length
    const pageCount = Math.max(1, Math.ceil(total / state.pageSize))
    if (state.page > pageCount) state.page = pageCount
    const start = (state.page - 1) * state.pageSize
    const pageRows = rows.slice(start, start + state.pageSize)
    const watchThreshold = state.meta?.thresholds?.watch ?? 5
    const headers = COLUMNS.map((column) => {
      const sorted = state.sortKey === column.key
      const arrow = sorted ? (state.sortDir === 'asc' ? '▲' : '▼') : '↕'
      return `<th class="${column.align === 'left' ? 'dyd-left' : ''} ${sorted ? 'dyd-sorted' : ''}" data-sort="${column.key}" style="min-width:${column.width}px">${column.label}<span class="dyd-sort">${arrow}</span></th>`
    }).join('')
    const body = pageRows.length
      ? pageRows
          .map((stock) => {
            const starred = state.watch.has(stock.code)
            const hot = isNum(stock.divYield) && stock.divYield >= watchThreshold
            const cells = COLUMNS.map(
              (column) => `<td class="${column.align === 'left' ? 'dyd-left' : ''}">${fmtCell(stock, column)}</td>`,
            ).join('')
            return `<tr data-code="${escapeHtml(stock.code)}" class="${hot ? 'dyd-hot' : ''}">
              <td class="dyd-left"><button class="dyd-star ${starred ? 'dyd-on' : ''}" data-star="${escapeHtml(stock.code)}" title="加入/移出自选">${starred ? '★' : '☆'}</button></td>
              ${cells}
            </tr>`
          })
          .join('')
      : `<tr><td colspan="${COLUMNS.length + 1}"><div class="dyd-empty">没有符合筛选条件的股票</div></td></tr>`
    const pager = `
      <div class="dyd-pager">
        <div class="dyd-pager-left">
          <span>共 <strong>${total.toLocaleString()}</strong> 只 · 第 ${total ? start + 1 : 0}–${Math.min(start + state.pageSize, total)} 条</span>
        </div>
        <div class="dyd-pager-right">
          <select data-role="pagesize">${[50, 100, 200].map((size) => `<option value="${size}" ${state.pageSize === size ? 'selected' : ''}>${size} 条/页</option>`).join('')}</select>
          <button class="dyd-btn" data-page="prev" ${state.page <= 1 ? 'disabled' : ''}>‹ 上一页</button>
          <span>${state.page} / ${pageCount}</span>
          <button class="dyd-btn" data-page="next" ${state.page >= pageCount ? 'disabled' : ''}>下一页 ›</button>
        </div>
      </div>`
    return `
      <div class="dyd-table-wrap">
        <div class="dyd-table-scroll" data-role="table-scroll">
          <table class="dyd-table">
            <thead><tr><th class="dyd-left" style="min-width:26px"></th>${headers}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        ${pager}
      </div>
    `
  }

  function footerHTML() {
    const snapshot = state.snapshot
    const coverage = snapshot
      ? `快照覆盖 ${snapshot.count.toLocaleString()} 只 A 股（其中有股息 ${snapshot.summary?.sampleCount?.toLocaleString?.() ?? '—'} 只），数据日期 ${escapeHtml(snapshot.dataDate || '—')}`
      : '正在从集思录拉取数据'
    return `<div class="dyd-footer">
      数据来源：<a href="https://www.jisilu.cn/data/stock/dividend_rate/" target="_blank" rel="noreferrer">集思录 · 股息率</a>。
      ${coverage}。集思录非会员单次最多返回 100 行，插件按申万行业与沪深市场分区聚合，因此样本可能包含极少数未分红股票（TTM 记为 0）。
      本面板仅供研究参考，不构成投资建议。
    </div>`
  }

  function drawerHTML() {
    if (!state.drawerCode) return ''
    const stock = state.byCode.get(state.drawerCode)
    if (!stock) return ''
    const section = (title, items) => `
      <div class="dyd-section">
        <h4>${title}</h4>
        <div class="dyd-kv">
          ${items
            .map(
              ([key, value]) => `<div class="dyd-kv-item"><span class="dyd-kv-key">${escapeHtml(key)}</span><span class="dyd-kv-val">${value}</span></div>`,
            )
            .join('')}
        </div>
      </div>`
    const kv = (label, value, className = '') => [label, `<span class="${className}">${value}</span>`]
    const star = state.watch.has(stock.code)
    const yieldText = (value) => (isNum(value) ? `<span class="${yieldClass(value)}">${value.toFixed(2)}%</span>` : '—')
    return `
      <div class="dyd-drawer-mask" data-action="close-drawer">
        <aside class="dyd-drawer" data-drawer>
          <div class="dyd-drawer-head">
            <div>
              <div class="dyd-drawer-title">
                <button class="dyd-star ${star ? 'dyd-on' : ''}" data-star="${escapeHtml(stock.code)}">${star ? '★' : '☆'}</button>
                ${escapeHtml(stock.name)} <span class="dyd-muted" style="font-size:13px">${escapeHtml(stock.code)}</span>
              </div>
              <div class="dyd-drawer-sub">${escapeHtml(stock.industryPath || '—')} · ${escapeHtml(stock.province || '—')} · ${stock.market === 'sh' ? '沪市' : '深市'}</div>
            </div>
            <button class="dyd-close" data-action="close-drawer" title="关闭">✕</button>
          </div>
          <div class="dyd-drawer-body">
            ${section('股息率', [
              kv('股息率 TTM', yieldText(stock.divYield)),
              kv('静态股息率', yieldText(stock.divYieldStatic)),
              kv('5 年平均股息率', yieldText(stock.divYield5y)),
              kv('5 年分红率复合增长', isNum(stock.divYieldAvg) ? `${stock.divYieldAvg.toFixed(2)}%` : '—'),
              kv('5 年累计每股分红', isNum(stock.accuDividend) ? `${stock.accuDividend.toFixed(2)} 元` : '—'),
            ])}
            ${section('行情与估值', [
              kv('现价', isNum(stock.price) ? stock.price.toFixed(2) : '—'),
              kv('涨跌幅', isNum(stock.changePct) ? `<span class="${stock.changePct > 0 ? 'dyd-up' : stock.changePct < 0 ? 'dyd-down' : 'dyd-muted'}">${stock.changePct > 0 ? '+' : ''}${stock.changePct.toFixed(2)}%</span>` : '—'),
              kv('总市值', isNum(stock.marketCap) ? `${fmtCap(stock.marketCap)} 亿` : '—'),
              kv('流通市值', isNum(stock.floatCap) ? `${fmtCap(stock.floatCap)} 亿` : '—'),
              kv('PE', isNum(stock.pe) ? stock.pe.toFixed(2) : '—'),
              kv('PE 温度', isNum(stock.peTemp) ? stock.peTemp.toFixed(1) : '—'),
              kv('PB', isNum(stock.pb) ? stock.pb.toFixed(2) : '—'),
              kv('PB 温度', isNum(stock.pbTemp) ? stock.pbTemp.toFixed(1) : '—'),
            ])}
            ${section('财务指标', [
              kv('ROE', isNum(stock.roe) ? `${stock.roe.toFixed(2)}%` : '—'),
              kv('5 年平均 ROE', isNum(stock.roe5y) ? `${stock.roe5y.toFixed(2)}%` : '—'),
              kv('净利同比', isNum(stock.epsGrowthTtm) ? `${stock.epsGrowthTtm.toFixed(2)}%` : '—'),
              kv('营收 5 年复合', isNum(stock.revenueCagr) ? `${stock.revenueCagr.toFixed(2)}%` : '—'),
              kv('利润 5 年复合', isNum(stock.profitCagr) ? `${stock.profitCagr.toFixed(2)}%` : '—'),
              kv('5 年现金流复合增长', isNum(stock.cashflowAvg) ? `${stock.cashflowAvg.toFixed(2)}%` : '—'),
            ])}
            ${section('风险与分红记录', [
              kv('资产负债率', isNum(stock.debtRate) ? `${stock.debtRate.toFixed(2)}%` : '—'),
              kv('有息负债率', isNum(stock.intDebtRate) ? `${stock.intDebtRate.toFixed(2)}%` : '—'),
              kv('上市日期', escapeHtml(stock.ipoDate || '—')),
              kv('行情日期', `${escapeHtml(stock.lastDt || '—')} ${escapeHtml(stock.lastTime || '')}`),
            ])}
          </div>
        </aside>
      </div>`
  }

  function renderChrome() {
    root.innerHTML = `
      ${headerHTML()}
      ${summaryHTML()}
      ${filtersHTML()}
      ${tableHTML()}
      ${footerHTML()}
      ${drawerHTML()}
    `
    updateStatusUI()
  }

  function renderTable() {
    const target = root.querySelector('[data-role="table-scroll"]')
    if (!target) {
      renderChrome()
      return
    }
    const holder = target.parentElement
    const temp = document.createElement('div')
    temp.innerHTML = tableHTML()
    target.innerHTML = temp.querySelector('[data-role="table-scroll"]').innerHTML
    const pager = temp.querySelector('.dyd-pager')
    if (pager && holder) {
      const oldPager = holder.querySelector('.dyd-pager')
      if (oldPager) oldPager.remove()
      holder.appendChild(pager)
    }
  }

  function updateStatusUI() {
    const pill = root.querySelector('.dyd-pill')
    const pillHost = root.querySelector('.dyd-header-right')
    if (pill && pillHost && state.status) {
      const next = statusPill()
      if (pill.outerHTML !== next) {
        const wrapper = document.createElement('div')
        wrapper.innerHTML = next
        pill.replaceWith(wrapper.firstElementChild)
      }
    }
    const refreshBtn = root.querySelector('[data-action="refresh"]')
    if (refreshBtn) refreshBtn.disabled = Boolean(state.status?.refreshing)
    const progressText = root.querySelector('[data-role="progress-text"]')
    if (progressText && state.status?.progress) {
      const progress = state.status.progress
      progressText.textContent = `已抓取 ${progress.done}/${progress.total} 块 · ${progress.rows} 只 · 失败 ${progress.failed}`
      const fill = root.querySelector('.dyd-progress-fill')
      if (fill) fill.style.width = `${progress.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0}%`
    }
  }

  function renderAll() {
    if (state.snapshot) renderChrome()
    else if (state.loading) {
      root.innerHTML = `
        <div class="dyd-skeleton">
          <div class="dyd-spinner"></div>
          <div>正在构建全市场股息率快照…</div>
          <div class="dyd-sub">集思录非会员单次最多 100 行，插件按申万行业分区抓取，约需 1–3 分钟</div>
          ${state.status?.progress ? `<div class="dyd-sub">${state.status.progress.done}/${state.status.progress.total} 块 · ${state.status.progress.rows} 只 · 失败 ${state.status.progress.failed}</div>` : ''}
          ${state.error ? `<div class="dyd-sub">${escapeHtml(state.error)}</div><button class="dyd-btn" data-action="retry">重试</button>` : ''}
        </div>`
    } else if (state.error) {
      root.innerHTML = `
        <div class="dyd-skeleton">
          <div>股息率数据暂不可用</div>
          <div class="dyd-sub">${escapeHtml(state.error)}</div>
          <button class="dyd-btn dyd-retry" data-action="retry">重新加载</button>
        </div>`
    }
  }

  // ---------- 交互 ----------

  function setFilters(patch, { rerender = true } = {}) {
    Object.assign(state.filters, patch)
    state.page = 1
    if (rerender) renderChrome()
    else renderTable()
  }

  function toggleWatch(code) {
    if (state.watch.has(code)) state.watch.delete(code)
    else state.watch.add(code)
    saveWatchlist(state.watch)
    renderChrome()
  }

  function applyPreset(key) {
    const preset = PRESETS.find((item) => item.key === key)
    if (!preset) return
    if (key === 'all') setFilters({ ...EMPTY_FILTERS })
    else if (key === 'watch') setFilters({ onlyWatch: !state.filters.onlyWatch })
    else setFilters({ ...EMPTY_FILTERS, ...preset.patch })
  }

  async function refreshData() {
    const button = root.querySelector('[data-action="refresh"]')
    if (button) button.disabled = true
    setNotice('正在提交刷新请求…')
    try {
      const payload = await fetchJson('/refresh', { method: 'POST' })
      if (!payload.started) {
        setNotice('距上次抓取不足 60 秒，刷新已节流，请稍后再试')
        if (button) button.disabled = false
        setTimeout(() => {
          if (!destroyed && state.notice.startsWith('距上次抓取')) setNotice('')
        }, 6000)
        schedulePoll(5000)
        return
      }
      state.status = payload.status || { ...(state.status || {}), refreshing: true, phase: 'crawling' }
      setNotice('已触发刷新，正在分区抓取集思录数据…')
      updateStatusUI()
      schedulePoll(800)
    } catch (error) {
      setNotice(`刷新失败：${error instanceof Error ? error.message : String(error)}`)
      if (button) button.disabled = false
    }
  }

  function onClick(event) {
    const target = event.target instanceof Element ? event.target : null
    if (!target) return
    const closeDrawer = target.closest('[data-action="close-drawer"]')
    if (closeDrawer) {
      // 点遮罩或关闭按钮都收起抽屉；点击抽屉内部不触发
      const drawer = target.closest('[data-drawer]')
      if (closeDrawer === drawer || !drawer) {
        state.drawerCode = null
        renderChrome()
      }
      return
    }
    if (target.closest('[data-drawer]') && !target.closest('[data-star]')) return
    const star = target.closest('[data-star]')
    if (star) {
      event.stopPropagation()
      toggleWatch(star.getAttribute('data-star'))
      return
    }
    const preset = target.closest('[data-preset]')
    if (preset) {
      applyPreset(preset.getAttribute('data-preset'))
      return
    }
    if (target.closest('[data-action="reset"]')) {
      setFilters({ ...EMPTY_FILTERS })
      return
    }
    if (target.closest('[data-action="refresh"]')) {
      void refreshData()
      return
    }
    if (target.closest('[data-action="retry"]')) {
      state.error = null
      state.loading = true
      renderAll()
      void loadMeta().then(() => pollStatus())
      return
    }
    const pageBtn = target.closest('[data-page]')
    if (pageBtn) {
      const direction = pageBtn.getAttribute('data-page')
      state.page = Math.max(1, state.page + (direction === 'next' ? 1 : -1))
      renderTable()
      return
    }
    const sortHeader = target.closest('[data-sort]')
    if (sortHeader) {
      const key = sortHeader.getAttribute('data-sort')
      if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc'
      else {
        state.sortKey = key
        state.sortDir = key === 'name' || key === 'industryL2' || key === 'province' ? 'asc' : 'desc'
      }
      state.page = 1
      renderChrome()
      return
    }
    const row = target.closest('tr[data-code]')
    if (row) {
      state.drawerCode = row.getAttribute('data-code')
      renderChrome()
    }
  }

  function onChange(event) {
    const target = event.target instanceof Element ? event.target : null
    if (!target) return
    const filter = target.getAttribute('data-filter')
    if (filter) {
      if (filter === 'market' || filter === 'industryL1' || filter === 'industryL2' || filter === 'province') {
        const value = target.value
        if (filter === 'industryL1') setFilters({ industryL1: value, industryL2: '' })
        else setFilters({ [filter]: value })
        return
      }
      if (filter === 'minYield' || filter === 'min5y') {
        setFilters({ [filter]: target.value }, { rerender: false })
        return
      }
    }
    if (target.getAttribute('data-role') === 'pagesize') {
      state.pageSize = Number(target.value) || 50
      state.page = 1
      renderTable()
    }
  }

  function onInput(event) {
    const target = event.target instanceof Element ? event.target : null
    if (!target) return
    const filter = target.getAttribute('data-filter')
    if (filter === 'keyword') {
      state.filters.keyword = target.value
      state.page = 1
      renderTable()
    } else if (filter === 'requireDividend' || filter === 'onlyWatch') {
      setFilters({ [filter]: target.checked })
    }
  }

  root.addEventListener('click', onClick)
  root.addEventListener('change', onChange)
  root.addEventListener('input', onInput)

  // ---------- 启动 ----------

  renderAll()
  schedulePoll(300)
  void (async () => {
    await loadMeta()
    await pollStatus()
  })()

  return {
    destroy() {
      destroyed = true
      clearTimeout(pollTimer)
      document.removeEventListener('keydown', onKeyDown)
      root?.remove()
      styleEl?.remove()
      styleEl = document.getElementById(STYLE_ID)
      if (styleEl) styleEl.remove()
    },
  }
}
