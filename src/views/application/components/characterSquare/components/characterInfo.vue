<template>
  <div class="character-info">
    <div class="info-left">
      <el-scrollbar height="100%">
        <div class="info-left">
          <div class="name-item item-label">
            <svg class="icon" aria-hidden="true">
              <use xlink:href="#icon-mindcraft-nicheng"></use>
            </svg>
            <div class="item-label-text">昵称</div>：
            <div class="item-info">
              <div class="info-text">
                {{ character.character_name }}
              </div>
              <div class="suffix" v-if="character.is_owner">
                <div class="mindcraft-flow-win-iconfont icon-mindcraft-guanzhushu"></div>
                <div class="fans-num">{{ character.follow_num }}</div>
              </div>
              <div class="suffix follow-btn" :class="{'is-follow': character.is_follow}" @click="followCharacter" v-else>
                <div class="mindcraft-flow-win-iconfont icon-mindcraft-guanzhushu"></div>
                <div class="fans-num">{{ character.follow_num }}</div>
              </div>
            </div>
          </div>
          <div class="name-item item-label">
            <svg class="icon" aria-hidden="true">
              <use xlink:href="#icon-mindcraft-nicheng"></use>
            </svg>
            <div class="item-label-text">角 色 ID</div>：
            <div class="item-info">
              <div class="info-text">
                {{ character.character_uuid }}
              </div>
              <div class="suffix">
                <div class="mindcraft-flow-win-iconfont icon-mindcraft-fuzhi1" @click="copy(character.character_uuid)"></div>
              </div>
            </div>
          </div>
          <div class="form-item">
            <div class="item-label">
              <svg class="icon" aria-hidden="true">
                <use xlink:href="#icon-mindcraft-biaoqian"></use>
              </svg>
              <div class="item-label-text">标签</div>：
            </div>
            <div class="tags-list">
              <div class="tag-item" v-for="item, index in character.character_tags" :key="index" :style="{ backgroundColor: tagColorList[index % tagColorList.length] }">{{ item }}</div>
            </div>
          </div>
          <div class="form-item">
            <div class="item-label">
              <svg class="icon" aria-hidden="true">
                <use xlink:href="#icon-mindcraft-xingge"></use>
              </svg>
              <div class="item-label-text">性格</div>：
            </div>
            <div class="tags-list" v-if="character?.character_basicInfo?.personality">
              <div class="tag-item" v-for="item, index in character.character_basicInfo.personality" :key="index" :style="{ backgroundColor: tagColorList[index % tagColorList.length] }">{{ item }}</div>
            </div>
          </div>
          <div class="form-item">
            <div class="item-label">
              <svg class="icon" aria-hidden="true">
                <use xlink:href="#icon-mindcraft-jiaosesheding"></use>
              </svg>
              <div class="item-label-text">角色设定</div>：
            </div>
            <div style="width: 95%" class="item-info textarea">
              <div class="textarea-text">
                {{ character?.character_basicInfo?.[characterType ? 'tone' : 'description'] || "无"}}
              </div>
              <div class="suffix">
                <div class="btn-item" :class="[ characterType == index ? 'active' : '']" v-for="item, index in ['角色介绍', '沟通风格']" :key="index" @click="characterType = index">{{ item }}</div>
              </div>
            </div>
          </div>
          <div class="name-item item-label">
            <svg class="icon" aria-hidden="true">
              <use xlink:href="#icon-mindcraft-yinseliebiao1"></use>
            </svg>
            <div class="item-label-text">音色</div>：
            <div class="item-info">
              <div class="info-text">
                {{ character?.voice_data?.voice_name || "无"}}
              </div>
            </div>
          </div>
          <div class="form-item" v-if="character?.character_basicInfo?.lines">
            <div class="item-label">
              <svg class="icon" aria-hidden="true">
                <use xlink:href="#icon-mindcraft-taici"></use>
              </svg>
              <div class="item-label-text">角色台词</div>：
            </div>
            <div style="width: 95%" class="item-info textarea" v-for="item, index in character?.character_basicInfo?.lines.filter(item => !!item)" :key="index">
              <div class="info-text">
                {{ item }}
              </div>
            </div>
          </div>
          <div class="name-item item-label">
            <svg class="icon" aria-hidden="true">
              <use xlink:href="#icon-mindcraft-dangqianzhishiku"></use>
            </svg>
            <div class="item-label-text">知识库</div>：
            <div class="item-info">
              <div class="info-text">
                {{ character.lib_name || "无"}}
              </div>
            </div>
          </div>
        </div>
      </el-scrollbar>
      <div class="btn-content item-label">
        <slot name="btn"></slot>
      </div>
    </div>
    <div class="info-right">
      <el-scrollbar height="100%">
        <div class="info-right">
          <div class="identity-img-content">
            <div class="identity-btn">
              <div class="btn-item" @click.stop="openSoundPlay" v-if="character.voice_urls">
                <svg class="btn-item-icon" aria-hidden="true" v-if="!soundPlay">
                  <use xlink:href="#icon-mindcraft-a-zu2053"></use>
                </svg>
                <svg class="btn-item-icon" aria-hidden="true" v-else>
                  <use :xlink:href="soundIconList[soundImgIndex]"></use>
                </svg>
              </div>
            </div>
            <el-image class="identity-img" :src="assestLink ? assestLink : defaultImg" fit="cover" v-if="!activeIndex"/>
            <video class="identity-img" autoplay loop muted :src="assestLink" v-else></video>
            <div class="img-btn-content">
              <div class="img-btn" :class="{'active': activeIndex === index}" @click="changeActiveIndex(index)" v-for="item, index in  ['静态立绘', '动态立绘']" :key="index">{{ item }}</div>
            </div>
          </div>
          <div class="emotion-content">
            <div class="emotion-item" @click="selectEmotion(index)" v-for="item, index in emotionList" :key="index">
              <svg class="emotion-item-icon" aria-hidden="true">
                <use :xlink:href="item.img"></use>
              </svg>
              <div class="emotion-item-mark" v-show="activeEmotion === index">{{ item.name }}</div>
            </div>
          </div>
        </div>
      </el-scrollbar>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import defaultImg from '@/assets/characterSquare/characterSquareBG.png'

