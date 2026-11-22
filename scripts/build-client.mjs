#!/usr/bin/env node
/**
 * 把 src/panel.js（纯 DOM 面板，ES 模块）内联进 src/client-entry.js 模板，
 * 生成 lib/client.js —— 一个无需构建工具、可直接被 DSH ModuleLoader 加载的
 * 浏览器 bundle。改动面板后运行：node scripts/build-client.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const PANEL = join(ROOT, 'src', 'panel.js')
const TEMPLATE = join(ROOT, 'src', 'client-entry.js')
const OUT = join(ROOT, 'lib', 'client.js')

function stripModuleSyntax(source) {
  return source
    .replace(/^export \{[^}]*\}\s*$/gm, '')
    .replace(/^export (?=(?:async )?(?:function|const|let|var|class)\b)/gm, '')
}

const indent = (text, prefix) => text.split('\n').map((line) => (line.length === 0 ? line : prefix + line)).join('\n')

async function main() {
  const [panelSource, template] = await Promise.all([
    readFile(PANEL, 'utf8'),
    readFile(TEMPLATE, 'utf8'),
  ])
  const body = stripModuleSyntax(panelSource).replace(/\n+$/, '\n')
  if (!template.includes('/* __PANEL_BODY__ */')) throw new Error('模板缺少 __PANEL_BODY__ 占位符')
  const bundle = template.replace('/* __PANEL_BODY__ */', indent(body, '    '))
  await writeFile(OUT, bundle)

  // 语法检查（bundle 是普通脚本，node --check 足以发现拼写/括号问题）
  const nodeBin = process.env.DSH_NODE_BIN ?? process.execPath
  await promisify(execFile)(nodeBin, ['--check', OUT]).catch((error) => {
    throw new Error(`生成的 bundle 语法检查失败：${error.stderr ?? error.message}`)
  })
  process.stdout.write(`已生成 ${OUT}（${(bundle.length / 1024).toFixed(1)} KB）\n`)
}

main().catch((error) => {
  process.stderr.write(`构建失败：${error.message}\n`)
  process.exitCode = 1
})
