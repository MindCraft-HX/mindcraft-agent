<template>
  <div>
    <!-- 当前积分余额: -->
    <div class="ConsumptionPointsBalance">
      <div class="currentPointBalance">当前积分余额:</div>
      <div class="money">{{ user_points }}</div>
      <div class="account">
        <div style="color: #5c6269;display: flex;">会员状态：<div style="font-weight: 600;">{{ membershipStatus }}</div>
        </div>
        <div style="color: #5c6269;display: flex;">会员到期时间：<div style="font-weight: 600;">
            {{ userInfo?.vip_expire }}</div>
        </div>
      </div>
    </div>
    <!-- 柱状图 -->
    <!--  -->
    <div class="histogram">
      <div class="box" ref="chartDom"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch, computed } from "vue";
import * as echarts from "echarts";
import { getEcharts } from '@/api/mainActivity/pointCard/pointBalance';
import { useMitt } from "../../../utils/mitt";
const mitt = useMitt();


const dataList = ref([]);
const chartDom = ref(null);
let myChart = null;
const TestList = ref([]);
const user_points = ref("");
const userInfo = ref([]);
const vip_level = ref(null);


const membershipStatus = computed(() => {
  const res = vip_level.value > 0 ? '会员' : '非会员';
  return res
});


onMounted(async () => {
  await fetchDataAndRenderChart();
});

// 把结构返回的数据做处理 echarts结构


// echarts数据列表
const fetchDataAndRenderChart = async () => {
  const id = 7; //天数
  try {
    const res = await getEcharts(id);

    dataList.value = res.data.points_datas;
    // console.log(dataList.value,'dataList.value>>>>>>>>>>>');
    const processedData = processData(dataList.value);
    TestList.value = processedData;
    // console.log(TestList.value, 'TestList.value>>>>>>>>>>>>>.');
    user_points.value = res.data.user_profile?.points;
    userInfo.value = res.data.user_profile;
    vip_level.value = res.data.user_profile?.vip_level;
    // // 渲染图表
    initChart();

  } catch (error) {
    console.log(error);
  }
};

const processData = (dataList) => {
  const dateModelScores = {};
  dataList.forEach(item => {
    // console.log(item,'item');
    // console.log(dataList,'dataList');
    const { points, model, created_at } = item;
    const date = created_at.split(' ')[0];
    if (!dateModelScores[date]) {
      dateModelScores[date] = { date }; // 直接在这里初始化date属性
    }
    // 累加points，并保留两位小数
    const accumulatedPoints = (dateModelScores[date][model] || 0) + points;
    dateModelScores[date][model] = +accumulatedPoints.toFixed(2);
  });
  // 直接在对象转数组时进行排序和截取
  return Object.values(dateModelScores)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-7)
    .map((item, index) => ({ ...item, id: index + 1 }));
};

mitt.on('fetchDataAndRenderChart', () => {
  fetchDataAndRenderChart();
});


// echarts
// const initChart = () => {
//   // console.log('我是initChart');
//   if(!myChart){
//      myChart = echarts.init(chartDom.value);
//   }
//   var option = {
//     title: {
//       text: '近期积分消耗',
//       textStyle: {
//         // color:"red", 
//         // fontsize:10,
//         // margin: 10,
//       }
//     },
//     tooltip: {
//       trigger: 'axis',
//       axisPointer: {
//         type: 'shadow'
//       }
//     },
//     legend: {
//       data: ['gpt-3.5-turbo-0125', 'gpt-4-turbo', 'dall-e-3'],
//       left: '40%'
//     },
//     grid: {
//       left: '3%',
//       right: '4%',
//       bottom: '3%',
//       containLabel: true
//     },
//     xAxis: [
//       // type类型
//       // 'time'：时间轴，
//       // 'value'：数值轴
//       // 'category'：类目轴，
//       // 'log'：对数轴，
//       // 'logCategory'：对数类目轴
//       // 'valueCategory'：数值类目轴
//       {
//         type: 'category',
//         data: TestList.value.map(item => item.date),
//       }
//     ],
//     yAxis: [
//       {
//         type: 'value',
//         data: ['2000', '4000', '6000', '8000', '9000', '10000'],
//       }
//     ],
//     series: [
//       // name：系列的名称
//       // type：系列的图表类型
//       // stack：柱状图的堆叠方式
//       // emphasis：用于设置在高亮状态下的样式
//       // data：柱状图的数据数组
//       {
//         name: 'gpt-3.5-turbo-0125',
//         type: 'bar',
//         barWidth: 10,
//         stack: 'Search Engine',
//         emphasis: {
//           focus: 'series'
//         },
//         data: TestList.value.map(item => ({ value: item["gpt-3.5-turbo-0125"], name: item.date })), // 注意数据格式
//         itemStyle: {
//           color: '#419FFF' // 设置柱状图的颜色
//         }
//       },
//       {
//         name: 'gpt-4-turbo',
//         type: 'bar',
//         stack: 'Search Engine',
//         emphasis: {
//           focus: 'series'
//         },
//         data: TestList.value.map(item => ({ value: item["gpt-4-turbo"], name: item.date })), // 注意数据格式
//         itemStyle: {
//           color: '#F4AB01' // 设置柱状图的颜色
//         }
//       },
//       {
//         name: 'dall-e-3',
//         type: 'bar',
//         stack: 'Search Engine',
//         emphasis: {
//           focus: 'series'
//         },
//         data: TestList.value.map(item => ({ value: item["dall-e-3"], name: item.date })), // 注意数据格式
//         itemStyle: {
//           color: '#3AD4FF', // 设置柱状图的颜色
//         }
//       },
//       {
//         name: 'GPT-4-V',
//         type: 'bar',
//         stack: 'Search Engine',
//         emphasis: {
//           focus: 'series'
//         },
//         data: TestList.value.map(item => ({ value: item["GPT-4-V"], name: item.date })), // 注意数据格式
//         itemStyle: {
//           color: "#EA4BE7"
//         }
//       },
//     ],
//   };
//   // 自适应
//   // window.addEventListener('resize', function () {
//   //   myChart.resize();
//   // },
//   //   { passive: false })
//   option && myChart.setOption(option);
// };

