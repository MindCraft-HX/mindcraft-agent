<template>
  <div class="character-item">
    <el-image class="character-img" :src="assestLink.url ? assestLink.url : defaultImg" fit="cover" v-if="assestLink.type === 'img'"/>
    <video class="character-img" autoplay loop muted :src="assestLink.url" v-else></video>
    <el-scrollbar style="height: initial;padding: 0 6px;" ref="scrollbarRef" height="fit-content" max-height="fit-content" max-width="100%" @wheel="handleWheel" v-if="character?.character_tags?.length">
      <div class="tag-list">
        <div class="tag-item" v-for="item, index in character.character_tags" :key="index">{{ item }}</div>
      </div>
    </el-scrollbar>
    <div class="character-in-content">
      <div class="character-info show-more">
        <div class="character-name">{{ character.character_name }}</div>
        <div class="character-fans" :style="{
          color: character.is_follow ? '#67c23a' : '#ffffff'
        }">
          <div class="mindcraft-flow-win-iconfont icon-mindcraft-guanzhushu"></div>
          <div class="fans-num">{{ character.follow_num }}</div>
        </div>
        <div class="character-desc">{{ character.character_basicInfo.description }}</div>
        <div class="uuid-num">{{ character.character_uuid }}</div>
      </div>
      <div class="character-mask">
        <div class="character-name">{{ character.character_name }}</div>
        <div class="character-user">@{{ character.character_user }}</div>
        <div class="character-desc">{{ character.character_basicInfo.description }}</div>
        <div style="width: 100%;display: flex;align-items: center;">
          <el-button style="width: 100%;" icon="InfoFilled" round plain type="primary" @click="selectCharacter">详情</el-button>
          <el-button style="width: 100%;" round :type="character.is_follow ?'success' : 'primary'" @click="followCharacter" v-if="!character.is_owner"><div style="margin-right: 3px;" class="mindcraft-flow-win-iconfont icon-mindcraft-guanzhushu"></div>{{character.is_follow ?'已关注' : '关注'}}</el-button>
          <el-button style="width: 100%;" round :type="character.is_share ?'success' : 'primary'" @click="shareCharacter" v-if="character.is_owner"><div style="margin-right: 3px;" class="mindcraft-flow-win-iconfont icon-mindcraft-fenxiang"></div>{{character.is_share ?'已分享' : '分享'}}</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import defaultImg from '@/assets/characterSquare/characterSquareBG.png'
const props = defineProps(["character"])
const emit = defineEmits(["update:character", "onSelect"])
const assestLink = computed(() => {
  const assests = props?.character?.character_visualDesign?.animation_assets || {}
  const assest = Object.entries(assests)[0] || []
  if(assest[0]?.includes("_gif")) return { url: assest?.[1] || "", type: 'video' }
  else return { url: assest?.[1] || "", type: 'img' }
})
const selectCharacter = () => {
  emit("onSelect", props.character)
}
const scrollbarRef = ref(null);
const handleWheel = (event) => {
  const scrollContainer = scrollbarRef.value?.$el?.querySelector(
    ".el-scrollbar__wrap"
  );
  const scrollAmount = event.deltaY * 2;
  scrollContainer?.scrollTo({
    left: scrollContainer.scrollLeft + scrollAmount,
    behavior: "smooth",
  });
  event.preventDefault();
};

import { apiFollowCharacter } from "@/api/application/character.js"
const followCharacter = () => {
  apiFollowCharacter({
    follow_status: !props?.character?.is_follow
  }, props?.character?.character_id)
  .then(res => {
    const follow_num = props?.character?.is_follow ? props?.character?.follow_num - 1 : props?.character?.follow_num + 1
    emit("update:character", {
      ...props?.character,
      is_follow: !props?.character?.is_follow,
      follow_num
    })
    ElMessage.success(!props?.character?.is_follow ? '关注成功' : '取消关注成功')
  })
}

import { apiSaveCharacter } from "@/api/application/character"
const shareCharacter = () => {
  apiSaveCharacter({is_share: !props?.character?.is_share}, props?.character?.character_id).then(res => {
    emit("update:character", {
      ...props?.character,
      is_share: !props?.character?.is_share,
    })
    ElMessage.success(!props?.character?.is_share ? '分享成功' : '取消分享成功')
  }).catch(err => {
    console.log(err)
    ElMessage.error(err?.response?.data?.message || "分享异常")
  })
}
</script>

<style lang="scss" scoped>
*{
  box-sizing: border-box;
}
.character-item{
  width: 221px;
  height: 295px;
  position: relative;
  margin: 0 7px 31px 7px;
  border-radius: 18px;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  color: #ffffff;
  cursor: pointer;
  .character-img{
    width: 100%;
    height: 100%;
    object-fit: cover;
    background-size: cover;
    background-repeat: no-repeat;
    background-position: center center;
    user-select: none;
    position: absolute;
    top: 0;
    left: 0;
  }
  .character-in-content{
    width: 100%;
    height: fit-content;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    &:hover{
      .character-info{
        display: none;
      }
      .character-mask{
        display: flex;
      }
    }
  }
  &:has(.character-in-content:hover) .tag-list {
    display: none;
  }
  .tag-list{
    width: 100%;
    display: flex;
    align-items: center;
    padding-bottom: 6px;
    position: relative;
    .tag-item{
      width: fit-content;
      padding: 6px 12px;
      background: #3A3A3A;
      border-radius: 15px 15px 15px 15px;
      font-size: 16px;
      color: #FFC013;
      margin-right: 5px;
      flex-shrink: 0;
      white-space: nowrap;
    }
  }
  .character-info{
    width: 100%;
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 12px;
    padding-top: 5px;
    box-sizing: border-box;
    &.show-more:before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      z-index: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient( to bottom, #fdfdfd00 0%, rgba(107, 107, 107, 0.596) 20%, rgba(61, 61, 61, 0.856) 55%);
    }
    .character-name{
      font-weight: bold;
      font-size: 20px;
      color: #FFFFFF;
      margin-bottom: 7px;
      position: relative;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .character-fans{
      display: flex;
      align-items: center;
      font-weight: bold;
      font-size: 14px;
      color: #FFFFFF;
      position: relative;
      .fans-num{
        margin-left: 5px;
      }
    }
    .character-desc{
      font-size: 14px;
      color: #BBB8B8;
      flex-shrink: 0;
      height: 50px;
      line-height: 25px;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
      position: relative;
    }
    .uuid-num{
      text-align: right;
      margin-left: 5px;
      color: #BBB8B8;
      font-size: 10px;
      font-weight: 400;
      position: relative;
    }
  }
  .character-mask{
    position: absolute;
    top: 0;
    left: 0;
    z-index: 0;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    background-color: rgba(0, 0, 0, 0.623);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 26px 16px;
    display: none;
    .character-name{
      width: 100%;
      text-align: left;
      font-weight: bold;
      font-size: 20px;
      color: #FFFFFF;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .character-user{
      width: 100%;
      text-align: start;
      font-size: 10px;
      color: #BBB8B8;
      position: relative;
    }
    .character-desc{
      width: 100%;
      text-align: left;
      font-size: 14px;
      color: #BBB8B8;
      flex-shrink: 0;
      min-height: 150px;
      line-height: 25px;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 6;
      overflow: hidden;
    }
    .character-desc{
      font-size: 14px;
    }
  }
}
</style>