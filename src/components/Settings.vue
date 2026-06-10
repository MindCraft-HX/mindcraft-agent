<template>
  <div class="settings">
    <el-drawer title="设置" v-model="settingsDrawer" direction="rtl" size="50%" :before-close="handleDrawerClose" @open="openSettingsDrawer">
      <el-tabs type="card" v-model="activeSetting">
        <!-- 设置 -->
        <el-tab-pane label="设置" name="settings">
          <el-row :gutter="20">
            <el-col :span="6" :offset="4" style="display: flex;align-items: center;">
              开机启动
            </el-col>
            <el-col :span="10" :offset="4" class="setting-right">
              <el-switch v-model="loginStart" @change="setLoginItemSettings"/>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="6" :offset="4" class="setting-label">
              <span>安全模式</span>
              <el-tooltip content="开启后，进入编程智能体时不自动恢复旧会话，可避免异常历史导致卡死。" placement="top">
                <span class="setting-help">?</span>
              </el-tooltip>
            </el-col>
            <el-col :span="10" :offset="4" class="setting-right">
              <el-switch v-model="codexSafeModeEnabled" @change="setCodexSafeModeEnabled"/>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="6" :offset="4" style="display: flex;align-items: center;">
              浮窗启动
            </el-col>
            <el-col :span="10" :offset="4" class="setting-right">
              <el-switch v-model="canOpenSideFloatWin" @change="setCanOpenHoverWin"/>
            </el-col>
          </el-row>
          <el-row :gutter="20" v-if="isWIN">
            <el-col :span="6" :offset="4" style="display: flex;align-items: center;">
              截图启动
            </el-col>
            <el-col :span="10" :offset="4" class="setting-right">
              <el-switch v-model="canOpenScreenShotWin" @change="setcanOpenScreenShotWin"/>
            </el-col>
          </el-row>
          <el-row :gutter="20" v-if="isWIN">
            <el-col :span="6" :offset="4" style="display: flex;align-items: center;">
              截图快捷键
            </el-col>
            <el-col :span="10" :offset="4" class="setting-right">
              <el-button size="small" style="font-size: 12px;cursor: pointer;" @click="openSetScreenShotWinSet" v-if="!showScreenShotWinSet">{{ hotKeyScreenShotWin }}</el-button>
              <template v-else>
                <div style="display: flex;align-items: center;">
                  <el-select size="small" v-model="keydownScreenShotList[0]">
                    <el-option v-for="item in modifierSelectList" :key="item.value" :label="item.label" :value="item.value" />
                  </el-select>
                  +
                  <el-input style="max-width: 90px;" size="small" v-model="keydownScreenShotListKeyCom" @keydown="handleKeyDownScreenShotWin"></el-input>
                  <el-button style="width: 30px;" size="small" icon="check" @click="saveSetScreenShotWin"></el-button>
                </div>
              </template>
            </el-col>
          </el-row>
          <el-row :gutter="20" style="margin-top: 12px;">
            <el-col :span="20" :offset="4" style="margin: auto">
              <el-badge style="margin: 0 10px;" :is-dot="isUpdateAvailable">
                <el-button  @click="checkForUpdate" type=""><el-icon><UploadFilled /></el-icon>检查更新</el-button>
              </el-badge>
            </el-col>
          </el-row>
        </el-tab-pane>
        <!-- 用户反馈 -->
        <el-tab-pane label="用户反馈" name="userfeedback">
          <el-row :gutter="20">
            <el-col :span="6" :offset="4">
              <div style="width: 156px; height: 156px; border-radius: 20px" class="img-service"></div>
            </el-col>
            <el-col :span="10" :offset="4" style="margin: auto">
              <div style="line-height: normal; text-align: justify">
                <div style="color: #414141">企业微信客服</div>
                <div style="font-size: 12px; color: #8b8b8b">
                  客服及项目咨询
                </div>
              </div>
            </el-col>
          </el-row>
          <el-row :gutter="20" style="
              line-height: normal;
              text-align: justify;
              margin: 54px 0 10px 0px;
              color: #000000;
            ">
            <el-col :span="6" :offset="4">
              <div style="margin-left: 39px; padding-bottom: 10px">
                联系电话:
              </div>
            </el-col>
            <el-col :span="14">
              <div>0755-83453881-8021/83453855/26998913</div>
            </el-col>
            <el-col :span="6" :offset="4">
              <div style="
                  margin-left: 71px;
                  padding-bottom: 10px;
                  margin-top: 20px;
                ">
                邮箱:
              </div>
            </el-col>
            <el-col :span="14">
              <el-link type="primary" style="margin-top: 20px" @click="openEmail">sales@genitop.com</el-link>
            </el-col>
          </el-row>
        </el-tab-pane>
      </el-tabs>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, inject, computed } from "vue";
import { ElMessage } from "element-plus";
import { Conf } from 'electron-conf/renderer'

const settingsDrawer = inject("settingsDrawer");
const activeSetting = inject("activeSetting");

