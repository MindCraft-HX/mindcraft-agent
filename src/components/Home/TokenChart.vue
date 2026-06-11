<template>
  <div class="token-chart" ref="chartRef"></div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import { useClaudeThemeStore } from '../../../packages/agent/src/stores/claudeTheme.js'

const props = defineProps({
  data: { type: Array, default: () => [] },
})

const chartRef = ref(null)
let instance = null
let resizeObserver = null

const themeStore = useClaudeThemeStore()

// 按主题适配的 ECharts 配色方案
const palette = computed(() => {
  const t = themeStore.theme
  if (t === 'light') {
    return {
      colInput: '#3b82f6', colOutput: '#b8860b', colCache: '#4a9e4a',
      textDim: '#999', legendText: '#888',
      gridLine: 'rgba(0,0,0,0.06)', axisLine: 'rgba(0,0,0,0.10)',
      tooltipBg: '#fff', tooltipBorder: '#e0e0e0', tooltipText: '#333',
    }
  }
  if (t === 'brown') {
    return {
      colInput: '#5b8cc9', colOutput: '#9b6b4a', colCache: '#6b9e6b',
      textDim: '#8b7d6b', legendText: '#8b7d6b',
      gridLine: 'rgba(0,0,0,0.05)', axisLine: 'rgba(0,0,0,0.08)',
      tooltipBg: '#fffaf5', tooltipBorder: '#d4c5b0', tooltipText: '#4a3728',
    }
  }
  if (t === 'blue') {
    return {
      colInput: '#60a5fa', colOutput: '#fbbf24', colCache: '#6ee7b7',
      textDim: '#8899aa', legendText: '#8899aa',
      gridLine: 'rgba(255,255,255,0.04)', axisLine: 'rgba(255,255,255,0.06)',
      tooltipBg: '#0d2137', tooltipBorder: '#1a3350', tooltipText: '#dde4ed',
    }
  }
  // dark (默认)
  return {
    colInput: '#4a9eff', colOutput: '#d4a84b', colCache: '#6db86d',
    textDim: '#888', legendText: '#999',
    gridLine: 'rgba(255,255,255,0.04)', axisLine: 'rgba(255,255,255,0.06)',
    tooltipBg: '#1a1a1a', tooltipBorder: '#2a2a2a', tooltipText: '#e0e0e0',
  }
})

function buildOption(data) {
  const p = palette.value
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: p.tooltipBg,
      borderColor: p.tooltipBorder,
      textStyle: { color: p.tooltipText, fontSize: 12 },
      valueFormatter: (v) => {
        if (v == null || v === 0) return '0'
        if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
        if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K'
        return String(v)
      },
    },
    legend: {
      bottom: 0,
      textStyle: { color: p.legendText, fontSize: 11 },
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 24,
    },
    grid: { left: 50, right: 10, top: 14, bottom: 36 },
    xAxis: {
      type: 'category',
      data: data.map(d => d.date),
      axisLine: { lineStyle: { color: p.axisLine } },
      axisTick: { show: false },
      axisLabel: { color: p.textDim, fontSize: 10, interval: 'auto' },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: p.gridLine } },
      axisLabel: {
        color: p.textDim,
        fontSize: 10,
        formatter: (v) => {
          if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
          if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K'
          return v
        },
      },
    },
    series: [
      {
        name: '缓存',
        type: 'bar',
        stack: 'total',
        data: data.map(d => d.totalCache),
        itemStyle: { color: p.colCache },
        barMaxWidth: 32,
        emphasis: { focus: 'series' },
      },
      {
        name: '输出',
        type: 'bar',
        stack: 'total',
        data: data.map(d => d.totalOutput),
        itemStyle: { color: p.colOutput },
        barMaxWidth: 32,
        emphasis: { focus: 'series' },
      },
      {
        name: '输入',
        type: 'bar',
        stack: 'total',
        data: data.map(d => d.totalInput),
        itemStyle: { color: p.colInput, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 32,
        emphasis: { focus: 'series' },
      },
    ],
  }
}

function initChart() {
  if (!chartRef.value) return
  instance = echarts.init(chartRef.value)
  if (props.data.length) instance.setOption(buildOption(props.data))

  resizeObserver = new ResizeObserver(() => instance?.resize())
  resizeObserver.observe(chartRef.value)
}

onMounted(() => initChart())

watch(() => props.data, (d) => {
  if (!d?.length) return
  if (!instance) initChart()
  else instance.setOption(buildOption(d), true)
})

// 主题切换时重新配色
watch(palette, () => {
  if (!props.data?.length || !instance) return
  instance.setOption(buildOption(props.data), true)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  instance?.dispose()
  instance = null
})
</script>

<style lang="scss" scoped>
.token-chart {
  width: 100%;
  height: 220px;
}
</style>
