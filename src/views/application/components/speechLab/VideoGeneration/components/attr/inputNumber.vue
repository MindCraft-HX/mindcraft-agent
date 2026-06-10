<template>
  <el-row class="attr-content" align="middle">
    <el-col :span="paramsItem.title.length>4?24:8" class="attr-name">
      <span style="color:#f56c6c;" v-if="paramsItem.isRequired===1">*</span> 
      {{ paramsItem.title }}
      <el-popover placement="bottom" :width="220" trigger="hover">
        <template #reference>
          <div style="
              width: 16px;
              height: 16px;
              color: #a9b5c0;
              display: inline-flex;
              margin: 0px 5px;
            "
              v-if="paramsItem.description"
            >
            <InfoFilled />
          </div>
        </template>
        <template #default>
          <div>
            {{ paramsItem.description }}
          </div>
        </template>
      </el-popover>
    </el-col>
    <el-col :span="paramsItem.title.length>4?24:16" align="end">
      <el-input-number class="attr-input-number" :min="min" :max="max" v-model="moduleValue"></el-input-number>
    </el-col>
  </el-row>
</template>

<script setup>
import { ref, computed } from 'vue'
const props = defineProps(['paramsItem', 'value', 'min', 'max'])
const emit = defineEmits(['update:value'])

const moduleValue = computed({
  get() {
    return props.value
  },
  set(val) {
    emit('update:value', val)
  }
})


</script>

<style lang="scss" scoped>
.attr-content {
  width: 90%;
  margin: 0 auto;
  margin-bottom: 14px;

  .attr-name {
    font-weight: bold;
    font-size: 16px;
    color: #000000;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    word-break: keep-all;
  }
  .attr-name.el-col-24{
    margin-bottom:12px;
  }
  .attr-input-number {
    width: 98%;
    border: 1px solid #409eff;
    border-radius: 4px;
  }

  .icon-ai {
    width: 17px;
    height: 17px;
    background-size: 100% 100%;
    background-image: url("@/assets/videoGeneration/ai.png");
  }

}
</style>