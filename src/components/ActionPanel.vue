<template>
  <div class="chat-headers">
    <!-- <div style="margin-right: 20px">
      <el-button type="primary" plain @click="openNewWindow" icon="Brush">画布</el-button>
    </div> -->
    <!-- 清空 -->
    <div>
      <el-button class="chat-header-button" type="primary" plain @click="triggerDeleteHistory" icon="BrushFilled">
        清空
      </el-button>
    </div>
    <!-- 收藏 -->
    <!-- <div style="margin-right: 20px">
      <el-button class="chat-header-button" type="primary" plain icon="Star" @click="drawerClick">
        收藏
      </el-button>
    </div> -->
    <!-- 总结 -->
    <!-- <div style="margin-right: 5px">
      <el-button class="chat-header-button" type="primary" plain icon="List" @click="showRecord">
        总结
      </el-button>
    </div> -->
    <el-dropdown style="margin-left: 10px;" placement="top" :hide-on-click="false">
      <span class="el-dropdown-link">
        <el-button>
          更多功能<el-icon class="el-icon--right"><arrow-down /></el-icon>
        </el-button>
      </span>
      <template #dropdown>
        <el-dropdown-menu>
          <!-- 画布 -->
          <el-dropdown-item>
            <div>
              <el-button class="chat-header-button" type="primary" plain icon="Star" @click="drawerClick" style="width: 105px;">
                收藏
              </el-button>
            </div>
          </el-dropdown-item>
          <!-- 联网 -->
          <el-dropdown-item>
            <div>
              <el-button class="chat-header-button" type="primary" plain icon="List" @click="showRecord" style="width: 105px;">
                总结
              </el-button>
            </div>
          </el-dropdown-item>

          <el-dropdown-item>
            <div>
              <el-button type="primary" plain @click="openNewWindow" style="width: 105px;">
                <div style="margin-right: 8px; font-size: 16px" class="mindcraft-flow-win-iconfont mindcraft-flow-win-iconfont-ordinary icon-mindcraft-huaban"></div>
                画布
              </el-button>
            </div>

          </el-dropdown-item>

          <el-dropdown-item>
            <div>
              <el-button  :type="+mdRenderTypeCom ? 'primary': 'success'" effect="plain" plain @click="mdRenderTypeCom = +!mdRenderTypeCom" icon="Switch" style="width: 105px;">
                {{ mdRenderList[mdRenderTypeCom] }}
              </el-button>
            </div>

          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>




    <!-- 收藏弹窗 -->
    <el-drawer v-model="drawer" title="收藏" size="600px">
      <template #header>
        <h4 style="
            border-bottom: 1px solid #e8eaea;
            line-height: 50px;
            color: #000000;
          ">
          收藏
        </h4>
      </template>
      <div class="form-select">
        <el-input placeholder="请输入关键字" style="margin-right: 7px" @change="collectKeywordSearch"
          v-model="collectKeyword" @clear="clearSearch" @keyup.enter.exact="collectKeywordSearch">
          <template #append>
            <el-button :style="{ backgroundColor: '#409EFF', color: '#FFFFFF' }" type="primary" :icon="Search"
              @click="collectKeywordSearch" />
          </template>
        </el-input>
        <div class="form-title">关联对话</div>
        <el-select clearable placeholder="请选择" v-model="selectedItem" @change="SelectClick">
          <el-option v-for="item in FavoriteList" :key="item.id" :label="item.related_room" :value="item" />
        </el-select>
      </div>

      <!-- 折叠 -->
      <div v-if="FavoriteList.length > 0">
        <el-collapse class="collapse-header" @change="handleCollapse(item)" v-for="item in FavoriteList" :key="item.id"
          v-show="shouldShowRoom(item)">
          <div style="
              display: flex;
              justify-content: space-between;
              margin-top: 5px;
            ">
            <div
              style="color: #000;width: 150px;white-space: nowrap;overflow: hidden;text-overflow: ellipsis;display: inline;">
              {{ item.title }}</div>
            <div>
              <el-button type="primary" icon="Document" size="small" @click="revampCollect(item)">修改</el-button>
              <!-- <el-button type="primary" icon="MessageBox" size="small" @click="addPromptTemplate(item)">添加指令</el-button> -->
              <el-popconfirm @confirm="addPromptTemplate(item)" :icon="InfoFilled" title="确定添加标准指令吗?"
                confirm-button-text="确定" cancel-button-text="取消">
                <template #reference>
                  <el-button type="primary" icon="MessageBox" size="small">添加为预设指令</el-button>
                </template>
              </el-popconfirm>

              <el-button type="primary" size="small" icon="DocumentCopy" @click="copyMessage(item)">复制</el-button>
              <el-popconfirm @confirm="DeleteCollect(item.id)" :icon="InfoFilled" title="确定删除吗?"
                confirm-button-text="确定" cancel-button-text="取消">
                <template #reference>
                  <el-button type="danger" icon="Delete" size="small">删除</el-button>
                </template>
              </el-popconfirm>
            </div>
          </div>
          <div class="collapse-content" v-show="item.showContent">
            {{ item.message }}
          </div>
          <el-collapse-item>
            <!-- 进行md文档格式 -->
            <!-- <div> {{ item.message }} </div> -->
            <div class="TEST_" v-html="renderHtml(item.message)"></div>

            <!-- <el-image v-for="(image, index) in JSON.parse(item.image)" :key="index" :src="image" alt="item"
              :preview-src-list="JSON.parse(item.image)" style="max-width: 400px; max-height: 400px"></el-image> -->

              <div v-for="(file, index) in fileList(item)" :key="index">
              <template v-if="isImage(file)">
                <el-image :src="file" alt="Image" style="max-width: 500px; max-height: 500px" fit="cover"
                  :preview-src-list="[file]" :initial-index="index" />
              </template>
              <template v-else-if="isVideo(file)">
                <video preload="meta" style="width: 500px; height: 370px;" controls :src="file"></video>
              </template>

            </div>



            <div v-for="chart in item.chart_code" :key="chart.chart_code">
              <agent_ECharts v-if="chart.chart_type === 'ECharts'" :messages_ECharts="chart" />
            </div>
          </el-collapse-item>
          <!-- 时间 -->
          <div>
            {{ item.created_at }}
          </div>
        </el-collapse>
      </div>
      <div v-else>
        <div style="text-align: center; font-size: 18px">暂时没有收藏！</div>
      </div>
      <!-- 行不通 -->
      <!-- <div v-if="FavoriteList.value === 0">
        <div>没有找到相关内容</div>
      </div> -->
      <!-- 点击修改界面 -->
      <el-dialog v-model="dialogVisible5" title="修改" width="30%" :before-close="handleClose">
        <div>
          <div>
            <div style="margin-bottom: 5px">标题:</div>
            <el-input placeholder="标题" v-model="updateData.title" />
          </div>
          <div>
            <div style="margin-bottom: 5px; margin-top: 5px">内容:</div>
            <el-input :rows="5" type="textarea" placeholder="内容" v-model="updateData.message" />
          </div>
        </div>
        <template #footer>
          <span class="dialog-footer">
            <el-button type="primary" @click="updateSaveHandle()">确定</el-button>
            <el-button type="danger" @click="dialogVisible5 = false">
              取消
            </el-button>
          </span>
        </template>
      </el-dialog>
    </el-drawer>

    <!-- 总结弹窗 -->
    <el-dialog v-model="dialogVisible" title="总结" width="40%" :before-close="handleClose" style="color: #010101">
      <span class="dialog-span">您是否需要对刚刚的问答内容进行总结？</span>
      <!-- 内容 -->
      <div style="margin-top: 10px">
        <span style="color: #cccccc; margin-bottom: 10px">总结提示词</span>
        <el-input v-model="SummarizeContent" :autosize="{ minRows: 2, maxRows: 4 }" type="textarea"
          placeholder="请总结以上内容" style="margin-top: 5px" />
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button type="primary" size="small" @click="onConfirm">
            确定
          </el-button>
          <el-button type="danger" size="small" @click="cancelSummary">取消</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, inject, onMounted, nextTick, computed } from "vue";
