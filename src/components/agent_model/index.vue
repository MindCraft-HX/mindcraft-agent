<template>
  <el-popover placement="top-start" :width="750" trigger="click">
    <template #reference>
      <el-button style="margin-right: 16px; width: 200px" @click="onChangeHandle" class="llmModel_button">
        <img style="height: 15px; width: 15px" src="../../../public/logo-html.png" alt="" />
        智酱0.1.0</el-button>
    </template>
    <div>
      <el-tabs v-model="activeNameModel" type="border-card" class="demo-tabs" style="height: 300px"
        @tab-click="onTabChange">
        <el-tab-pane v-for="(item, index) in modelListAll" :key="item.id" :label="item.id" :name="item.model_brand">
          <template #label>
            <img style="height: 24px; width: 24px" src="../../../public/logo-html.png" alt="" />
          </template>
          <div style="display: flex; justify-content: space-between">
            <el-scrollbar max-height="261px">
              <div style="width: 448px">
                <div class="divDom" :class="{ active: selectedModel === model.id }" @mouseover="hoverModel = model.id"
                  @mouseleave="hoverModel = null" @click="selectModel(model.id, model)" style="
                      height: 50px;
                      display: flex;
                      align-items: center;
                      margin: 5px 0px;
                    " v-for="model in item.model_list" :key="model.id">
                  <img style="height: 25px; width: 61px; margin-left: 5px" :src="item" v-for="item, index in model.model_tag_images" :key="index" alt="" />
                  <div style="
                        margin: 0px 15px;
                        font-size: 18px;
                        font-weight: 600;
                        color: #000;
                      ">
                    {{ model.model_name }}
                  </div>
                  <el-tag style="margin-right: 5px" effect="dark" type="danger" size="small">识图</el-tag>
                  <el-tag style="margin-right: 5px" effect="dark" type="danger" size="small">画图</el-tag>
                  <el-tag style="margin-right: 5px" effect="dark"  size="small">图表生成</el-tag>
                  <el-tag style="margin-right: 5px" effect="dark" type="success" size="small">联网</el-tag>
                </div>
              </div>
            </el-scrollbar>
            <div class="modelDetails" style="white-space: pre-wrap">
              <div style="
                    height: 30px;
                    width: 200px;
                    position: relative;
                    display: flex;
                    justify-content: center;
                    margin-bottom: 20px;
                  ">
                <div class="model_title">
                  <img style="height: 15px; width: 15px" src="../../../public/logo-html.png" alt="" />
                  智酱0.1.0
                  <!-- {{ modelTitle }} -->
                </div>
              </div>
              <el-scrollbar max-height="230px" style="display: flex; justify-content: center">
                <div>
                  <div class="features_content">
                    <!-- {{ formattedModelContent(model_content) }} -->
                    {{ modelTitle }}
                  </div>
                </div>
              </el-scrollbar>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </el-popover>
</template>

<script setup>
import {
  ref,
  onMounted,
  nextTick,
  computed,
  provide,
  watch,
  reactive,
  inject,
} from "vue";


const activeNameModel = ref("智匠-智能体");
// const modelListAll = ref([]);

// 模型选中逻辑
const selectedModel = ref("384");
const hoverModel = ref(null);
const model_content = ref("");
const modelTitle = ref("泛用性AI智能体,具有联网，识图，画图，表格生成等能力");

// 模拟两条数据
const modelListAll = ref([
  {
    "image_url": "../../../public/logo-html.png",
    "model_list": [
      {
        "id": "384",
        "model_name": "智酱0.1.0",
        "model_type": "message",
        "model_config": {},
        "model_tag_images": [],
        "model_content":"泛用性AI智能体,具有联网，识图，画图，表格生成等能力",
      },
    ],
    "model_brand": "智匠-智能体"
  }
]);

const TitleIconHref = computed(() => {
  const foundModel = modelListAll.value.find((model) =>
    model.model_list.some(
      (subModel) => subModel.model_config.chat_brand === modelTitle.value
    )
  );
  // 如果找到了匹配的模型，返回其image_url
  if (foundModel) {
    return foundModel.image_url;
  }
});

const onChangeHandle = () => { }
const onTabChange = () => { }
const selectModel = (id,item) => {
  selectedModel.value = id;
  console.log(id,'id');
  console.log(item,'item');
 }

</script>

<style scoped>
.divDom {
  transition: background-color 0.3s ease;
  cursor: pointer;
}

.divDom:hover {
  background-color: #f5f7fa;
  /* 鼠标悬停时的背景颜色 */
}

.divDom.active {
  background-color: #cde5ff;
  color: #419eff;
  /* 选中时的背景颜色 */
}

.modelDetails {
  width: 220px;
  height: 261px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  background: #f5f7fa;
  padding: 0px 24px;
  position: relative;
}

.model_title {
  position: absolute;
  top: 4px;
  /* left: 0px; */
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
}

:deep(.llmModel_button > span) {
  height: 18px;
  width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline;
}

.features_content {
  color: #419eff;
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 8px;
  /* width: 220px; */
}

:deep(.el-tabs--border-card > .el-tabs__content) {
  padding: 0px;
}
</style>