const props = defineProps(["character"])
const emit = defineEmits(["update:character"])

import { apiGetCharacterById } from "@/api/application/character.js"
import { getLibraryById } from '@/api/mainActivity/Library';
onMounted(() => {
  if(props.character.character_id) {
    apiGetCharacterById(props.character.character_id)
    .then(async res => {
      if(res?.data?.character_library_id) {
        const lib = await getLibraryById(res?.data?.character_library_id)
        res.data.lib_name = lib?.data?.index_name
      }
      emit("update:character", {
        ...props.character,
        ...(res?.data || {})
      })
    })
  }
})

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
  })
}

const copy = (text) => {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      ElMessage.success("已复制到剪贴板");
    })
}

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

const characterType = ref(0)

const soundPlay = ref(false)
let playTimer = null
const soundIconList = ["#icon-mindcraft-a-zu2051", "#icon-mindcraft-a-zu2052", "#icon-mindcraft-a-zu2053"]
const soundImgIndex = ref(0)
const audioIndex = ref(0)
const normalAudioRef = ref(null);
const openSoundPlay = async () => {
  setTimeout(() => {
    const link = props?.character?.voice_urls?.[audioIndex.value] || ""
    audioIndex.value = audioIndex.value >= props?.character?.voice_urls.length - 1 ? 0 : audioIndex.value + 1
    if (normalAudioRef.value) {
      clearInterval(playTimer)
      normalAudioRef.value.pause()
      // if(soundPlay.value) {
      //   soundPlay.value = false
      //   return
      // }
    };
    if (link) {
      normalAudioRef.value = new Audio(link);
      normalAudioRef.value.onended = () => {
        normalAudioRef.value.pause();
        soundPlay.value = false
        clearInterval(playTimer)
      }
      normalAudioRef.value.onerror = () => {
        console.log("播放出错");
        ElMessage.error("播放出错");
        normalAudioRef.value.pause();
        soundPlay.value = false
        clearInterval(playTimer)
      }
      nextTick(() => {
        normalAudioRef.value.play();
        soundPlay.value = true
        if(soundPlay.value) {
          clearInterval(playTimer)
          soundImgIndex.value = 0
          playTimer = setInterval(() => {
            soundImgIndex.value = soundImgIndex.value + 1 >= soundIconList.length ? 0 : soundImgIndex.value + 1
          }, 300 + (soundImgIndex.value * 100))
        }
      })
    }
  }, 0);
}

onUnmounted(() => {
  clearInterval(playTimer)
  normalAudioRef.value?.pause()
  soundPlay.value = false
})

const activeIndex = ref(0)
const changeActiveIndex = (index) => {
  activeIndex.value = index
}

const emotionList = [
  { name: "害怕", key: 'fearful', img: "#icon-mindcraft-haipa"},
  { name: "惊讶", key: 'surprised', img: "#icon-mindcraft-jingya"},
  { name: "厌恶", key: 'disgusted', img: "#icon-mindcraft-yane"},
  { name: "愤怒", key: 'angry', img: "#icon-mindcraft-fennu"},
  { name: "中性", key: 'neutral', img: "#icon-mindcraft-zhongxing"},
  { name: "高兴", key: 'happy', img: "#icon-mindcraft-gaoxing"},
  { name: "悲伤", key: 'sad', img: "#icon-mindcraft-beishang"},
]
const activeEmotion = ref(4)
const selectEmotion = (index) => {
  activeEmotion.value = index == activeEmotion.value ? 4 : index
}
const mediaKey = computed(() => {
  if(!activeIndex.value) return emotionList?.[activeEmotion.value]?.key || ''
  else return (emotionList?.[activeEmotion.value]?.key || '') + '_gif'
})
const assestLink = computed(() => {
  const link = props?.character?.character_visualDesign?.animation_assets?.[mediaKey.value] || ""
  return link
})
</script>

