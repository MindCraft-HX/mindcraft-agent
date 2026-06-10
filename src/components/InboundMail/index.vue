<template>
    <div>
      <!-- 公告 -->
      <el-popover placement="bottom" :width="400" trigger="click">
        <template #reference>
          <el-button
            type="primary"
            icon="BellFilled"
            class="BellFilled-button"
            style="width: 38px; height: 38px; font-size: 26px"
            @click="ClickBellFilled"
          ></el-button>
        </template>
        <div class="announcement">公告信息</div>
  
        <div v-if="InMailList_unread?.length > 0">
          <!-- 内容 -->
          <el-scrollbar max-height="200px">
            <div
              class="announcement-content"
              v-for="item in InMailList_unread"
              :key="item.id"
              @mouseover="hoverModel = item.id"
              @mouseleave="hoverModel = null"
              @click="selectInMail(item)"
            >
              <!-- 图标 -->
              <img
                style="height: 15px; width: 15px"
                :src="extractImageUrl(item.alert_other)"
                alt=""
                v-if="extractImageUrl(item.alert_other)"
              />
              <!-- <svg class="icon" aria-hidden="true" style="font-size: 20px" v-if="iconHref(item.alert_type)">
                              <use :xlink:href="iconHref(item.alert_type)"></use>
                          </svg> -->
              <!-- 内容 -->
              <div class="alert_title">
                <div class="alert_title1">{{ item.alert_title }}</div>
                <span class="condition" v-if="!item.alert_is_read"></span>
              </div>
              <div style="color: #dddddd">{{ item.create_time }}</div>
            </div>
          </el-scrollbar>
        </div>
        <div style="text-align: center; padding: 20px 0px" v-else>
          暂时没有信息！！
        </div>
        <div class="allInformation">
          <div
            style="color: #dddddd; cursor: pointer"
            @click="openDialogAnnouncement"
          >
            查看所有信息>
          </div>
        </div>
      </el-popover>
      <!-- 小红 圆圈 -->
      <div class="Total_message" v-if="hintCount > 0">{{ hintCount }}</div>
      <!-- 弹窗 -->
      <el-dialog
        v-model="centerDialogVisible"
        title="公告信息"
        width="700"
        style="text-align: left"
      >
        <div
          style="display: flex; justify-content: space-between"
          v-if="InMailList_all?.length > 0"
        >
          <!-- 左边 -->
          <el-scrollbar max-height="400px">
            <div class="information-left">
              <div
                class="information_sidebar"
                v-for="item in InMailList_all"
                :key="item.id"
                :class="{ active: selectedModel === item.id }"
                @mouseover="hoverModel = item.id"
                @mouseleave="hoverModel = null"
                @click="select_InMail(item)"
              >
                <!-- 图标 -->
                <img
                  style="height: 15px; width: 15px"
                  :src="extractImageUrl(item.alert_other)"
                  alt=""
                  v-if="extractImageUrl(item.alert_other)"
                />
                <!-- 内容 -->
                <div class="information_Title">
                  <div class="information_Title1">{{ item.alert_title }}</div>
                  <span class="condition" v-if="!item.alert_is_read"></span>
                </div>
              </div>
            </div>
          </el-scrollbar>
          <!-- 右边 -->
          <div class="information-right">
            <div style="display: flex; justify-content: space-between">
              <div
                style="
                  display: flex;
                  justify-content: space-around;
                  padding: 10px 10px;
                  width: 260px;
                "
              >
                <!-- 图标 -->
                <img
                  style="height: 15px; width: 15px"
                  :src="extractImageUrl(InMailContent.alert_other)"
                  alt=""
                  v-if="extractImageUrl(InMailContent.alert_other)"
                />
                <!-- <svg class="icon" aria-hidden="true" style="font-size: 20px"
                                  v-if="InMailContent.alert_type == 'notify'">
                                  <use :xlink:href="'#icon-liwu'"></use>
                              </svg>
                              <svg class="icon" aria-hidden="true" style="font-size: 20px"
                                  v-if="InMailContent.alert_type == 'addPoints'">
                                  <use :xlink:href="'#icon-laba'"></use>
                              </svg> -->
                <div class="right_alertTitle" style="width: 200px">
                  {{ InMailContent.alert_title }}
                </div>
              </div>
              <div style="color: #dddddd; padding: 10px 10px">
                {{ InMailContent.create_time }}
              </div>
            </div>
            <!-- 内容 -->
            <!-- border-bottom: 1px solid #e4e5e8; -->
            <el-scrollbar height="338">
              <div
                style="height: 302px; margin: 10px 15px; white-space: pre-wrap"
              >
                {{ InMailContent.alert_content }}
              </div>
            </el-scrollbar>
            <!-- <el-divider /> -->
            <!-- <div style="display: flex; justify-content: center">
                          <el-button type="primary">点击获取</el-button>
                      </div> -->
          </div>
          <!-- <div v-else>请选择邮件！</div> -->
        </div>
        <div v-else style="display: flex; justify-content: center">
          暂时没有信息！！
        </div>
      </el-dialog>
    </div>
  </template>
  
  <script setup>
  import { ref, nextTick, watch, onMounted, computed, onUnmounted } from "vue";
  import { getLboundMail, putAlert } from "../../api/mainActivity/LboundMail.js";
  // import { useMitt } from 'utils/mitt.js';
  import { useMitt } from "../../utils/mitt.js";
  
  const mitt = useMitt();
  
  //  alert_title  create_time  alert_type "notify"  "addPoints" alert_is_read
  
  const centerDialogVisible = ref(false);
  const InMailList_unread = ref([]); //未读
  const hintCount = ref(0);
  const selectedModel = ref(null);
  const hoverModel = ref(null);
  const InMailContent = ref([]);
  
  const InMailList_all = ref([]); //全部消息
  let intervalId = null;
  
  
  const LboundMailList_unread = async () => {
    const read = false;
    const res = await getLboundMail(read);
    InMailList_unread.value = res.data.results;
    hintCount.value = res.data.count;
  };
  
  const checkVisibilityAndFetch = () => {
    if (document.visibilityState === 'visible') {
      LboundMailList_unread();
    }
  };
  
  //停止轮询 clearInterval(intervalId);
  
  mitt.on("clearIntervalMail", () => {
    clearInterval(intervalId);
    console.log(465);
  });
  
  const isProd = computed(() => {
    return window.VITE_NODE_ENV != 'development' && window.VITE_NODE_ENV != 'testing'
  })
  onMounted(() => {
    LboundMailList_unread();
    // LboundMailList_all();
    if(isProd.value) {
        intervalId = setInterval(checkVisibilityAndFetch, 15000);
    }
  });
  
  const LboundMailList_all = async () => {
    const res = await getLboundMail();
    InMailList_all.value = res.data.results;
    // console.log(InMailList_all.value,'InMailList_all.value');
  };
  
  const ClickBellFilled = () => {
    LboundMailList_unread();
    LboundMailList_all();
  };
  
  // 查看所有信息
  const openDialogAnnouncement = () => {
    centerDialogVisible.value = true;
  
    const firstItem = InMailList_all.value[0]; // 获取第一项的id
    // console.log(firstItem);
    // selectedModel.value = firstItemId;
    selectedModel.value = firstItem.id;
    InMailContent.value = firstItem;
  };
  
  const iconHref = computed(() => {
    return (alertType) => {
      switch (alertType) {
        case "notify":
          return "#icon-liwu";
        case "addPoints":
          return "#icon-laba";
        default:
          return ""; // 默认情况或者未知类型
      }
    };
  });
  
  const selectInMail = async (item) => {
    selectedModel.value = item.id;
    InMailContent.value = item;
    try {
      await putAlert(item.id, {
        alert_is_read: true,
      });
  
      LboundMailList_unread();
      LboundMailList_all();
    } catch (error) {
      console.log(error);
    }
    centerDialogVisible.value = true; //打开
  };
  
  // 弹窗点击事件
  const select_InMail = async (item) => {
    selectedModel.value = item.id;
    InMailContent.value = item;
  
    try {
      await putAlert(item.id, {
        alert_is_read: true,
      });
  
      LboundMailList_unread();
      LboundMailList_all();
    } catch (error) {
      console.log(error);
    }
  };
  
  // 方法用于解析 JSON 字符串并提取图片 URL
  function extractImageUrl(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      return parsed.alert_image;
    } catch (e) {
      console.error("Error parsing JSON", e);
      return ""; // 解析失败时返回空字符串
    }
  }
  </script>
  
  <style scoped>
  .announcement {
    border-bottom: 1px solid #dddddd;
    padding: 8px 0px;
    font-size: 16px;
  }
  
  .BellFilled-button {
    position: relative;
  }
  
  .Total_message {
    position: absolute;
    top: 5px;
    right: 5px;
    background: red;
    height: 14px;
    width: 14px;
    border-radius: 50%;
    font-size: 9px;
    color: white;
  }
  
  :deep(.el-dialog__header) {
    border-bottom: 1px solid rgb(221, 221, 221);
    margin-left: 16px;
  }
  
  .information-left {
    width: 200px;
    height: 400px;
    /* background: red; */
  }
  
  .information-right {
    width: 450px;
    /* background: yellow; */
    border: 1px solid #c0c4cc;
    border-radius: 10px 10px;
  }
  
  .announcement-content {
    display: flex;
    justify-content: space-around;
    align-items: center;
    padding: 12px 0px;
    border-bottom: 1px solid #dddddd;
    cursor: pointer;
    transition: background-color 0.3s ease;
  }
  
  .announcement-content:hover {
    background-color: #f5f7fa;
    /* 鼠标悬停时的背景颜色 */
  }
  
  .announcement-content.active {
    background-color: #cde5ff;
    color: #419eff;
    /* 选中时的背景颜色 */
  }
  
  .alert_title {
    display: flex;
    align-items: center;
    width: 120px;
    /* white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: inline; */
  }
  
  .alert_title1 {
    display: flex;
    align-items: center;
    width: 120px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: inline;
  }
  
  .condition {
    background: red;
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    margin-left: 3px;
  }
  
  .scrollbar-demo-item {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 50px;
    margin: 10px;
    text-align: center;
    border-radius: 4px;
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }
  
  .information_Title {
    display: flex;
    align-items: center;
    width: 164px;
    /* white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: inline; */
  }
  .information_Title1 {
    display: flex;
    align-items: center;
    width: 164px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: inline;
  }
  
  .information_sidebar {
    display: flex;
    justify-content: space-around;
    padding: 10px 0px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: background-color 0.3s ease;
  }
  
  .information_sidebar:hover {
    background-color: #f5f7fa;
    /* 鼠标悬停时的背景颜色 */
  }
  
  .information_sidebar.active {
    background-color: #ecf5ff;
    color: #419eff;
    /* 选中时的背景颜色 */
  }
  
  .right_alertTitle {
    width: 150px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: inline;
  }
  .allInformation {
    display: flex;
    justify-content: flex-end;
    padding: 15px 0px 8px 0px;
  }
  </style>
  