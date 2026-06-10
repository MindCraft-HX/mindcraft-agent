<!-- 角色设置弹窗页面 -->
<template>
  <div class="role-setting-drawer">
    <el-drawer v-model="drawer" direction="rtl" title="角色设置" :before-close="handleClose" :append-to-body="false"
      :lock-scroll="false">
      <el-form :model="form" label-width="auto" style="max-width: 600px;">
        <el-form-item label="角色选择">
          <el-select v-model="form.character" placeholder="请选择角色" @change="handleChangeCharacter">
            <el-option v-for="(item, index) in characterList" :label="item.character_name" :value="item.character_id"
              :key="item.character_id">
              <div class="option-item">
                <span style="float: left">{{ item.character_name }}</span>
                <el-tooltip popper-class="box-item" placement="left" style="background-color: #3e4854;">
                  <template #content>
                    <div class="content">
                      <img :src="item.character_visualDesign?.animation_assets?.neutral" title="头像" alt="头像" />
                      <div class="text">
                        <div class="name">{{ item.character_name }}</div>
                        <div class="description">{{ item.character_basicInfo?.description }}</div>
                      </div>
                    </div>
                  </template>
                  <span style="float: right;">
                    <el-icon>
                      <InfoFilled />
                    </el-icon>
                  </span>
                </el-tooltip>
              </div>
            </el-option>
            <el-option>
              <div style="text-align: center;" @click="handleCreateCharacterJump">
                <span class="icon mindcraft-flow-win-iconfont icon-mindcraft-tianjia"
                  style="color:#409EFF;margin-right: 10px;"></span>
                <span>添加更多角色</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="用户人设">
          <el-select v-model="form.user" placeholder="请选择用户人设" @change="handleChangeUserFile">
            <el-option v-for="(item, index) in userFileList" :label="item.user_name" :value="item.profile_id"
              :key="index">
              <div class="option-item">
                <span style="float: left">{{ item.user_name }}</span>
                <el-tooltip popper-class="box-item" placement="left">
                  <template #content>
                    <div class="content">
                      <img :src="item.user_visualDesign?.animation_assets?.default" title="头像" alt="头像" />
                      <div class="text">
                        <div class="name">{{ item.user_name }}</div>
                        <div class="description">{{ item.user_basicInfo?.description }}</div>
                      </div>
                    </div>
                  </template>
                  <span style="float: right;">
                    <el-icon>
                      <InfoFilled />
                    </el-icon>
                  </span>
                </el-tooltip>
              </div>
            </el-option>
            <el-option>
              <div style="text-align: center;" @click="handleCreateUserJump">
                <span class="icon mindcraft-flow-win-iconfont icon-mindcraft-tianjia"
                  style="color:#409EFF;margin-right: 10px;"></span>
                <span>添加更多角色</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
      </el-form>

    </el-drawer>
    <Toast ref="toastRef" />
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from "vue"
import Toast from '@/components/VoiceInteraction/components/toast.vue'
import { apiGetCharacterAllList } from "@/api/application/character"
import { apiUserCharacter } from '@/api/application/voiceInteraction.js'
import { useVoicePreferenceStore } from '@/stores/voicePreference.js'
import { InfoFilled } from '@element-plus/icons-vue'
import { useMitt } from "@/utils/mitt.js";
import { useRouter } from 'vue-router';
const mitt = useMitt();
const router = useRouter();
const voicePreferenceStore = useVoicePreferenceStore()
const emit = defineEmits(["update:modelValue", "change", 'openDialog'])
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})
const drawer = ref(props.modelValue) // 角色设置抽屉
const form = ref({}) // 角色设置
const characterList = ref([])
const userFileList = ref([])
const toastRef = ref(null)

onMounted(async () => {
  try {
    await getCharacter()
    await getUserCharacter()
  } catch (error) {
    console.log(error)
  }

})

watch(() => props.modelValue, (newValue) => {
  drawer.value = newValue
}, { immediate: true })

