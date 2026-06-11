<template>
  <div class="token-chart" ref="chartRef"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  data: { type: Array, default: () => [] },
})

const chartRef = ref(null)
let instance = null
let resizeObserver = null

// Colors matching app's status palette
const COL_INPUT = '#4a9eff'   // --cc-info blue
const COL_OUTPUT = '#d4a84b'  // --cc-warning amber
const COL_CACHE = '#6db86d'   // --cc-success green
const TEXT_DIM = '#888'
const GRID_COLOR = 'rgba(255,255,255,0.04)'
const AXIS_COLOR = 'rgba(255,255,255,0.06)'

function buildOption(data) {
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1a1a1a',
      borderColor: '#2a2a2a',
      textStyle: { color: '#e0e0e0', fontSize: 12 },
      valueFormatter: (v) => {
        if (v == null || v === 0) return '0'
        if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
        if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K'
        return String(v)
      },
    },
    legend: {
      bottom: 0,
      textStyle: { color: '#999', fontSize: 11 },
      itemWidth: 14,
      itemHeight: 2,
      itemGap: 24,
    },
    grid: { left: 50, right: 10, top: 10, bottom: 30 },
    xAxis: {
      type: 'category',
      data: data.map(d => d.date),
      axisLine: { lineStyle: { color: AXIS_COLOR } },
      axisTick: { show: false },
      axisLabel: { color: TEXT_DIM, fontSize: 10, interval: 'auto' },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: GRID_COLOR } },
      axisLabel: {
        color: TEXT_DIM,
        fontSize: 10,
        formatter: (v) => {
          if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
          if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K'
          return v
        },
      },
    },
    series: [
      makeSeries('输入', data.map(d => d.totalInput), COL_INPUT),
      makeSeries('输出', data.map(d => d.totalOutput), COL_OUTPUT),
      makeSeries('缓存', data.map(d => d.totalCache), COL_CACHE, true),
    ],
  }
}

function makeSeries(name, vals, color, dashed) {
  return {
    name,
    type: 'line',
    data: vals,
    smooth: true,
    symbol: 'none',
    lineStyle: { color, width: 2, type: dashed ? 'dashed' : 'solid' },
    itemStyle: { color },
    areaStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: color + '22' },
        { offset: 1, color: color + '00' },
      ]),
    },
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
