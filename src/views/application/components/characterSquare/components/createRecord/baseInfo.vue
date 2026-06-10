<template>
  <div class="base-info">
    <div class="info-left">
      <el-scrollbar height="100%">
        <div class="info-left">
          <div class="name-item item-label">
            <svg class="icon" aria-hidden="true">
              <use xlink:href="#icon-mindcraft-nicheng"></use>
            </svg>
            *<div class="item-label-text">昵称</div>：
            <el-input class="item-input" v-model="character.user_name" placeholder="请输入昵称" />
          </div>

          <div class="form-item">
            <div class="item-label">
              <svg class="icon" aria-hidden="true">
                <use xlink:href="#icon-mindcraft-jiaosesheding"></use>
              </svg>
              *<div class="item-label-text">角色介绍</div>：
            </div>
            <el-input class="item-input" :rows="6" type="textarea" v-model="character.description" placeholder="请输入角色介绍" />
          </div>

          <div class="form-item">
            <div class="item-label">
              <svg class="icon" aria-hidden="true">
                <use xlink:href="#icon-mindcraft-xingge"></use>
              </svg>
              <div class="item-label-text">性格</div>：<span class="item-label-text-tips">（按Enter确认，建议每个性格不超过3个字）</span>
            </div>
            <el-input-tag class="item-input" tag-effect="dark" @change="changeTagColor" draggable clearable v-model="character.personality" placeholder="请输入性格" />
          </div>

          <div class="form-item">
            <div class="item-label">
              <svg class="icon" aria-hidden="true">
                <use xlink:href="#icon-mindcraft-biaoqian"></use>
              </svg>
              <div class="item-label-text">标签</div>：<span class="item-label-text-tips">（按Enter确认）</span>
            </div>
            <el-input-tag class="item-input" tag-effect="dark" @change="changeTagColor" draggable clearable v-model="character.user_tags" placeholder="请输入标签" />
          </div>

        </div>
      </el-scrollbar>
    </div>
    <chat></chat>
  </div>
</template>

<script setup>
import { inject, nextTick, onMounted, ref, watch } from "vue";
import chat from './chat.vue'
const character = inject("character")

const emit = defineEmits(["changeSelectTab", "saveCharacter"])

const tagColorList = [
  '#FF6666',
  '#FF9951',
  '#80C459',
  '#59A56E',
  '#65ADD4',
  '#3D65A1',
  '#372E7C',
  '#5F216D',
  '#903FBF',
  '#BF2F7E'
]
const changeTagColor = async (event) => {
  await nextTick()
  let tagdom = document.getElementsByClassName('el-tag--info')
  for(let i = 0; i < tagdom.length; i++) {
    const item = tagdom[i]
    item.style.setProperty('--tagColor', tagColorList[i % tagColorList.length])
  }
}
watch(() => { personality: character.value.personality; tag: character.value.tag }, (newVal) => {
  changeTagColor()
},{deep: true})
</script>

<style lang="scss" scoped>
*{
  box-sizing: border-box;
}
.base-info{
  display: flex;
  justify-content: space-between;
  padding: 29px 0;
  width: 100%;
  height: 100%;
  .info-left{
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 30%;
    margin-right: 30px;
    overflow: auto;
    .form-item{
      display: flex;
      flex-direction: column;
      margin: 16px 0;
    }
    .item-label {
      display: flex;
      align-items: center;
      font-size: 16px;
      color: #107EFE;
      svg{
        margin-right: 12px;
        flex-shrink: 0;
      }
      .item-label-text{
        flex-shrink: 0;
        white-space: nowrap;
        width: 85px;
        text-align-last: justify;
        margin-right: 6px;
      }
      .item-label-text-tips{
        font-size: 16px;
        color: #707070;
      }
    }
    .item-input{
      --el-input-border-color: transparent;
      --el-input-border: none;
      --el-border-color: none;
      --el-input-border-radius: 10px;
      --el-border-radius-base: 10px;
      --el-input-bg-color: #ECF5FF;
      --el-fill-color-blank: #ECF5FF;
      --el-tag-font-size: 16px;
      margin: 14px 0;
      font-size: var(--el-tag-font-size);
      color: #000000;
      :deep(.el-textarea__inner), :deep(.el-input__inner){
        resize: none;
        padding: 12px;
      }
      :deep(.el-select__wrapper) {
        padding: 6px 18px;
        width: 100%;
        font-size: var(--el-tag-font-size);
      }
      :deep(.el-select__tags-text) {
        --el-tag-font-size: 16px;
        font-size: var(--el-tag-font-size);
        padding: 6px;
        color: #FFFFFF;
      }
      :deep(.el-tag__close) {
        color: #FFFFFF;
      }
      :deep(.el-tag--info) {
        background-color: var(--tagColor);
        border-color: var(--tagColor);
      }
    }
    .mindcraft-flow-win-iconfont{
      font-size: 14px;
      margin-right: 4px;
    }
  }
}
</style>