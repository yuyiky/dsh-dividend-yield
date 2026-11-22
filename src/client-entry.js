// DSH 客户端入口：把纯 DOM 股息率面板接进 Web GUI。
//
// - `main` keyed slot 提供整页面板（点击侧栏入口即可打开）；
// - `sidebar.panellist` list 提供侧栏导航行（id 与 main 的 key 一致）。
//
// 本文件是模板：scripts/build-client.mjs 把 src/panel.js 的实现内联到工厂函数里，
// 生成可直接被 ModuleLoader 加载的 lib/client.js。
window.__ModuleLoader__.load({
  id: 'dsh-dividend-yield',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')

    const PANEL = (function () {
/* __PANEL_BODY__ */
      return { mountPanel }
    })()

    const ID = 'dividend-yield'

    function Panel() {
      const host = React.useRef(null)
      React.useEffect(() => {
        const handle = PANEL.mountPanel(host.current)
        return () => handle.destroy()
      }, [])
      return React.createElement('div', { ref: host, style: { height: '100%', minHeight: 0 } })
    }

    // 百分号图标
    const ICON_PATH =
      'M4.2 3.1a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4Zm7.6 6.4a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4ZM2.9 13.4l9.2-10.8 1.2 1-9.2 10.8-1.2-1Z'

    function Icon(props) {
      const size = props?.size ?? 16
      return React.createElement('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'currentColor',
        'aria-hidden': 'true',
        focusable: 'false',
      }, React.createElement('path', { d: ICON_PATH }))
    }

    const inject = ['slots']

    function apply(ctx) {
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: ID }, Panel))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: ID,
        order: 7,
        label: () => '股息率',
      }, Icon))
    }

    exports.apply = apply
    exports.inject = inject
    exports.mountPanel = PANEL.mountPanel
    return module.exports
  },
})
