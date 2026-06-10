<template>
  <div>
    <!-- 按钮 -->
    <el-affix class="chat-header" :offset="0">
      <div style="width: 100%; display: flex; justify-content: space-between;align-items: center;" class="123">
        <!-- 房间号 -->
        <!-- <div> -->
          <div class="statusButton" text size="large" :title="props.selectedRoomName">{{ props.selectedRoomName }}</div>
        <!-- </div> -->
        <!-- 知识库 预设指令 上传功能 -->
        <div style="display: flex; align-items: center">
          <!-- 提示 i -->
          <el-popover placement="bottom" :width="620" trigger="hover">
            <template #reference>
              <div style="
                      width: 20px;
                      height: 20px;
                      color: #a9b5c0;
                      display: inline-flex;
                    ">
                <InfoFilled />
              </div>
            </template>
            <template #default>
              <div style="color: #000;font-weight: 600;">预设指令：<span
                  style="font-weight: 400;">用于角色设定，对话环境设定，或者工作场景设定。一般字数从几十字到几百字。</span></div>
              <div style="color: #000;font-weight: 600;">文件交互：<span style="font-weight: 400;">导入文件对话交互，支持txt, pdf, docx,
                  xlsx格式，支持多文件导入。</span></div>
              <div style="color: #000;font-weight: 600;">知识库：<span
                  style="font-weight: 400;">将大文件或多文件转换为知识库，根据问题取回相关信息片段，用较低成本与整个文档对话。建议使用在2万字以上的文本内容。支持txt, docx,
                  pdf格式，支持多文件导入。</span></div>
            </template>
          </el-popover>
          <!-- 预设指令 -->
          <el-button-group style="margin-left: 10px">
            <el-button :type="promptButtonType" icon="SwitchButton" @click="togglePromptSwitch"></el-button>
            <el-button style="background: #ebf5ff; color: #4b9ee9; width: 130px" @click.passive="openPrompt" :icon="PromptPropertyNameStore.promptName === '预设指令' ? 'MessageBox' : ''
      ">
              {{ PromptName }}
            </el-button>
          </el-button-group>
          <!-- 上传功能 -->
          <el-button-group style="margin-left: 10px">
            <el-button :type="UploadFileButtonType" @click="switchUploadFile" icon="SwitchButton"></el-button>
            <UploadFile ref="uploadFiles" />
          </el-button-group>
          <!-- 知识库 -->
          <el-button-group style="margin-left: 10px">
            <!-- :disabled="!hasUserLibraryPrivilege" -->
            <el-button :type="libraryButtonType" icon="SwitchButton" @click="toggleLibrarySwitch"></el-button>
            <el-button style="background: #ebf5ff; color: #4b9ee9; width: 130px" @click.passive="openLibrary" :icon="LibraryPropertyNameStore.libraryName === '知识库' ? 'Reading' : ''
      " class="library-button">
              {{ LibraryName }}
            </el-button>
          </el-button-group>
        </div>
      </div>
    </el-affix>
  </div>
</template>

<script setup>
import {
  ref,
  computed,
  provide,
  onMounted,
  watch,
  inject,
  watchEffect,
  onUnmounted,
} from "vue";
import { ElButton, ElMessage } from "element-plus";
import UploadFile from "./UploadFile/index.vue";
import { useUploadFileStore } from "../stores/UploadFile";
import { useStore } from "vuex";
import { useLibraryPropertyNameStore } from "../stores/LibraryPropertyName";
import { usePromptPropertyNameStore } from "../stores/PromptPropertyName";
import { useMitt } from "../utils/mitt";

const mitt = useMitt();

const LibraryPropertyNameStore = useLibraryPropertyNameStore();
const PromptPropertyNameStore = usePromptPropertyNameStore();

const uploadFiles = ref("");
const store = useStore();
const UploadFileStore = useUploadFileStore();
const emit = defineEmits([
  "openLibrary",
  "openPrompt",
  "offHandle",
  "OffPrompt",
  "off_FileSwitch",
]); //chat传递过来deleteChatHistory函数

const libraryButtonType = ref("");
const promptButtonType = ref("");
const UploadFileButtonType = ref("");
const hasUserLibraryPrivilege = ref(false);

const props = defineProps({
  selectedRoomName: {
    type: String,
  },
  data: {
    type: Object,
  },
  libraryEchoId: {
    type: Array,
  },
  privilege: {
    type: Array,
  }
});

// const hasUserLibraryPrivilege = computed(() => {
//   return props.privilege.includes('use_library');  
// });

// 权限
// watch(()=> props.privilege,(newValue)=>{
//   hasUserLibraryPrivilege.value = newValue.includes('use_library');
// },{deep:true});


onMounted(() => {
  // 监听上传文件按钮
  watch(
    () => props.data.file_switch,
    (newVal) => {
      UploadFileButtonType.value = newVal === false ? "" : "success";
      store.commit("setFileSwitch", newVal ? "On" : "Off");
    },
    { deep: true }
  );
  watch(
    () => uploadFiles.value?.fileList,
    (newVal) => {
      const newSwitchValue = (store.state.fileSwitch =
        newVal === "" ? "Off" : "On");
      off_FileSwitch("file_switch", newSwitchValue);
    },
    { deep: true }
  );
});

