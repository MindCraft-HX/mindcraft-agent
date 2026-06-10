<template>
    <div>
        <el-drawer v-model="drawerVisible" title="展示思维导图" :with-header="false" size="85%" @open="rendersMind"
            @closed="handleDrawerClosed">
            <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 5px;
        ">
                <div style="color: #a5aeae">思维导图：</div>                   
                <div style="display: flex; align-items: center">
                    <el-button type="primary" style="margin-right: 2px" @click="screen_shot" size="small" title="下载思维导图">下载</el-button>

                    <el-button type="primary" style="margin-right: 2px" @click="zoomIn" size="small">放大</el-button>
                    <el-button type="primary" style="margin-right: 2px" @click="zoomOut" size="small">缩小</el-button>
                        <el-button type="primary" style="margin-right: 5px" @click="save_nodearray_file"
                        size="small" title="保存修改内容">保存</el-button>
                    <el-popover placement="bottom" :width="800" trigger="click">
                        <template #reference>
                            <!-- <el-button :icon="Hide" type="primary">流程图语法代码</el-button> -->
                            <el-button type="primary" style="margin-right: 2px" icon="Hide"
                                size="small">思维导图代码</el-button>
                        </template>
                        <!-- 内容 -->
                         <!-- <div v-html="renderHtml(props.jsMindObj)"></div> -->
                        <codemirror :initialCode="initialCode" />
                    </el-popover>
                    <el-button type="primary" style="margin-right: 2px" @click="addNode" size="small">新增节点</el-button>
                    <el-button type="danger" style="margin-right: 5px" @click="onRemoveNode"
                        size="small">删除节点</el-button>
                    <span style="font-weight: 600">展开：</span>
                    <el-select v-model="level" placeholder="展开全部节点" style="width: 150px; margin-right: 5px"
                        @change="expand_to_level">
                        <el-option v-for="item in nodeOptions" :key="item.value" :label="item.label"
                            :value="item.value" />
                    </el-select>
                    <!-- <span style="font-weight: 600">主题：</span>
                    <el-select v-model="theme" placeholder="主题颜色" style="width: 100px" @change="set_theme">
                        <el-option v-for="item in themeOptions" :key="item.value" :label="item.label"
                            :value="item.value" />
                    </el-select> -->
                </div>
            </div>
            <!-- 渲染思维导图  -->
            <div class="jsMind_head">
                <div id="jsmind_container" ref="container" style="width: 100%; height: 100%"></div>
            </div>
        </el-drawer>
    </div>
</template>

<script setup>
import { ref, nextTick, onMounted, watch, onUnmounted } from "vue";
import { useMitt } from "@/utils/mitt";
import { Plus, Minus, Download, Hide } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { renderHtml } from '../../utils/MarkdownIt';
// import "jsmind/style/jsmind.css";
// import jsMind from "jsmind";
// window.jsMind = jsMind;
// import "jsmind/draggable-node";
// import "jsmind/screenshot";
import html2canvas from "html2canvas";
// import domtoimage from "dom-to-image";
import codemirror from '../codemirror/index.vue';

// console.log(jsMind,'jsMind');

// console.log(window.jsMind,'window.jsMind>>>>>>>>>');

const mitt = useMitt();

const drawerVisible = ref(false);
const container = ref(null);
const jm = ref(null);
const level = ref(0);
const isZoomIn = ref(false);
const isZoomOut = ref(false);
let isDragging = false;
let startX = 0;
let startY = 0;
let initialX = 0; // 初始的X偏移
let initialY = 0; // 初始的Y偏移

const initialCode = ref("");

const props = defineProps({
    jsMindObj: {
        type: Object,
    }
});

watch(()=>props.jsMindObj,(val)=>{
//   console.log(val,'val');
  initialCode.value = val;
},{immediate:true})


