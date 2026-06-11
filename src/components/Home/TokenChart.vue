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

function buildOption(data) {
  const dates = data.map(d => d.date)
  const inputVals = data.map(d => d.totalInput)
  const outputVals = data.map(d => d.totalOutput)
  const cacheVals = data.map(d => d.totalCache)

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(20, 20, 22, 0.94)',
      borderColor: 'rgba(255,255,255,0.08)',
      textStyle: { color: '#e0e5e9', fontSize: 12 },
      valueFormatter: (value) => {
        if (value == null || value === 0) return '0'
        if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M'
        if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K'
        return String(value)
      },
    },
    legend: {
      bottom: 0,
      textStyle: { color: '#8b949e', fontSize: 11 },
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 20,
    },
    grid: {
      left: 48,
      right: 16,
      top: 8,
      bottom: 32,
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      axisTick: { show: false },
      axisLabel: { color: '#8b949e', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      axisLabel: {
        color: '#8b949e',
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
        type: 'line',
        data: inputVals,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#409EFF', width: 2 },
        itemStyle: { color: '#409EFF' },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(64,158,255,0.18)' },
          { offset: 1, color: 'rgba(64,158,255,0)' },
        ])},
      },
      {
        name: '输出',
        type: 'line',
        data: outputVals,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#E6A23C', width: 2 },
        itemStyle: { color: '#E6A23C' },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(230,162,60,0.15)' },
          { offset: 1, color: 'rgba(230,162,60,0)' },
        ])},
      },
      {
        name: '缓存',
        type: 'line',
        data: cacheVals,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#67C23A', width: 2, type: 'dashed' },
        itemStyle: { color: '#67C23A' },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(103,194,58,0.12)' },
          { offset: 1, color: 'rgba(103,194,58,0)' },
        ])},
      },
    ],
  }
}

function initChart() {
  if (!chartRef.value) return
  instance = echarts.init(chartRef.value)
  if (props.data.length) {
    instance.setOption(buildOption(props.data))
  }

  resizeObserver = new ResizeObserver(() => {
    instance?.resize()
  })
  resizeObserver.observe(chartRef.value)
}

onMounted(() => {
  initChart()
})

watch(() => props.data, (newData) => {
  if (!instance) {
    initChart()
    return
  }
  instance.setOption(buildOption(newData), true)
}, { deep: true })

onUnmounted(() => {
  resizeObserver?.disconnect()
  instance?.dispose()
  instance = null
})
</script>

<style lang="scss" scoped>
.token-chart {
  width: 100%;
  height: 100%;
  min-height: 200px;
}
</style>
