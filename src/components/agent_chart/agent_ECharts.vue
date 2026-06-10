<template>
  <div class="ECharts_head">
    <div ref="chartDom" style="width: 100%; height: 100%;"></div>
  </div>
</template>

<script setup>
import { ref, nextTick, watch, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';
import { extractEChartsCode } from "../../utils/filterTool.js"
import { useMitt } from '../../utils/mitt.js'

const chartDom = ref(null); //echarts实例
let myChart = null;
const mitt = useMitt();

const chartData = ref({});
const props = defineProps({
  messages_ECharts: Object,
});

watch(props.messages_ECharts, (newVal) => {
  const res = extractEChartsCode(newVal.chart_code);
  // console.log(res, 'res');
  chartData.value = JSON.parse(res);
}, { immediate: true });

onMounted(() => {
  mitt.on("openAgent_ECharts", openAgent_ECharts);
});

onUnmounted(() => {
  window.removeEventListener('resize', resizeChart);
  mitt.off("openAgent_ECharts", openAgent_ECharts);
  destroyChart();
});

const openAgent_ECharts = () => {
  nextTick(() => {
    if (chartDom.value) {
      // 销毁之前的实例
      destroyChart();

      myChart = echarts.init(chartDom.value);
      myChart.setOption(chartData.value); // 设置图表配置

      // 监听窗口大小变化，调整图表大小
      window.addEventListener('resize', resizeChart);
    } else {
      console.error('chartDom is not available');
    }
  });
};

const destroyChart = () => {
  if (myChart) {
    myChart.dispose();
    myChart = null;
  }
};

const resizeChart = () => {
  if (myChart) {
    myChart.resize();
  }
};

</script>

<style scoped>
.ECharts_head {
  max-width: 100%;
  height: 400px;
}
</style>