import { ElMessage } from "element-plus";
import { Search } from "@element-plus/icons-vue";
// import api from "@/utils/request";
import { InfoFilled } from "@element-plus/icons-vue";
import { renderHtml } from "@/utils/MarkdownIt";
import {
  getFavoriteMessages,
  putFavoriteMessages,
  removeFavoriteMessages,
  addInstructionPrompt,
} from "@/api/mainActivity/ActionPanel";
import { useMitt } from "../utils/mitt";
import { userInstructionContentStore } from "../stores/InstructionContent";
import applicationCanvas from "../components/applicationCanvas/index.vue";
import { useRouter } from "vue-router";
import agent_ECharts from "./agent_chart/agent_ECharts.vue";

const isWIN = computed(() => {
    return window.VITE_NODE_PLATFORM != 'IOS'
})

const router = useRouter();

const mitt = useMitt();
const InstructionContentStore = userInstructionContentStore();

// const openNewWindow = () => {
//   window.electronAPI.openCanvasWindow();
//   // router.push({ name: "ApplicationCanvas" });
// }

// const collapseContent = ref(true);
// const copyShowMessage = ref(false);
const dialogVisible5 = ref(false);
const drawer = ref(false); //抽屉的状态
const emit = defineEmits([
  "deleteChatHistory",
  "onDrawerHandle",
  "change",
  "openPrompt",
  "update:mdRenderType"
]); //chat传递过来deleteChatHistory函数
const props = defineProps({
  id: {
    type: String,
  },
  mdRenderType: {
    type: String || Number,
  },
});

