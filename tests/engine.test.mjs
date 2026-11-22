// 基础单元测试：字段归一化、行业树、概览统计。不访问网络。
import assert from 'node:assert/strict'
import { buildIndustryTree, computeSummary } from '../lib/index.js'
import { normalizeCell } from '../lib/jisilu.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = join(HERE, '..', 'data')

// 1. 字段归一化
const cell = {
  stock_id: '600741',
  stock_nm: '华域汽车',
  last_dt: '2026-11-20',
  price: '16.680',
  dividend_rate: '5.995',
  dividend_rate2: '4.796',
  dividend_rate5: '5.252',
  sw_cd: '280202',
  industry_nm2: '汽车-汽车零部件-车身附件及饰件',
  province: '上海',
  pe: '8.858',
  pb: '0.771',
  stdevry: 'buy',
  pledge_rt: 'buy',
  total_value: '525.87',
}
const stock = normalizeCell(cell)
assert.equal(stock.code, '600741')
assert.equal(stock.market, 'sh')
assert.equal(stock.divYield, 5.995)
assert.equal(stock.divYield5y, 5.252)
assert.equal(stock.industryL1, '汽车')
assert.equal(stock.industryL2, '汽车零部件')
assert.equal(stock.swL3, '280202')
assert.equal(stock.pledgeRt, null, '非数字字符串应转为 null')
assert.equal(stock.stdevry, 'buy')

// 2. 行业树
const taxonomy = JSON.parse(readFileSync(join(DATA, 'taxonomy.json'), 'utf8'))
const tree = buildIndustryTree(taxonomy)
assert.equal(tree.length, 31, '申万一级行业应为 31 个')
assert.ok(tree[0].children.length > 0)

// 3. 概览统计
const summary = computeSummary([
  { divYield: 5, divYield5y: 5, industryL1: '银行' },
  { divYield: 3, divYield5y: 3, industryL1: '银行' },
  { divYield: 7, divYield5y: 4, industryL1: '煤炭' },
  { divYield: 0, divYield5y: 0, industryL1: '电子' },
  { divYield: null, divYield5y: 2, industryL1: '电子' },
])
assert.equal(summary.count, 5)
assert.equal(summary.sampleCount, 3)
assert.equal(summary.avg, 5)
assert.equal(summary.median, 5)
assert.equal(summary.ge5, 2)
assert.equal(summary.ge3, 3)
assert.equal(summary.topIndustries[0].name, '煤炭')

console.log('engine.test.mjs 全部通过')