const getCharacter = async () => {
  // 获取角色列表
  let { data } = await apiGetCharacterAllList()
  characterList.value = data.data || []
  if (characterList.value.length === 0) {
    // 没有角色数据
    toastRef.value.show({
      message: '没有关注角色，请先关注角色',
      type: 'error'
    })
    setTimeout(() => {
      handleCreateCharacterJump()
    }, 2000)
    throw Error('没有关注角色，请先关注角色')
  } else if (characterList.value.length !== 0 && Object.keys(voicePreferenceStore.character).length === 0) {
    //  还没有角色数据，创建一个
    voicePreferenceStore.character = characterList.value[0]
    form.value.character = characterList.value[0].character_id
  } else {
    // 要更新voicePreferenceStore.character
    let character = characterList.value.find(item => item.character_id === voicePreferenceStore.character.character_id)
    if (!character) {
      voicePreferenceStore.character = characterList.value[0]
    } else {
      voicePreferenceStore.character = character
    }
    form.value.character = voicePreferenceStore.character.character_id
  }
}
const getUserCharacter = async () => {
  //  获取用户人设列表
  let { data: data1 } = await apiUserCharacter({ data_type: 'info' })
  userFileList.value = data1.data || []
  if (userFileList.value.length === 0) {
    //  没有用户人设，则打开弹窗，让用户生成
    emit('openDialog')
  } else {
    if (!voicePreferenceStore.userFile || Object.keys(voicePreferenceStore.userFile).length === 0) {
      //  有用户人设，但是没有绑定
      voicePreferenceStore.userFile = userFileList.value[0]
      form.value.user = userFileList.value[0].profile_id
    } else {
      let userFile = userFileList.value.find(item => item.profile_id === voicePreferenceStore.userFile.profile_id)
      // 绑定的用户人设可能会被删除，应判断是否存在，不存在则使用第一个
      if (!userFile) {
        voicePreferenceStore.userFile = userFileList.value[0]
      } else {
        voicePreferenceStore.userFile = userFile
      }
      form.value.user = voicePreferenceStore.userFile.profile_id
    }
  }
}


const handleClose = (done) => {
  done()
  emit("update:modelValue", false)
}
const handleChangeCharacter = async (val) => {
  if (!val) return
  //  切换角色
  let item = characterList.value.find(item => item.character_id === val)
  if (!item) return
  voicePreferenceStore.character = item
}
const handleChangeUserFile = async (val) => {
  if (!val) return
  // 修改用户人设
  let item = userFileList.value.find(item => item.profile_id === val)
  if (!item) return
  voicePreferenceStore.userFile = item
}

const handleCreateCharacterJump = () => {
  //  跳转到发现
  mitt.emit('changeMenuActive', '/application')
  router.push('/characterSquarePage');
  setTimeout(() => {
    mitt.emit("changeSidebar", { tab: 0 })
  }, 300);
}
const handleCreateUserJump = () => {
  //  跳转到我的人设
  mitt.emit('changeMenuActive', '/application')
  router.push('/characterSquarePage');
  setTimeout(() => {
    mitt.emit("changeSidebar", { tab: 3 })
    setTimeout(() => {
      mitt.emit("createCharacter")
    }, 300);
  }, 300);
}
defineExpose({ getUserCharacter })
</script>

<style lang="scss">
.box-item.el-popper.is-dark {
  background-color: #3e4854;
  color: #eee;
  border: 1px solid #3e4854;

  .content {
    width: 300px;
    display: flex;

    img {
      width: 74px;
      height: 98px;
      border-radius: 8px;
      margin: 10px;
      margin-left: 0px;
    }

    .text {
      flex: 1;
    }

    .name {
      width: 100%;
      font-size: 16px;
      padding: 10px 0px 6px;
      border-bottom: 1px solid #eeeeee66;
      margin-bottom: 6px;
    }
  }
}

.box-item.el-popper.is-dark>.el-popper__arrow:before {
  border: 1px solid #3e4854;
  background-color: #3e4854;
}
</style>
<style lang="scss" scoped>
.role-setting-drawer {
  position: absolute;
  right: 0;

  :deep(.el-drawer) {
    background-color: #f2f2f2;
  }

  :deep(.el-overlay) {
    top: 120px;
  }

  :deep(.el-select .el-select__wrapper) {
    border-radius: 8px;
    box-shadow: 0 0 0 1px #B6B4B4 inset;
  }

  .user-detail {
    width: 200px;
    display: flex;
    justify-content: flex-start;
  }
}
</style>