// 知识库*****************************************************************************************************
watch(
  () => props.data.library_switch,
  (newVal) => {
    libraryButtonType.value = newVal === false ? "" : "success";
    store.commit("setLibrarySwitch", newVal ? "On" : "Off");
  },
  { deep: true }
);
const toggleLibrarySwitch = () => {
  const currentSwitchValue = store.state.librarySwitch;
  const newSwitchValue = currentSwitchValue === "Off" ? "On" : "Off";

  // const newSwitchValue = store.state.librarySwitch === "Off" ? "On" : "Off"; //之前
  store.commit("setLibrarySwitch", newSwitchValue);
  offHandle("library_switch", newSwitchValue);
  console.log("librarySwitch:", store.state.librarySwitch);
  if (newSwitchValue === "On") {
    ElMessage.success("知识库已开启");
  } else {
    ElMessage.info("知识库已关闭");
  }
};
// 控制开关
const offHandle = (name, show) => {
  emit("offHandle", name, show);
};
//控制弹窗打开
const openLibrary = () => {
  emit("openLibrary");
};
// 显示名字
const LibraryName = computed(() => {
  const LibraryName = LibraryPropertyNameStore.libraryName;
  return LibraryPropertyNameStore.libraryName === "" ? "知识库" : LibraryName;
});

//开启
const LibrarySwitchOn = () => {
  store.commit("setLibrarySwitch", "On");
  offHandle("library_switch", "On");
}

mitt.on('LibrarySwitchOn', () => {
  LibrarySwitchOn();
})

//关闭
const LibrarySwitchOff = () => {
  store.commit("setLibrarySwitch", "Off");
  offHandle("library_switch", "Off");
}

mitt.on('LibrarySwitchOff', () => {
  LibrarySwitchOff();
})

// 预设指令******************************************************************************************************
watch(
  () => props.data.instruction_switch,
  (newVal) => {
    promptButtonType.value = newVal === false ? "" : "success";
    store.commit("setPromptSwitch", newVal ? "On" : "Off");
  },
  { deep: true }
);
const togglePromptSwitch = () => {
  const currentSwitchValue = store.state.promptSwitch;
  const newSwitchValue = currentSwitchValue === "Off" ? "On" : "Off";
  store.commit("setPromptSwitch", newSwitchValue);
  OffPrompt("instruction_switch", newSwitchValue);
  console.log("promptSwitch:", store.state.promptSwitch);
  if (newSwitchValue === "On") {
    ElMessage.success("预设指令已开启");
  } else {
    ElMessage.info("预设指令已关闭");
  }
};
// 控制开关
const OffPrompt = (name, show) => {
  emit("OffPrompt", name, show);
};
//控制弹窗打开
const openPrompt = () => {
  emit("openPrompt");
};
// 显示名字
const PromptName = computed(() => {
  const PromptName = PromptPropertyNameStore.promptName;
  return PromptPropertyNameStore.promptName === "" ? "预设指令" : PromptName;
});

//开启
const PromptSwitchOn = () => {
  store.commit("setPromptSwitch", "On");
  OffPrompt("instruction_switch", "On");
  // ElMessage.success("预设指令已开启");
}

mitt.on('PromptSwitchOn', () => {
  PromptSwitchOn();
})

//关闭
const PromptSwitchOff = () => {
  store.commit("setPromptSwitch", "Off");
  OffPrompt("instruction_switch", "Off");
  // ElMessage.info("预设指令已关闭");
}

mitt.on('PromptSwitchOff', () => {
  PromptSwitchOff();
})

/* 上传文件****************************************************************************************************** */

const switchUploadFile = () => {
  const currentSwitchValue = store.state.fileSwitch
  const newSwitchValue = currentSwitchValue === "Off" ? "On" : "Off";
  store.commit("setFileSwitch", newSwitchValue);
  off_FileSwitch("file_switch", newSwitchValue);
  console.log("fileSwitch:", store.state.fileSwitch);
  if (newSwitchValue === "On") {
    ElMessage.success("上传文件开启");
  } else {
    ElMessage.info("上传文件关闭");
  }
};

const off_FileSwitch = (name, show) => {
  emit("off_FileSwitch", name, show);
};

//开启
const UploadFileSwitchOn = () => {
  store.commit("setFileSwitch", "On");
  OffPrompt("file_switch", "On");
  // ElMessage.success("预设指令已开启");
}

mitt.on('UploadFileSwitchOn', () => {
  UploadFileSwitchOn();
})

/**************************************************************************************************************** */
</script>

<style scoped>
* {
  margin: 0;
  /* padding: 0; */
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(to top,
      rgba(0, 0, 0, 0),
      rgba(173, 222, 255, 0.5));
  padding: 10px;
  padding-left: 20px;
}

.collapse-header {
  border: 1px solid #ededed;
  border-radius: 10px;
  padding: 5px;
  margin-bottom: 10px;
}

:deep(.el-collapse-item__header) {
  border-bottom: none;
}

:deep(.el-collapse.el-collapse-item__content.el-collapse-border-color) {
  border-color: #ffffff !important;
  /* border: #ffffff; */
}

.form-select {
  display: flex;
  margin-left: auto;
  width: 60%;
  margin-bottom: 20px;
}

:deep(.el-dialog__footer) {
  text-align: left;
}

.dialog-span {
  font-size: 17px;
  /* font-weight: 600; */
  color: #010101;
}

/* .el-dialog__header{
  margin: 16px;
  border-bottom: 1px solid #000;
} */
:deep(.el-dialog__header) {
  margin: 16px;
  border-bottom: 1px solid #c7c7c9;
}

:deep(.el-dialog__title) {
  margin-left: -20px;
}

.statusButton {
  /* color: red; */
  /* display: inline-block; */
  /* min-width: 150px; */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /* height: 20px; */
  font-size: 18px;
  flex: 1;
  /* max-width: 22vw */
  cursor: default;
  margin: auto 10px;
  min-width: 0;
}

.button-group {
  /* background: #f3f3f3; */
  color: #41a2fb;
}

:deep(.el-affix > div:first-child) {
  width: 100%;
}

.navbar-fixed-bottom {
  /* width: 110px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis; */
}

:deep(.el-button > span) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline;
}
</style>