const onConfirm = () => {
  emit("change");
};

// 总结******
const dialogVisible = ref(false); //弹窗状态
const SummarizeContent = ref("");

//打开
const showRecord = () => {
  dialogVisible.value = true;
  SummarizeContent.value = "请总结以上内容";
};

//弹窗取消
const cancelSummary = () => {
  SummarizeContent.value = "";
  dialogVisible.value = false;
};

// 关闭弹窗
const handleClose = (done) => {
  SummarizeContent.value = "";
  done();
};

function parseOtherConfig(config) {
  if (!config) {
    return [];
  }
  try {
    const parsedConfig = JSON.parse(config);
    return Array.isArray(parsedConfig) ? parsedConfig : [];
  } catch (error) {
    console.error("解析other_config失败:", error);
    return [];
  }
}

const openNewWindow = () => {
  // window.electronAPI.openPaint();
  // router.push({ name: "ApplicationCanvas" });
  // window.location.href = "https://www.mindcraft.com.cn/tldraw"
  window.electronAPI.openDrawWin()
};

// 收藏
const FavoriteList = ref([]); //渲染的列表
const selectedItem = ref(null); // 下拉框
const collectKeyword = ref(""); // 关键字搜索
const copyContent = ref(""); // 复制的内容
const chartAll = ref([]);

const fileList = (item) => {
    let list = []
    try {
        list = JSON.parse(item.image)
    } catch (error) {
        console.log(error, item)
        list.push(item.image)
    }
    return list
}

onMounted(() => { });

const triggerDeleteHistory = async () => {
  emit("deleteChatHistory");
};
/**收藏**************************************************************************************************** */
const searchKeyword = ref("");
const selectedRoomId = ref(null);

const collectKeywordSearch = () => {
  searchKeyword.value = collectKeyword.value.toLowerCase();
};

const SelectClick = (selectedItem) => {
  selectedRoomId.value = selectedItem.id;
  selectedItem.value = selectedItem;
};

const shouldShowRoom = (item) => {
  const matchKeyword = searchKeyword.value
    ? item.title.toLowerCase().includes(searchKeyword.value) ||
    item.message.toLowerCase().includes(searchKeyword.value)
    : true;
  const matchRoom = selectedRoomId.value
    ? item.id === selectedRoomId.value
    : true;
  return matchKeyword && matchRoom;
};

// 清除搜索
const clearSearch = () => {
  collectKeyword.value = "";
};

//点击打开 请求回来的数据
const drawerClick = async () => {
  try {
    drawer.value = true;
    const response = await getFavoriteMessages();
    if (response.status === 200) {
      // console.log(response.data, "response>>>>>>>>>>>>>>>>>>>>>...");
      FavoriteList.value = response.data.map((item) => {
        item.show = true; //手动添加字段 用于做显示判断
        // item.originalTitle = item.title; //手动添加字段 用于做显示判断
        item.chart_code = JSON.parse(item.other_config);
        item.showContent = true;
        item.copyShowMessage = false;
        return item;
      });
      // console.log(FavoriteList.value, "FavoriteList.value");
    }
  } catch (error) {
    console.log(error);
  }
};

// 获取折叠函数
const handleCollapse = (val) => {
  if (val.chart_code.length > 0) {
    console.log('进来了');
    nextTick(() => {
      //点击重新渲染表格
      mitt.emit('openAgent_ECharts');
      mitt.emit('initializeMarkmap');
      mitt.emit('openAgent_Mermaid');
    });
  }
  const selectedItemIndex = FavoriteList.value.findIndex(
    (item) => item.id === val.id
  );
  const selectedItem = FavoriteList.value[selectedItemIndex];
  if (selectedItem) {
    if (selectedItem.show) {
      // 如果展开时，重置标题为原始标题
      selectedItem.showContent = false;
      selectedItem.copyShowMessage = true;
      selectedItem.show = false;
    } else {
      // 如果收起时，将标题设为 created_at，并标记为展开
      selectedItem.showContent = true;
      selectedItem.copyShowMessage = false;
      selectedItem.show = true;
      FavoriteList.value = FavoriteList.value.map((item) => {
        item.show = true; // 重置为初始状态
        item.showContent = true;
        return item;
      });
    }
  } else {
  }
};