<style lang="scss" scoped>
*{
  box-sizing: border-box;
}
.character-info{
  display: flex;
  justify-content: space-between;
  padding: 29px 0;
  width: 100%;
  height: 95%;
  .info-left{
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    flex: .6;
    min-width: 30%;
    margin-right: 30px;
    // overflow: auto;
    flex-shrink: 0;
    padding: 0 12px;
    .form-item{
      display: flex;
      flex-direction: column;
      margin: 16px 0;
    }
    .btn-content{
      margin-top: 16px;
    }
    .item-label {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      font-size: 16px;
      color: #107EFE;
      width: 100%;
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
      .icon-mindcraft-fuzhi1{
        color: #107EFE;
        cursor: pointer;
      }
    }
    .tags-list{
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      .tag-item {
        padding: 6px 12px;
        margin: 6px;
        width: fit-content;
        height: fit-content;
        border-radius: 6px;
        font-size: 16px;
        color: #FFFFFF;
        cursor: pointer;
        opacity: .95;
        &:hover{
          opacity: 1;
        }
      }
    }
    .item-info{
      background-color: #ECF5FF;
      border-radius: 10px;
      font-size: 16px;
      margin: 14px 0;
      color: #000000;
      width: 70%;
      min-width: fit-content;
      padding: 6px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      flex-shrink: 0;
      min-width: 0;
      .info-text{
        flex: 1;
        width: 100%;
        text-align: left;
      }
      .suffix{
        display: flex;
        align-items: center;
        color: #707070;
        padding: 3px 6px;
        &.is-follow{
          color: #107EFE;
        }
        &.follow-btn{
          cursor: pointer;
          border-radius: 6px;
          &:hover {
            background-color: #e6f1fd;
            box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.1);
          }
          &:active {
            box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.2) inset;
          }
        }
      }
      &.textarea{
        flex-direction: column;
        padding: 18px;
        .textarea-text {
          width: 100%;
          text-align: left;
          margin-bottom: 12px;
        }
        .suffix{
          width: 100%;
          .btn-item{
            flex: 1;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 6px;
            background-color: #DEF0FF;
            border-radius: 10px;
            color: #000000;
            cursor: pointer;
            margin: 8px;
            flex-shrink: 0;
            &.active {
              background-color: #409EFF;
              color: #FFFFFF;
            }
          }
        }
      }
      .fans-num{
        margin-left: 6px;
      }
    }
  }
  .info-right{
    flex: .4;
    display: flex;
    flex-direction: column;
    align-items: center;
    .identity-img-content{
      width: 345px;
      position: relative;
      display: flex;
      flex-direction: column;
      border-radius: 18px;
      overflow: hidden;
      flex-shrink: 0;
      .identity-btn{
        position: absolute;
        top: 11px;
        right: 14px;
        display: flex;
        align-items: center;
        cursor: pointer;
        z-index: 1;
        transition: all .3s;
        .btn-item{
          width: 33px;
          height: 33px;
          margin: 0 3px;
          opacity: 0.8;
          &:hover{
            opacity: 1;
          }
          .btn-item-icon {
            width: 100%;
            height: 100%;
          }
        }
      }
      .identity-img{
        width: 345px;
        height: 429px;
        object-fit: cover;
        background-image: url("@/assets/characterSquare/characterSquareBG.png");
        background-size: cover;
        background-repeat: no-repeat;
        background-position: center center;
      }
      .img-btn-content{
        width: 100%;
        display: flex;
        align-items: center;
        .img-btn{
          flex: 1;
          background-color: #ECF5FF;
          font-size: 16px;
          color: #000;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 19px 0;
          cursor: pointer;
          &.active{
            background-color: #409EFF;
            color: #fff;
          }
          opacity: 0.9;
          &:hover{
            opacity: 1;
          }
        }
      }
    }
    .emotion-content{
      width: 345px;
      display: flex;
      align-items: flex-end;
      flex-wrap: wrap-reverse;
      justify-content: center;
      margin-top: 29px;
      .emotion-item {
        flex-shrink: 0;
        width: 76px;
        height: 76px;
        position: relative;
        margin: 3px;
        cursor: pointer;
        .emotion-item-icon{
          width: 100%;
          height: 100%;
        }
        .emotion-item-mark{
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: #01010194;
          font-weight: bold;
          font-size: 16px;
          color: #409EFF;
          border-radius:50%;
        }
      }
    }
  }
}
</style>