const mindData1 = ref(
    { 
    "format": "node_tree",
  "meta": {
    "name": "深圳旅游推荐",
    "author": "Assistant",
    "version": "1.0"
  },
  "data": {
    "id": "root",
    "topic": "深圳旅游推荐",
    "children": [
      {
        "id": "sub1",
        "topic": "深圳欢乐海岸",
        "direction": "right",
        "expanded": true,
        "children": [
          {
            "topic": "游乐设施",
            "id": "sub1_1"
          },
          {
            "topic": "表演",
            "id": "sub1_2"
          },
          {
            "topic": "购物",
            "id": "sub1_3"
          },
          {
            "topic": "餐饮",
            "id": "sub1_4"
          }
        ]
      },
      {
        "id": "sub2",
        "topic": "深圳窗口",
        "direction": "right",
        "expanded": true,
        "children": [
          {
            "topic": "城市发展历程",
            "id": "sub2_1"
          },
          {
            "topic": "未来规划",
            "id": "sub2_2"
          }
        ]
      },
      {
        "id": "sub3",
        "topic": "深圳市民中心",
        "direction": "right",
        "expanded": true,
        "children": [
          {
            "topic": "平安大厦",
            "id": "sub3_1"
          },
          {
            "topic": "音乐喷泉",
            "id": "sub3_2"
          },
          {
            "topic": "人民公园",
            "id": "sub3_3"
          }
        ]
      },
      {
        "id": "sub4",
        "topic": "东部华侨城",
        "direction": "right",
        "expanded": true,
        "children": [
          {
            "topic": "欢乐谷",
            "id": "sub4_1"
          },
          {
            "topic": "锦绣中华",
            "id": "sub4_2"
          }
        ]
      },
      {
        "id": "sub5",
        "topic": "大梅沙海滨公园",
        "direction": "right",
        "expanded": true,
        "children": [
          {
            "topic": "海滩",
            "id": "sub5_1"
          },
          {
            "topic": "海洋公园",
            "id": "sub5_2"
          }
        ]
      }
    ]
  }})


// 思维导图数据
const mindData = ref(
  {
  "format": "node_tree",
  "meta": {
    "name": "深圳旅游推荐",
    "author": "Assistant",
    "version": "1.0"
  },
  "data": 
    {
      "id": "1",
      "topic": "收购一家公司流程",
    }
  
}
);
const isEdit = ref(true);

// 颜色
const themeOptions = [
    { value: "default", label: "default" },
    { value: "primary", label: "primary" },
    { value: "warning", label: "warning" },
    { value: "danger", label: "danger" },
    { value: "success", label: "success" },
    { value: "info", label: "info" },
    { value: "greensea", label: "greensea" },
    { value: "nephrite", label: "nephrite" },
    { value: "belizehole", label: "belizehole" },
    { value: "wisteria", label: "wisteria" },
    { value: "asphalt", label: "asphalt" },
    { value: "orange", label: "orange" },
    { value: "pumpkin", label: "pumpkin" },
    { value: "pomegranate", label: "pomegranate" },
    { value: "clouds", label: "clouds" },
    { value: "asbestos", label: "asbestos" },
];
const theme = ref("primary");
const set_theme = (theme_name) => {
    jm.value.set_theme(theme_name);
    console.log(theme_name);
};
// 节点
const nodeOptions = [
    { value: 1, label: "展开到一级节点" },
    { value: 2, label: "展开到二级节点" },
    { value: 3, label: "展开到三级节点" },
    { value: 4, label: "展开到四级节点" },
    { value: 0, label: "展开全部节点" },
    { value: -1, label: "隐藏全部节点" },
];
const expand_all = () => {
    jm.value.expand_all();
};
const collapse_all = () => {
    jm.value.collapse_all();
};
const expand_to_level = (num) => {
    switch (num) {
        case -1:
            collapse_all();
            break;
        case 0:
            expand_all();
            break;
        default:
            jm.value.expand_to_depth(num);
            break;
    }
};

// 新增
const addNode = () => {
    var selectedNode = jm.value.get_selected_node(); // as parent of new node
    if (!selectedNode) {
        ElMessage.warning("请先选择一个节点");
        return;
    }
    var nodeid = jsMind.util.uuid.newid();
    var topic = "请输入子节点名称";
    jm.value.add_node(selectedNode, nodeid, topic);
};

// 获取选中标签的 ID
const get_selected_nodeid = () => {
    let selectedNode = jm.value.get_selected_node();
    if (selectedNode) {
        return selectedNode.id;
    } else {
        return null;
    }
};
//删除
const onRemoveNode = () => {
    var selectedId = get_selected_nodeid();
    if (!selectedId) {
        ElMessage.warning("请先选择一个节点");
        return;
    }
    jm.value.remove_node(selectedId);
};

// 放大 缩小
const zoomIn = () => {
    if (jm.value && jm.value.view.zoomIn()) {
        isZoomOut.value = false;
    } else {
        isZoomIn.value = true;
    }
};
const zoomOut = () => {
    if (jm.value && jm.value.view.zoomOut()) {
        isZoomIn.value = false;
    } else {
        isZoomOut.value = true;
    }
};

// 鼠标放大缩小
// const handleMouseWheel = (event) => {
//     if (event.deltaY < 0) {
//         zoomIn(); // 向上滚动放大
//     } else {
//         zoomOut(); // 向下滚动缩小
//     }
// };

