/// <reference types="vite/client" />
/// <reference types="vue/jsx" />

declare module '*.module.less' {
  const classes: Record<string, string>
  export default classes
}

declare module 'plotly.js-dist-min' {
  import type * as Plotly from 'plotly.js'
  const PlotlyModule: typeof Plotly
  export default PlotlyModule
}
