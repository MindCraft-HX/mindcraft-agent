<template>
  <div class="model-list-menu">
    <el-tabs
      v-model="activeNameModel"
      type="border-card"
      class="demo-tabs"
      style="height: 300px; max-height: 35vh"
      @tab-click="onTabChange"
    >
      <el-tab-pane
        v-for="(item, index) in modelListAll"
        :key="item.id"
        :label="item.id"
        :name="item.model_brand"
      >
        <!-- 图标 -->
        <template #label>
          <img style="height: 18px; width: 22px" :src="item.image_url" alt="" />
        </template>
        <!-- 内容 -->
        <div style="display: flex; justify-content: space-between">
          <el-scrollbar height="261px" max-height="30vh" style="flex: 1">
            <div style="width: 100%; min-width: fit-content;">
              <div
                class="divDom"
                :class="{ active: selectedModel === model.id }"
                @mouseover="hoverModel = model.id"
                @mouseleave="hoverModel = null"
                @click="selectModel(model.id, model)"
                style="
                  height: 50px;
                  display: flex;
                  align-items: center;
                  margin: 5px 0px;
                "
                v-for="model in item.model_list"
                :key="model.id"
              >
                <img
                  style="height: 25px; width: 61px; margin-left: 5px"
                  :src="item" v-for="item, index in model.model_tag_images" :key="index"
                  alt=""
                />
                <div
                  style="
                    margin: 0px 15px;
                    font-size: 18px;
                    font-weight: 600;
                    color: #000;
                    white-space: nowrap;
                  "
                >
                  {{ model.model_name }}
                </div>
                <el-tag
                  style="margin-right: 5px"
                  effect="dark"
                  size="small"
                  v-if="model.model_config.model_features.text_generation"
                  >文本</el-tag
                >
                <el-tag
                  style="margin-right: 5px"
                  effect="dark"
                  type="danger"
                  size="small"
                  v-if="model.model_config.model_features.image_recognition"
                  >识图</el-tag
                >
                <el-tag
                  style="margin-right: 5px"
                  effect="dark"
                  type="info"
                  size="small"
                  v-if="model.model_config.model_features.video_recognition"
                  >视频识别</el-tag
                >
                <el-tag
                  style="margin-right: 5px"
                  effect="dark"
                  type="success"
                  size="small"
                  v-if="model.model_config.model_features.max_tokens !== ''"
                  >{{ model.model_config.model_features.max_tokens }}</el-tag
                >
                <el-tag
                  style="margin-right: 5px"
                  effect="dark"
                  type="danger"
                  size="small"
                  v-if="model.model_config.model_features.image_generation"
                  >文生图</el-tag
                >
                <!-- <el-tag style="margin-right: 5px" effect="dark" type="info" size="small" v-if="model.model_config.model_features
.model_max_tokens
">{{ model.model_config.model_features.model_max_tokens }}</el-tag> -->
              </div>
            </div>
          </el-scrollbar>
          <!-- 右边内容 -->
          <div class="modelDetails" style="white-space: pre-wrap">
            <div
              style="
                height: 30px;
                width: 200px;
                position: relative;
                display: flex;
                justify-content: center;
                margin-bottom: 20px;
              "
            >
              <div class="model_title">
                <img
                  style="height: 15px; width: 15px"
                  :src="TitleIconHref"
                  alt=""
                />
                {{ modelTitle }}
              </div>
            </div>
            <el-scrollbar
              max-height="230px"
              style="display: flex; justify-content: center"
            >
              <div>
                <div class="features_content">
                  {{ formattedModelContent(model_content) }}
                </div>
                <div
                  class="features_content"
                  v-if="
                    model_features_content.max_tokens !== '' && content_show
                  "
                >
                  功能：{{ model_features_content.model_traits }}
                </div>
                <div
                  class="features_content"
                  v-if="
                    model_features_content.max_tokens !== '/' && content_show
                  "
                >
                  最大上下文(Tokens)：{{ model_features_content.max_tokens }}
                </div>
                <div
                  class="features_content"
                  v-if="model_features_content.max_tokens !== 0 && content_show"
                >
                  输入价格(积分/K tokens):{{ model_features.prompt_cost }}
                </div>
                <div
                  class="features_content"
                  v-if="model_features_content.max_tokens !== 0 && content_show"
                >
                  输出价格(积分/K tokens):{{ model_features.completion_cost }}
                </div>
                <div
                  class="features_content"
                  v-if="
                    model_features_content.max_tokens !== '/' && content_show
                  "
                >
                  Token汇率：{{ model_features_content.token_rate }}
                </div>
              </div>
            </el-scrollbar>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
const props = defineProps(["modelName", "modelList", "filterAtr"]);
const emit = defineEmits([
  "update:modelName",
  "update:modelList",
  "changeModel",
]);
import { getModel_list_new } from "../api/mainActivity/chat";
const activeNameModel = ref("");
const modelListAll = ref([]);
// 模型种类
const getModelList = async () => {
  if (props.modelList.length > 0) {
    modelListAll.value = JSON.parse(JSON.stringify(props.modelList));
  } else {
    const res = await getModel_list_new();
    modelListAll.value = res.data;
    emit("update:modelList", modelListAll.value);
  }
  // console.log(modelListAll.value, 'modelListAll.value');
  modelListAll.value = modelListAll.value
    .map((item) => {
      if (props.filterAtr) {
        item.model_list = item.model_list.filter(
          (model) => model?.model_config?.model_features?.[props.filterAtr]
        );
      }
      item.model_list.map((model) => {
        if (model.model_name === props.modelName) {
          activeNameModel.value = item.model_brand;
          content_show.value = true;
          selectedModel.value = model.id;
          model_content.value = model.model_config.model_content;
          model_features_content.value =
            model.model_config.model_features_content;
          model_features.value = model.model_config.model_features;
          modelTitle.value = item.model_brand;
          // selectModel(model.id, model)
        }
      });
      return item;
    })
    .filter((item) => item.model_list.length > 0);
};
defineExpose({ getModelList });

// 模型选中逻辑
const selectedModel = ref(null);
const hoverModel = ref(null);
const model_content = ref("");
const modelTitle = ref("");
// 内容
const model_features_content = ref({});
const model_features = ref({});
const content_show = ref(true);

// 选中
const selectModel = (modelId, model) => {
  content_show.value = true;
  selectedModel.value = modelId;
  // llm_model.value = model.model_name;
  emit("update:modelName", model.model_name);
  emit("changeModel", model.model_name);

  //内容
  model_content.value = model.model_config.model_content;
  // console.log(model.model_config.model_features_content,'model>>>>>>>>>>>>.');
  model_features_content.value = model.model_config.model_features_content;
  model_features.value = model.model_config.model_features;
};
const onTabChange = (tab) => {
  // console.log(tab, 'tab');
  modelTitle.value = tab.props.name;
  model_content.value = "";
  model_features_content.value = {};
  model_features.value = {};
  content_show.value = false;
};

const formattedModelContent = (text) => {
  return text.replace(/-/g, "");
};
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
</script>

<style lang="scss" scoped>
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
  max-height: 30vh;
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