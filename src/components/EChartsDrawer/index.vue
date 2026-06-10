<template>
    <div>
        <!-- 抽屉 -->
        <el-drawer v-model="drawerVisible" title="展示图表" :with-header="false" size="80%" @open="renderMermaid"
            @close="deleteMermaid">
            <div style="display: flex;align-items: center;justify-content: space-between;margin-bottom: 5px;">
                <div style="color: #a5aeae;">图表：</div>
                <div>
                    <!-- 点击展示 -->
                    <el-popover placement="bottom" :width="800" trigger="click">
                        <template #reference>
                            <el-button :icon="Hide" type="primary">图表语法代码</el-button>
                        </template>
                        <codemirror :initialCode="initialCode" />
                    </el-popover>
                    <!-- 下载 -->
                    <el-button type="primary" @click="retryRequest">重试</el-button>
                    <el-button type="primary" :icon="Download" @click="downloadJPG">另存为</el-button>
                    <!-- <el-button type="primary" @click="HitReset">复位</el-button> -->
                    <!-- 放大缩小 -->
                    <!-- <el-button style="width: 28px;height: 28px;" :icon="Plus" circle @click="zoomIn" type="primary"
                        plain />
                    <el-button style="width: 28px;height: 28px;" :icon="Minus" circle @click="zoomOut" type="primary"
                        plain /> -->
                </div>
            </div>
            <!-- 渲染流程图  -->
            <div class="ECharts_head">
                <div  ref="chartDom" style="width: 100%; height: 100%;"></div>
            </div>
        </el-drawer>
    </div>
</template>

<script setup>
import { ref, nextTick, watch, onMounted,watchEffect } from 'vue';
import { Plus, Minus, Download, Hide } from "@element-plus/icons-vue";
// import * as d3 from 'd3';
import * as echarts from 'echarts';
import codemirror from '../codemirror/index.vue';
import domtoimage from "dom-to-image";



const drawerVisible = ref(false); //弹窗开关
const chartDom = ref(null); //echarts实例
let myChart = null;
const initialCode = ref({})


const props = defineProps({
  EChartsObj:Object,
});

const emit = defineEmits(["resetChart"]);


watch(()=>props.EChartsObj,(val)=>{
  // console.log(val,'val');
  initialCode.value = val;
},{immediate:true})

onMounted(() => {});

// 打开弹窗
const OpenDrawer = () => {
    drawerVisible.value = true;
}

// 打开
const renderMermaid = () => {
    initChart();
    // nextTick(() => {
    //     myChart = echarts.init(chartDom.value);
    //     const option = {
    //         title: {
    //             text: 'Referer of a Website',
    //             subtext: 'Fake Data',
    //             left: 'center'
    //         },
    //         tooltip: {
    //             trigger: 'item'
    //         },
    //         legend: {
    //             orient: 'vertical',
    //             left: 'left'
    //         },
    //         series: [
    //             {
    //                 name: 'Access From',
    //                 type: 'pie',
    //                 radius: '50%',
    //                 data: [
    //                     { value: 1048, name: 'Search Engine' },
    //                     { value: 735, name: 'Direct' },
    //                     { value: 580, name: 'Email' },
    //                     { value: 484, name: 'Union Ads' },
    //                     { value: 300, name: 'Video Ads' }
    //                 ],
    //                 emphasis: {
    //                     itemStyle: {
    //                         shadowBlur: 10,
    //                         shadowOffsetX: 0,
    //                         shadowColor: 'rgba(0, 0, 0, 0.5)'
    //                     }
    //                 }
    //             }
    //         ]
    //     };
    //     window.onresize = function () {//自适应大小
    //         myChart.resize();
    //     };
    //     myChart.setOption(option);
    // })
};
// 关闭
const deleteMermaid = () => { };

/*判断*************************************************************************************************************************** */

const chartType = ref('bar'); // 默认为饼图，可以是 'line', 'bar', 'pie'
const chartData = ref({  

  xAxis: {
  type: 'category',
  boundaryGap: false
  },
  yAxis: {
    type: 'value',
    boundaryGap: [0, '30%']
  },
  visualMap: {
    type: 'piecewise',
    show: false,
    dimension: 0,
    seriesIndex: 0,
    pieces: [
      {
        gt: 1,
        lt: 3,
        color: 'rgba(0, 0, 180, 0.4)'
      },
      {
        gt: 5,
        lt: 7,
        color: 'rgba(0, 0, 180, 0.4)'
      }
    ]
  },
  series: [
    {
      type: 'line',
      smooth: 0.6,
      symbol: 'none',
      lineStyle: {
        color: '#5470C6',
        width: 5
      },
      markLine: {
        symbol: ['none', 'none'],
        label: { show: false },
        data: [{ xAxis: 1 }, { xAxis: 3 }, { xAxis: 5 }, { xAxis: 7 }]
      },
      areaStyle: {},
      data: [
        ['2019-10-10', 200],
        ['2019-10-11', 560],
        ['2019-10-12', 750],
        ['2019-10-13', 580],
        ['2019-10-14', 250],
        ['2019-10-15', 300],
        ['2019-10-16', 450],
        ['2019-10-17', 300],
        ['2019-10-18', 100]
      ]
    }
  ]

});

const initChart = () => {
  const myChart = echarts.init(chartDom.value);
  console.log(props.EChartsObj,'props.EChartsObj');
  watchEffect(() => {
    // const option = generateChartOption(chartType.value, props.EChartsObj);
    const option = props.EChartsObj;
    myChart.setOption(option);
  });
};


const retryRequest = ()=>{
  emit('resetChart');
  drawerVisible.value = false;
}

const downloadJPG = ()=>{
    domtoimage.toPng(chartDom.value,{ background: '#f80000' })
        .then(function (dataUrl) {
            // 创建一个链接并下载图片
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = 'svg_image.png';
            link.click();
        })
        .catch(function (error) {
            console.error('转换失败:', error);
        });
}



defineExpose({
    OpenDrawer,
});


</script>

<style scoped>
.ECharts_head {
    height: 95%;
    border: 1px solid #a5aeae;
    border-radius: 10px 10px;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
}

.dialog-span {
    font-size: 17px;
    /* font-weight: 600; */
    color: #010101;
}

:deep(.el-dialog__footer) {
    text-align: left;
}

.dialog-span {
    font-size: 17px;
    /* font-weight: 600; */
    color: #010101;
}

/* .el-dialog__header{
  margin: 16px;
  border-bottom: 1px solid #000;
} */
:deep(.el-dialog__header) {
    margin: 16px;
    border-bottom: 1px solid #c7c7c9;
}

:deep(.el-dialog__title) {
    margin-left: -20px;
}
</style>