// 打开弹窗
const openSettingsDrawer = async () => {
  getLoginItemSettings()
  getCodexSafeModeEnabled()
  getCanOpenHoverWin()
  if (isWIN.value) {
    getcanOpenScreenShotWin()
  }
  getUpdateStatus()
};

// 关闭弹窗
const handleDrawerClose = async () => {
  settingsDrawer.value = false;
};

// 打开邮箱
const openEmail = () => {
  window.electronAPI?.openEmail?.("sales@genitop.com");
};

// 开机启动
const loginStart = ref(false)
const getLoginItemSettings = async () => {
  loginStart.value = await window.electronAPI.getLoginItemSettings()
}
const setLoginItemSettings = async () => {
  window.electronAPI.setLoginItemSettings(loginStart.value)
}

// 安全模式
const codexSafeModeEnabled = ref(false)
const getCodexSafeModeEnabled = async () => {
  try {
    const conf = new Conf()
    const value = await conf.get('codexSafeModeEnabled')
    codexSafeModeEnabled.value = typeof value === 'boolean' ? value : false
  } catch (_) {
    codexSafeModeEnabled.value = false
  }
}
const setCodexSafeModeEnabled = async () => {
  const conf = new Conf()
  await conf.set('codexSafeModeEnabled', codexSafeModeEnabled.value)
}

// 浮窗启动
const canOpenSideFloatWin = ref(false)
const getCanOpenHoverWin = async () => {
  const info = await window.electronAPI.getSideFloatInfo()
  canOpenSideFloatWin.value = info.canOpenSideFloatWin
}
const setCanOpenHoverWin = async () => {
  window.electronAPI.setSideFloatInfo({ canOpenSideFloatWin: canOpenSideFloatWin.value })
  const conf = new Conf()
  await conf.set('canOpenSideFloatWin', canOpenSideFloatWin.value)
  if (canOpenSideFloatWin.value) {
    window.electronAPI.sidefloatOperation({ type: 'openWin' })
  } else {
    window.electronAPI.sidefloatOperation({ type: 'closeWin' })
  }
}

// 截图
const isWIN = computed(() => {
  return window.VITE_NODE_PLATFORM != 'IOS'
})
const canOpenScreenShotWin = ref(false)
const getcanOpenScreenShotWin = async () => {
  const info = await window.electronAPI.getScreenShotInfo()
  canOpenScreenShotWin.value = info.canOpenScreenShotWin
  hotKeyScreenShotWin.value = info.openShortcut
}
const setcanOpenScreenShotWin = async () => {
  window.electronAPI.setScreenShotInfo({ canOpenScreenShotWin: canOpenScreenShotWin.value })
  const conf = new Conf()
  await conf.set('canOpenScreenShotWin', canOpenScreenShotWin.value)
}
const showScreenShotWinSet = ref(false)
const hotKeyScreenShotWin = ref('')
const openSetScreenShotWinSet = async () => {
  const info = await window.electronAPI.getScreenShotInfo()
  hotKeyScreenShotWin.value = info.openShortcut
  keydownScreenShotList.value = info.openShortcut.split('+')
  showScreenShotWinSet.value = !showScreenShotWinSet.value
}
const modifierSelectList = [
  { value: 'CmdOrCtrl', label: 'CmdOrCtrl' },
  { value: 'Alt', label: 'Alt' },
  { value: 'Shift', label: 'Shift' },
]
const keydownScreenShotList = ref(['Alt'])
const keydownScreenShotListKeyCom = computed({
  get() {
    return keydownScreenShotList.value[1]
  },
  set(value) {
    console.log(value)
  }
})
const handleKeyDownScreenShotWin = (e) => {
  if (e.key == " ") {
    keydownScreenShotList.value[1] = "Space"
  } else if (e.key == "Process") {
    keydownScreenShotList.value[1] = "Q"
  } else {
    keydownScreenShotList.value[1] = e.key
  }
}
const saveSetScreenShotWin = async () => {
  hotKeyScreenShotWin.value = keydownScreenShotList.value.join('+')
  await window.electronAPI.setScreenShotInfo({ openShortcut: hotKeyScreenShotWin.value })
  showScreenShotWinSet.value = !showScreenShotWinSet.value
}

// 检查更新
const checkForUpdate = async () => {
  await window.electronAPI.checkForUpdates()
  if (!isUpdateAvailable.value && activeSetting.value == "settings") {
    ElMessage({
      message: '当前已是最新版本',
      type: 'success',
    })
  }
}
const isUpdateAvailable = ref(false)
const getUpdateStatus = async () => {
  window.electronAPI.getClientUpdateInfoData()
}
window.electronAPI.clientUpdateInfoData((progress) => {
  isUpdateAvailable.value = progress
})
</script>

<style scoped>
.settings {
  padding: 10px;
}
.img-service {
  background-image: url(../assets/clip_image001.png);
  background-size: 100% 100%;
}
:deep(.el-col).setting-right {
  margin: 2px 15px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
:deep(.el-col).setting-label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.setting-help {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid #c0c4cc;
  color: #909399;
  font-size: 11px;
  line-height: 1;
  cursor: help;
}
</style>