const initChart = () => {
  if (!myChart) {
    myChart = echarts.init(chartDom.value);
  }

  // 提取所有键（除了 'date' 和 'id'）
  const allKeys = new Set();
  TestList.value.forEach(item => {
    Object.keys(item).forEach(key => {
      if (key !== 'date' && key !== 'id') {
        allKeys.add(key);
      }
    });
  });

  // 定义颜色映射
  const colorMap = {
    'gpt-3.5-turbo-0125': '#419FFF',
    'gpt-4-turbo': '#F4AB01',
    'dall-e-3': '#3AD4FF',
  };

  // 为每个键创建一个 series 对象
  const series = Array.from(allKeys).map(key => ({
    name: key,
    type: 'bar',
    stack: 'Search Engine',
    // barWidth: 20, // 设置柱子的宽度
    emphasis: {
      focus: 'series'
    },
    data: TestList.value.map(item => ({
      value: item[key] || 0, // 使用 0 作为缺失值
      name: item.date
    })),
    itemStyle: {
      // 可以根据 key 设置不同的颜色，这里只是示例
      color: colorMap[key] || '#' + Math.floor(Math.random() * 16777215).toString(16) // 如果颜色未定义，则生成随机颜色
    }
  }));

  var option = {
    title: {
      text: '近期积分消耗',
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      formatter: function (params) {
        let result = params[0].axisValue + '<br/>';
        params.forEach(item => {
          if (item.data.value !== 0) {
            result += item.marker + item.seriesName + ': ' + item.data.value + '<br/>';
          }
        });
        return result;
      }
    },
    legend: {
      data: Array.from(allKeys),
      left: '20%',
      orient: 'horizontal',
      type: 'scroll', // 启用滚动条
      pageButtonItemGap: 5, // 设置分页按钮的间隔
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: [
      {
        type: 'category',
        data: TestList.value.map(item => item.date),
      }
    ],
    yAxis: [
      {
        type: 'value'
      }
    ],
    series: series,
  };

  option && myChart.setOption(option);
};

// 自适应调整大小
const handleResize = () => {
  window.addEventListener('resize', () => {
    myChart?.resize();
  });
};
// 卸载的 
const handleDispose = () => {
  if (myChart) {
    myChart.dispose(); // 销毁实例
    myChart = null; // 将 myChart 设置为 null，确保下次可以重新初始化
  }
}

// 打开
mitt.on('handleResize', async () => {
  await fetchDataAndRenderChart();
  handleResize();
});
// 关闭卸载的echarts 实例
mitt.on('handleDispose', () => {
  handleDispose();
})


watch(TestList, (newValue) => {
  // 当TestList变化时，更新图表
  initChart();
}, { deep: true });



// watch(()=>userInfo.value,(val)=>{
//  console.log(val.vip_level,'val');
//  vip_level.value = val.vip_level;
//  console.log(vip_level.value,'vip_level.value');
// });



</script>

<style scoped>
.ConsumptionPointsBalance {
  /* width: 500px; */
  height: 200px;
  background: #ebf5ff;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  margin-bottom: 5px;
}

.account {
  display: flex;
  justify-content: space-between;
  padding: 0 20px;
  margin-bottom: -15px;
}

.currentPointBalance {
  margin-right: 496px;
  margin-top: -12px;
  width: 120px;
  color: #20272e;
  font-weight: 600;
}

.money {
  font-size: 62px;
  color: #419fff;
  font-weight: 600;
}

.histogram {
  height: 500px;
  border: 1px solid #ccc;
  border-radius: 10px;
}

.box {
  width: 100%;
  height: 100%;
}
</style>
