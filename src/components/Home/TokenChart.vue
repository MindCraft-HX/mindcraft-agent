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

const COL_INPUT = '#4a9eff'
const COL_OUTPUT = '#d4a84b'
const COL_CACHE = '#6db86d'
const TEXT_DIM = '#888'
const AXIS_COLOR = 'rgba(255,255,255,0.06)'

function buildOption(data) {
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
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
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 24,
    },
    grid: { left: 50, right: 10, top: 14, bottom: 36 },
    xAxis: {
      type: 'category',
      data: data.map(d => d.date),
      axisLine: { lineStyle: { color: AXIS_COLOR } },
      axisTick: { show: false },
      axisLabel: { color: TEXT_DIM, fontSize: 10, interval: 'auto' },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
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
      {
        name: '输入',
        type: 'bar',
        data: data.map(d => d.totalInput),
        itemStyle: { color: COL_INPUT, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 16,
      },
      {
        name: '输出',
        type: 'bar',
        data: data.map(d => d.totalOutput),
        itemStyle: { color: COL_OUTPUT, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 16,
      },
      {
        name: '缓存',
        type: 'bar',
        data: data.map(d => d.totalCache),
        itemStyle: { color: COL_CACHE, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 16,
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
