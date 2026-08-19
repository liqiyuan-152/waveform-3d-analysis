import type * as Plotly from 'plotly.js'
import plotlyZhCNLocale from './plotlyLocales/zh-CN'

export type PlotlyRuntime = typeof Plotly

let plotlyPromise: Promise<PlotlyRuntime> | null = null
let plotlyLocaleRegistered = false

export async function loadPlotly(): Promise<PlotlyRuntime> {
  if (!plotlyPromise) {
    plotlyPromise = import('plotly.js-dist-min').then((module) => {
      const Plotly = module.default as PlotlyRuntime

      if (!plotlyLocaleRegistered) {
        Plotly.register(plotlyZhCNLocale as never)
        plotlyLocaleRegistered = true
      }

      return Plotly
    })
  }

  return plotlyPromise
}
