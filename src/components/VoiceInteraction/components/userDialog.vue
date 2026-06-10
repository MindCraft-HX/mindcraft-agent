<!-- 用户弹窗 -->
<template>
  <div>

    <el-dialog class="voice-user-dialog" v-model="visible" :show-close="false" width="500" :close-on-click-modal="false"
      :modal-append-to-body='false' :append-to-body="false">
      <template #header>
        <div class="user-dialog"></div>
        <h2 class="user-header">用户人设</h2>
      </template>
      <div class="user-body">
        <Scroll>
          <div class="user-select-item" v-for="(item, index) in defaultUserList" :key="index"
            @click="handleClick(item, index)">
            <img :src="item.user_visualDesign?.animation_assets?.default" />
            <div class="check-box">
              <el-icon v-if="checkIndex === index" class="check-icon" :size="20" color="#ff2f04">
                <CircleCheckFilled />
              </el-icon>
              <div v-else class="in-active-icon"></div>
            </div>
          </div>
        </Scroll>
        <div class="user-description" v-show="checkUserCharacter">
          <div class="user-name">
            <span class="icon mindcraft-flow-win-iconfont icon-mindcraft-nichengditu"></span>
            <span class="name">昵称：{{
              checkUserCharacter?.user_name
            }}</span>
          </div>
          <div class="description">
            {{ checkUserCharacter?.user_basicInfo?.description }}
          </div>
        </div>
        <div class="user-button">
          <div class="submit" @click="handleClickSumbit">
            确定
          </div>
          <div class="create" @click="handleCreateJump">
            创建我的人设
          </div>
        </div>
      </div>
    </el-dialog>
    <Toast ref="toastRef" />
  </div>

</template>

<script setup>
import { computed, ref, onMounted, h } from "vue"
import { CircleCheckFilled, CircleCheck } from '@element-plus/icons-vue'
import { apiUserCharacter, apiFollowCharacter } from '@/api/application/voiceInteraction.js'
import Toast from '@/components/VoiceInteraction/components/toast.vue'
import Scroll from '@/components/VoiceInteraction/components/scroll.vue'
import { apiCopyCharacter } from "@/api/application/character.js"
import api from "@/utils/request";
import { useRouter } from 'vue-router';
import { useMitt } from "@/utils/mitt.js";
import { ElProgress, ElText, ElMessageBox, ElMessage } from "element-plus";
import { useVoicePreferenceStore } from '@/stores/voicePreference.js'
const voicePreferenceStore = useVoicePreferenceStore()
const router = useRouter();
const mitt = useMitt();
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})
const emit = defineEmits(['update:modelValue'])
const visible = computed({
  get() {
    return props.modelValue
  },
  set(val) {
    emit('update:modelValue', val)
  }
})
const form = ref({
  name: '',
  avatar: ''
})
const defaultUserList = ref([])
const checkIndex = ref(-1)
const toastRef = ref(null)
const loading = ref(false)
const checkUserCharacter = computed(() => defaultUserList.value[checkIndex.value])

onMounted(async () => {
  let { data } = await apiUserCharacter({ data_type: 'share' })
  defaultUserList.value = data.results
})
const handleClick = (item, index) => {
  checkIndex.value = index
}
const handleClickSumbit = async () => {
  if (checkIndex.value === -1) {
    toastRef.value.show({
      message: '请选择人设',
      type: 'warning'
    })
    return
  }

  try {
    loading.value = true
    await apiFollowCharacter(checkUserCharacter.value.profile_id,{follow_status:true})
    //  获取用户角色
    emit('refresh')
    loading.value = false
    visible.value = false
    toastRef.value.show({
      message: '创建人设成功',
      type: 'success'
    })
  } catch (err) {
    loading.value = false
    toastRef.value.show({
      message: '创建人设失败',
      type: 'error'
    })
  }
}

const handleCreateJump = async () => {
  // 跳转到创建我的人设
  mitt.emit('changeMenuActive', '/application')
  router.push('/characterSquarePage');
  setTimeout(() => {
    mitt.emit("changeSidebar", { tab: 3 })
    setTimeout(() => {
      mitt.emit("createCharacter")
    }, 300);
  }, 300);
}
</script>

<style lang="scss">
.voice-user-dialog {
  width: 711px;
  height: 484px;
  background: linear-gradient(180deg, #FBFDFF 0%, #E2E7FF 100%);
  box-shadow: 0px 3px 6px 1px rgba(0, 0, 0, 0.16);
  border-radius: 17px 17px 17px 17px;
}
</style>
<style lang="scss" scoped>
:deep(.el-overlay-dialog) {
  top: 62px;
}

:deep(.el-overlay) {
  top: 60px;
}

.voice-user-dialog {
  position: relative;
  left: 0;

  .user-header {
    text-align: center;
    padding-bottom: 16px;
    margin: 0;
    border-bottom: 1px solid #C8C8C8;
  }


  .user-select-item {
    width: 87px;
    height: 115px;
    position: relative;
    left: 0;

    img {
      width: 100%;
      height: 100%;
      box-shadow: 0px 1px 2px 1px rgba(0, 0, 0, 0.16);
      border-radius: 8px;
    }

    .check-box {
      position: absolute;
      top: 4px;
      right: 4px;

      .in-active-icon {
        width: 17px;
        height: 17px;
        border: 1px solid #fff;
        border-radius: 50%;
      }
    }
  }

  .user-description {
    border: 2px solid #409EFF;
    border-radius: 10px;
    color: #000;
    padding: 20px;
    background-color: #fff;
    position: relative;
    left: 0;

    .user-name {
      position: absolute;
      top: -15px;


      .mindcraft-flow-win-iconfont {
        color: #409EFF;
        font-size: 28px;
      }

      .name {
        color: #fff;
        font-size: 14px;
        line-height: 28px;
        position: absolute;
        left: 0;
        padding-left: 20px;
      }
    }
  }

  .user-button {
    margin-top: 40px;
    display: flex;
    justify-content: center;
    font-size: 20px;
    text-align: center;
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);

    .submit {
      width: 154px;
      height: 44px;
      color: #fff;
      background: #409EFF;
      border-radius: 9px 9px 9px 9px;
      line-height: 44px;
      cursor: pointer;
    }

    .create {
      width: 154px;
      height: 44px;
      line-height: 44px;
      border-radius: 9px 9px 9px 9px;
      border: 1px solid #409EFF;
      background-color: rgb(222, 238, 255);
      margin-left: 30px;
      cursor: pointer;
      color: #409EFF;
    }
  }

  .sumbit-progress {
    margin: 150px auto;

  }

}
</style>