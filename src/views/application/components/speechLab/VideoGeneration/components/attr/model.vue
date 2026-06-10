<template>
  <el-row class="attr-content" align="middle">
    <el-col :span="6" class="attr-name">{{ paramsItem.title }}</el-col>
    <el-col :span="18">
      <el-popover placement="bottom" :width="800" trigger="click">
        <template #reference>
          <el-button class="attr-cascader">
            <div class="attr-model-name">
              <template v-if="value">
                <el-image
                  :src="modelImage?.image"
                  style="height: 24px; margin-right: 5px; flex-shrink: 0"
                  fit="contain"
                ></el-image><span style="margin-left: 5px">{{ value }}</span>
              </template>
              <template v-else>
                <span style="color: #d3d3d3">{{ paramsItem.description }}</span>
              </template>
            </div>
            <el-icon style="margin-left: 5px"><ArrowDown /></el-icon>
          </el-button>
        </template>
        <div class="model-list">
          <el-cascader-panel class="cascader-panel" :placeholder="paramsItem.description"
            :props="{ expandTrigger: 'hover' }" :options="options" v-model="moduleValue"
            :show-all-levels="false" popper-class="popper-select" @change="changeValue">
            <template #default="{ node, data }">
              <div>
                <div v-if="!node.isLeaf" style="display: flex;align-items: center;">
                  <el-image :src="data.image" style="height: 24px; margin-right: 5px; flex-shrink: 0"></el-image>
                  <div>{{ data.label }}</div>
                </div>
                <div v-else>
                  <div v-if="node.checked" class="check-icon"><el-icon :size="16"><SuccessFilled /></el-icon></div>
                  <div>{{ data.label }}</div>
                  <div v-show="data.detail.model_tags" style="margin-top: 2px;">
                    <el-tag class="model-tag"  disable-transitions style="margin-right:5px; pointer-events: none;border:none;--el-tag-border-color:#ffffff;" effect="dark"
                      v-for="(item, index) in data.detail.model_tags" :key="`${data.value}-${index}`"
                      :color="colorList[item]||'#CDD0D6'" >{{ item }}</el-tag>
                  </div>
                </div>
              </div>
            </template>
          </el-cascader-panel>
          <div class="model-info" v-if="modelInfo">
            <div style="justify-content: center">
              <el-image :src="modelImage.image" style="height: 24px; margin-right: 5px; flex-shrink: 0"
                fit="contain"></el-image>
              <div>{{ modelInfo?.model }}</div>
            </div>
            <div style="margin:10px 0 ">
            </div>
            <div v-html="modelInfo.model_content"></div>
            <div>价格： {{ modelInfo.model_price }} 积分 / 次</div>
          </div>
        </div>
      </el-popover>
    </el-col>
  </el-row>
</template>

<script setup>
import { computed, nextTick, ref } from "vue";
const props = defineProps(["list", "paramsItem", "value", "category"]);
const emit = defineEmits(["update:value", "update:category", "changeModel", "change"]);
const colorList = 
  {
  '文生图': '#409eff',
  '图片编辑':'#67c23a',
  '首帧':'#e6a23c',
  '文生视频':'#f56c6c',
  '主体参考':'#ef9f9f',
  '视频编辑':'#626aef'
  }
const moduleValue = computed({
  get() {
    return props.value
  },
  set(val) {
    emit('update:value', val[1])
  }
})
// 计算出树形结构
const options = computed(() => {
  return props.list.reduce((pre, cur) => {
    //  是否有同brand，没有则创建新的，否则使用旧的
    const index = pre.findIndex(e => e.value === cur.brand)
    let curRes = index >= 0 ? pre[index] : {
      children: []
    }
    const { brand, extra_data: { image_url, model_list }, params_list, category } = cur
    const modelList = params_list[0].dataRange.map(e => {
      let res = {}
      res.model_name = e.value
      res.category = category
      res.label = e.name
      res.value = e.value
      res.detail = model_list[e.value]
      return res
    })
    const children = curRes.children || []
    children.push(...modelList)
    curRes = { label: brand, value: brand, image: image_url, children: children }
    if (index >= 0) {
      pre[index] = curRes
    } else {
      pre.push(curRes)
    }
    return pre
  }, [])
});
const modelImage = computed(() => {
  return options.value.find((item) => item.children.some((item1) => item1.value === props.value));
});

const modelInfo = ref(null)

const getModelInfo = (model) => {
  for (let i = 0; i < options.value.length; i++) {
    let res = options.value[i]?.children.find(e => e.value === model)
    if (res) {
      modelInfo.value = res.detail
      break;
    }
  }
};

getModelInfo(props.value)
const changeValue = (val) => {
  if (val.length !== 2) {
    return
  }
  const [brand, model] = val;
  moduleValue.value = val
  getModelInfo(model)
  nextTick(() => {
    emit("change", model);
  })

};
</script>
<style  lang="scss">
.cascader-panel {
  li[aria-haspopup="true"] {
    .el-radio {
      display: none;
    }
  }
}
</style>

<style lang="scss" scoped>

:deep(.el-cascader-node>.el-checkbox, .el-cascader-node>.el-radio) {
  display: none;
}

:deep(.el-cascader-menu:last-child .el-cascader-node) {
  height: 54px;
  line-height: 16px;

  .el-radio {
    width: 100%;
    height: 100%;
    z-index: 10;
    position: absolute;
    top: 0px;
    left: 10px;
  }
}
:deep(.el-cascader-node__prefix){
  display: none;
}
.check-icon{
  position: absolute;
  left: 8px;
  top: 40%;
  color: #67c23a;
  font-size: 16px;
}

.attr-content {
  width: 90%;
  margin: 0 auto;
  margin-bottom: 12px;

  .attr-name {
    font-weight: bold;
    font-size: 16px;
    color: #000000;
  }

  .attr-cascader {
    width: 222px;
    max-width: 100%;
    height: 35px;
    background: #ffffff;
    border-radius: 8px 8px 8px 8px;
    border: 1px solid #409eff;

    :deep(span) {
      width: 100%;
      display: flex;
      align-items: center;
    }

    .attr-model-name {
      flex: 1;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
    }
  }
}

.model-list {
  display: flex;
  align-items: stretch;
  justify-content: space-between;

  .model-info {
    width: 100%;
    flex: 0.3;
    background: #e9e9e9;
    border-radius: 2px;
    display: flex;
    flex-direction: column;
    padding: 10px;
    box-sizing: border-box;

    div {
      display: flex;
      align-items: center;
    }
  }

  :deep(.el-cascader-panel) {
    flex: 0.7;
  }

  :deep(.el-cascader-menu) {
    flex: 1;
  }

  :deep(.el-cascader-menu__wrap.el-scrollbar__wrap) {
    min-height: 100%;
  }
}
</style>