// 拖拽
// const handleMouseDown = (event) => {
//     isDragging = true;
//       startX = event.clientX;
//       startY = event.clientY;
//       document.addEventListener('mousemove', handleMouseMove);
//       document.addEventListener('mouseup', handleMouseUp);
// };
// const handleMouseMove = (event) => {
//     if (!isDragging) return;
//       const dx = event.clientX - startX;
//       const dy = event.clientY - startY;
//       initialX += dx;
//       initialY += dy;
//       container.value.style.transform = `translate(${initialX}px, ${initialY}px)`;
//       startX = event.clientX;
//       startY = event.clientY;
// };
// const handleMouseUp = () => {
//     isDragging = false;
//     document.removeEventListener('mousemove', handleMouseMove);
//     document.removeEventListener('mouseup', handleMouseUp);
// };

// 保存 需要修改的数据
const save_nodearray_file = () => {
    console.log(jm.value.screenshot, "jm.value>>>>>>>>>>>>.");
};

// 下载
const screen_shot = async () => {
    // const containerElement = document.getElementsByClassName("theme-primary")[0];
    // const containerElement = document.getElementsByClassName("jsmind_container")[0];
    const containerElement = document.getElementById("jsmind_container");
    const canvas = await html2canvas(containerElement);
    const imgData = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = imgData;
    link.download = "mermaid.png";
    link.click();
    console.log(containerElement,'containerElement');

};

// 逻辑
const rendersMind = () => {
    nextTick(() => {
        const container = document.getElementById("jsmind_container");
        container.innerHTML = ''; // 清空容器

        const options = {
            container: "jsmind_container", // 容器的ID
            theme: theme.value,
            editable: true,
            mode: "side", // 显示模式，子节点只分布在根节点右侧
            // menuOpts: {  // 这里加入一个专门配置menu的对象
            //     showMenu: true, //showMenu 为 true 则打开右键功能 ，反之关闭
            //     injectionList: [
            //         { target: 'edit', text: '编辑节点' },
            //         { target: 'delete', text: '删除节点' },
            //         { target: 'addChild', text: '添加子节点' },
            //         { target: 'addBrother', text: '添加兄弟节点' }
            //     ],
            //     style: {
            //         menuItem: {
            //             'line-height': '28px'
            //         }
            //     }
            // },
            view: {
                engine: "canvas", // 思维导图各节点之间线条的绘制引擎
                hmargin: 120, // 思维导图距容器外框的最小水平距离
                vmargin: 50, // 思维导图距容器外框的最小垂直距离
                line_width: 2, // 思维导图线条的粗细
                line_color: "#999", // 思维导图线条的颜色
            },
            layout: {
                hspace: 50, // 节点之间的水平间距
                vspace: 20, // 节点之间的垂直间距
                pspace: 13 // 节点与连接线之间的水平间距（用于容纳节点收缩/展开控制器）
            },
            shortcut: {
                enable: false, // 是否启用快捷键 默认为true
            },
        };

        const mind = props.jsMindObj; //数据渲染
        console.log(mindData.value,'mindData.value');
        // const mind = mindData.value; //数据渲染
        jm.value = new jsMind(options);
        jm.value.show(mind);

        // 自适应
        window.onresize = () => {
            jm.value.resize();
        };
    });
};

// watch(() => props.jsMindObj, (newVal, oldVal) => {
//     if (newVal !== oldVal) {
//         rendersMind();
//         console.log("重新渲染");
//     }
// }, { deep: true });

// 弹窗关闭
const handleDrawerClosed = () => {
    // if (container.value) {
    //     // container.value.removeEventListener("wheel", handleMouseWheel);
    //     // container.value.removeEventListener('mousedown', handleMouseDown);
    // }
//    jm.value.destroy();
    //  jm.value = null;
};

// 打开弹窗
const OpenDrawer = () => {
    drawerVisible.value = true;
};

defineExpose({
    OpenDrawer,
});

onUnmounted(() => {
    handleDrawerClosed(); // 确保在组件卸载时移除事件监听器
});

</script>

<style scoped>
.jsMind_head {
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

:deep(pre.hljs) {
    color: #a9b7c6 !important;
    background: #282b2e !important;
}

:deep(.jsmind-inner) {
    /* overflow-x: clip; */
    /* overflow-x: hidden; */
    position: relative;
    /* display: flex;
    align-items: center;
    justify-content: center; */
}

:deep(.jsmind) {
    position: absolute;
}


:deep(.jsmind-inner::-webkit-scrollbar) {
    width: 6px;
    height: 6px;
}

:deep(.jsmind-inner::-webkit-scrollbar-thumb) {
    background-color: #dddee0;
    border-radius: 5px;
}

:deep(.jsmind-inner::-webkit-scrollbar-thumb) {
    background-color: #dddee0;
    border-radius: 5px;
}

:deep(.jsmind-inner::-webkit-scrollbar-track) {
    background-color: #ffffff;
}

:deep(.jsmind-inner::-webkit-scrollbar-thumb:hover) {
    background-color: rgba(42, 43, 44, 0.3);
}
</style>