// 删除函数
const DeleteCollect = async (id) => {
  //   console.log(id);
  try {
    await removeFavoriteMessages(id);
    ElMessage.success("删除成功");
    drawerClick();
  } catch (error) {
    console.log(error);
    ElMessage.error("删除失败");
  }
};
// 修改函数
const updateData = ref({});
const revampCollect = async (list) => {
  updateData.value = list;
  dialogVisible5.value = true;
};
// 添加到预设指令
const addPromptTemplate = async (item) => {
  // const formDate ={
  // prompt_name:item.title,
  // standard_prompt:item.message,
  // prompt_type: 'standard',
  // is_shared: false,
  // llm_temperature: 20,
  // llm_temperature_label: 0.2,
  // }
  try {
    InstructionContentStore.setContent(item.message);
    // await addInstructionPrompt({...formDate})
    // ElMessage.success("添加成功");
    drawer.value = false;
    emit("openPrompt"); // 打开预设指令
    nextTick(() => {
      mitt.emit("changeTabs"); // 打开添加页面
    });
  } catch (error) {
    console.log(error);
    ElMessage.error("添加失败");
  }
};

// 复制函数
const copyMessage = async (item) => {
  // copyContent.value = item.message;
  try {
    await navigator.clipboard.writeText(item.message);
    ElMessage.success("已复制到剪贴板");
  } catch (error) {
    ElMessage.error("复制失败");
    console.error("复制失败:", error);
  }
};
// 弹窗确定
const updateSaveHandle = async () => {
  // console.log("updateData", updateData.value);
  try {
    await putFavoriteMessages(updateData.value.id, {
      title: updateData.value.title,
      related_room: updateData.value.related_room,
      message: updateData.value.message,
    });

    dialogVisible5.value = false;
    ElMessage.success("修改成功");
  } catch (error) {
    ElMessage.error("修改失败");
  }
};

function isImage(file) {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
  const extension = file.split('.').pop().toLowerCase();
  return imageExtensions.includes(extension);
}
function isVideo(file) {
  const videoExtensions = ['mp4', 'webm', 'ogg'];
  const extension = file.split('.').pop().toLowerCase();
  return videoExtensions.includes(extension);
}

const mdRenderTypeCom = computed({
  get: () => props.mdRenderType,
  set: (val) => emit("update:mdRenderType", val),
})
const mdRenderList = ["Markdown", "MD+Katex"];


defineExpose({
  dialogVisible,
  SummarizeContent,
});
</script>

<style scoped>
* {
  margin: 0;
  /* padding: 0; */
}

.chat-headers {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* margin-left: 10vw; */
}

.collapse-header {
  border: 1px solid #ededed;
  border-radius: 10px;
  padding: 5px;
  margin-bottom: 10px;
  padding: 5px 10px;
}

:deep(.el-collapse-item__header) {
  border-bottom: none;
}

:deep(.el-collapse.el-collapse-item__content.el-collapse-border-color) {
  border-color: #ffffff !important;
  /* border: #ffffff; */
}

.form-select {
  display: flex;
  margin-left: auto;
  margin-bottom: 20px;
  width: 390px;
}

.form-title {
  width: 80px;
  margin: auto;
  margin-right: 3px;
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

:deep(.el-collapse-item__wrap) {
  border: none;
}

:deep(.el-collapse-item__header) {
  height: 30px;
}

.collapse-content {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
  /* margin-bottom: 5px; */
}

:deep(.TEST_ table) {
  width: 100%;
  border-collapse: collapse;
  text-align: center;
}

:deep(.TEST_ th) {
  border: 1px solid #ccc !important;
  padding: 8px;
  text-align: center;
}

:deep(.TEST_ td) {
  border: 1px solid #ccc !important;
  padding: 8px;
  text-align: center;
}

:deep(.TEST_ tr:nth-child(even)) {
  background-color: #f2f2f2;
}

:deep(.TEST_ tr:nth-child(odd)) {
  background-color: #ffffff;
}
</style>
