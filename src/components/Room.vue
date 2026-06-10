<template>
<div class="room-container">
  <el-button title="折叠/展开" class="flod-content" size="small" type="info" plain circle @click="showRoomList = !showRoomList">
    <svg
      :class="{'is-active': isActive}"
      :style="{
        width: '16px',
        transform: showRoomList ? 'rotate(90deg)' : ''
      }"
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      width="64"
      height="64"
    >
      <path d="M408 442h480c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8H408c-4.4 0-8 3.6-8 8v56c0 4.4 3.6 8 8 8zm-8 204c0 4.4 3.6 8 8 8h480c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8H408c-4.4 0-8 3.6-8 8v56zm504-486H120c-4.4 0-8 3.6-8 8v56c0 4.4 3.6 8 8 8h784c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8zm0 632H120c-4.4 0-8 3.6-8 8v56c0 4.4 3.6 8 8 8h784c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8zM142.4 642.1L298.7 519a8.84 8.84 0 0 0 0-13.9L142.4 381.9c-5.8-4.6-14.4-.5-14.4 6.9v246.3a8.9 8.9 0 0 0 14.4 7z" />
    </svg>
  </el-button>
  <div v-show="showRoomList" class="room-layout" v-infinite-scroll="getRoomList" :infinite-scroll-disabled="disabled" :infinite-scroll-immediate="true" infinite-scroll-distance="0">
    <el-button type="success" plain icon="CirclePlus" @click="addChatRoom">新增对话</el-button>
    <el-menu class="room-list" :default-active="activeRoom" mode="vertical" @select="selectRoom"
      background-color="rgba(245, 245, 245, 0.3)">
      <!-- disabled 消息回来之前这个房间禁止状态 -->
      <el-menu-item class="room-item" v-for="room in chatRooms" :key="room.id" :index="room.id.toString()">
        <!-- 房间名 -->
        <el-tooltip :content="room.name" placement="bottom" effect="light" :hide-after="0"
          :disabled="room.name.length <= 10">
          <span class="room-name">{{ room.name }}</span>
        </el-tooltip>
        <!-- 小圆点图标 -->
        <el-dropdown @command="roomAction" trigger="click">
          <!-- el-button + @click.stop -->
          <el-button class="room-item-button" icon="More" type="primary" circle size="small" @click.stop  />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item :command="{ action: 'rename', roomId: room.id ,roomName: room.name }"  icon="Edit">重命名</el-dropdown-item>
              <el-dropdown-item :command="{ action: 'delete', roomId: room.id ,roomName: room.name }"  icon="Delete">删除</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-menu-item>
    </el-menu>
    <el-text v-if="loading">加载中...</el-text>
    <el-text v-else-if="finish">没有更多房间了</el-text>
    <el-text style="cursor: pointer;" v-else @click="getRoomList">点击加载更多</el-text>
    <el-dialog title="操作" v-model="dialogVisible" width="20%" @close="dialogVisible = false">
      <template v-if="actionType === 'rename'">
        <el-input v-model="newRoomName" placeholder="请输入对话名称"></el-input>
      </template>
      <template v-else-if="actionType === 'delete'">
        <span>确定要执行此操作吗？</span>
      </template>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmAction">确定</el-button>
      </template>
    </el-dialog>
  </div>
</div>
</template>

<script setup>
import {
  ref,
  onMounted,
  computed,
  provide,
  nextTick,
  onUnmounted,
} from "vue";
import { ElMessage } from "element-plus";
// import api from "@/utils/request";
import { useMitt } from "../utils/mitt";
import {useLibraryPropertyNameStore} from '../stores/LibraryPropertyName';
import {usePromptPropertyNameStore} from '../stores/PromptPropertyName';
import { useLibraryPropertyStore } from '../stores/LibraryProperty';
import {usePromptPropertyStore} from '../stores/PromptProperty';
import {useUploadFileStore} from '../stores/UploadFile';
import { useUploadFilePathStore } from '../stores/UploadFilePath';
import {debounce} from '@/utils/debounce';
import {throttle} from '@/utils/throttle';
import {RoomListPaging,AddRoom,ModifyRoom,RemoveRoom,DefaultCache} from '@/api/mainActivity/Room';
import {cancelRequest} from '@/utils/request';



const mitt = useMitt();

const emit = defineEmits(["updateRecordRoomProperties", "getRoomAttributes","getChatHistory"]);
const LibraryPropertyNameStore = useLibraryPropertyNameStore();
const PromptPropertyNameStore = usePromptPropertyNameStore();
const LibraryPropertyStore = useLibraryPropertyStore();
const PromptPropertyStore = usePromptPropertyStore();
const UploadFilePathStore = useUploadFilePathStore();
const UploadFileStore = useUploadFileStore();


const props = defineProps({
  messages: {
    type: Array,
  },
});

const activeRoom = ref(""); // 选中的房间
const chatRooms = ref([]); // 房间列表
const dialogVisible = ref(false); // “操作”对话框是否可见
const actionType = ref(""); // 操作类型
const newRoomName = ref(""); // 重命名时新房间名称
const RoomAttributes = ref([]); //请求回来的房间属性
const defaultID = ref("");
const NewID = ref("");
const otherRoomId = ref("");
const finish = ref(false) // 是否加载完成
const size = ref(30); // 每页显示的条数
const page = ref(1); // 当前页码
const disabled = computed(() => loading.value || finish.value)
const loading = ref(false); // 是否正在加载
const roomListData = ref({
  max_pages: 0,
}); // 房间列表数据 

const getRoomList = async (init = 0) => {
  if (loading.value) return;
  loading.value = true
  if(init == 1) {
    chatRooms.value = []
    roomListData.value = {
      max_pages: 0,
    }
    page.value = 1
    finish.value = false
  } else {
    page.value += 1
  }
  if (finish.value) return;
  try {
    const response = await RoomListPaging({
      size: size.value,
      page: page.value,
    });
    loading.value = false
    if(response?.data?.results?.length) {
      chatRooms.value.push(...response.data.results
      .map((room) => ({
        id: room.id,
        name: room.room_name,
      })))
      roomListData.value = response?.data || {
        max_pages: 0,
      }
    }
    //获取房间成功
    // console.log('获取房间成功',chatRooms.value);
  } catch (error) {
    loading.value = false
    cancelRequest();
  } finally {
    finish.value = roomListData.value?.max_pages <= page.value
    loading.value = false
  }
};

const selectedRoomName = ref("新房间");
const findRoomNameById = async (roomId) => {
  const room = chatRooms.value.find((room) => room.id === Number(roomId));
  selectedRoomName.value = room ? room.name : "";
};

defineExpose({
  activeRoom,
  selectedRoomName,
  chatRooms,
  RoomAttributes,
  defaultID,
  NewID,
});

//增加房间
const addChatRoom = throttle(async () => {
  try {
    console.log("请求新增房间");
    const response = await AddRoom({room_name: "新房间"})
    if (response.status === 201) {
      const data = response.data;
      console.log("新增房间成功", data);

      ElMessage.success("新增房间成功");
      //更新房间列表
      await getRoomList(1);
      // selectRoom(data.id);   // 默认选中新建房间

      // 默认值属性
      updateRecordRoomProperties(data.id);
      emit("getRoomAttributes"); //请求List
      // 清空
      LibraryPropertyNameStore.setDelLibraryName();
      LibraryPropertyStore.deleteLibraryID(); //现在

      PromptPropertyNameStore.setDelPromptName();
      PromptPropertyStore.deletePromptId();//现在

      UploadFilePathStore.deleteFilePath();//文件

      console.log("房间列表已更新");
      // 处理成功响应
    } else {
      // 处理错误响应
    }
  } catch (error) {
    // 处理请求错误
    console.log(error);
  }
},500);

// 重命名函数
const renameRoom = async (id, roomName, noTips = 0) => {
  try {
    console.log("请求重命名房间");
    const response = await ModifyRoom(id,{id: id,room_name: roomName || newRoomName.value})
    if (response.status === 200) {
      !noTips && ElMessage.success("重命名房间成功");
     
      // console.log('重命名房间成功',response.data);
      //更新房间列表
      await getRoomList(1);
      await findRoomNameById(id);

      // 处理成功响应
    } else {
      // 处理错误响应
    }
  } catch (error) {
    // 处理请求错误
    console.log(error);
    ElMessage.error(error?.response?.data?.message || "重命名房间失败");
  }
};
onMounted(() => {
  mitt.on("renameRoom", mittRenameRoom);
})
onUnmounted(() => {
  mitt.off("renameRoom", mittRenameRoom);
})
const mittRenameRoom = (options) => {
  renameRoom(options.roomId, options.roomName, 1);
};


const roomAction = (command) => {
  if (command.action === "rename") {
    actionType.value = "rename";
    dialogVisible.value = true;

    // const activeRoom_ = activeRoom.value;
    // const chatRooms_ = chatRooms.value.find(
    //   (item) => item.id === Number(activeRoom_)
    // );
    // newRoomName.value = chatRooms_.name;
    // 选中其他房间
    otherRoomId.value = command.roomId;
    newRoomName.value = command.roomName;
  } else if (command.action === "delete") {
    otherRoomId.value = command.roomId;
    actionType.value = "delete";
    dialogVisible.value = true;
  }
};

const confirmAction = async () => {
  const id = otherRoomId.value;
  // 去对比是不是别的房间id
  if (dialogVisible.value) {
    if (actionType.value === "rename") {
      await renameRoom(id);
    } else if (actionType.value === "delete") {
      // 判断如果是最后一个房间 不允许删除
      if(chatRooms.value.length === 1){
        ElMessage.info("最后一个房间不允许删除");
        return;
      }
      await deleteRoom(id);
    }
    dialogVisible.value = false;
  }
};

const deleteRoom = async (id) => {
  try {
    const response = await RemoveRoom(id);

    if (response.status === 200) {
      ElMessage.success("删除房间成功");

      props.messages.splice(0, props.messages.length); //聊天记录清空
      activeRoom.value = ""; //当前选中清空

      //更新房间列表
      await getRoomList(1);
      await findRoomNameById(id);
      //如果所有房间为空，则activeRoom置为空。如果删除的是当前选中的房间，则将选中房间置为第一个房间。
      if (chatRooms.value.length === 0) {
        activeRoom.value = "";
      }
      if (id === activeRoom.value) {
        activeRoom.value = chatRooms.value[0].id.toString();
        selectRoom(activeRoom.value);
      }
      // console.log('选中房间', activeRoom.value);
      // 处理成功响应
    } else {
      // 处理错误响应
    }
  } catch (error) {
    // 处理请求错误
  }
};

// 获取到具体房间号
const selectRoom = debounce(async(index) => {
  // 取消请求
  cancelRequest();
  defaultID.value = activeRoom.value;
  activeRoom.value = index;
  NewID.value = index;
  findRoomNameById(activeRoom.value);

  // console.log(activeRoom.value,'78999999999999');

  // 清空文件
  UploadFileStore.setFileList();
  emit("updateRecordRoomProperties"); //修改
  emit("getRoomAttributes"); //请求List
},400);

window.electronAPI.openRoomById(async (progress) => {
  await getRoomList(1);
  selectRoom(progress.id)
})

onMounted(async () => {
  await getRoomList(1);
  // 选中最后一个房间自动
  if (chatRooms.value.length > 0) { 
    activeRoom.value = chatRooms.value[0].id.toString(); //第一个
    // activeRoom.value = chatRooms.value[chatRooms.value.length - 1].id.toString(); //最后一个
    findRoomNameById(activeRoom.value);
  } else {
    console.log("房间列表为空");
  };
  await selectRoom(activeRoom.value);
});


const other_config = ref({});

//新增默认数据
const updateRecordRoomProperties = async(id) => {
  if(!id)return
  let list = {
    room: id, //房间号ID
    library: "", //知识库
    library_switch: false, //知识库开关
    instruction: "", //预设指令ID
    instruction_switch: false, //预设指令开关
    file_path: "", //文件路径
    file_switch: false, //文件开关
    llm_model: "", //模型
    memory_buffer_size: 8, //记忆缓存数
    other_config:JSON.stringify(other_config.value),
  };
  try {
    await DefaultCache(id,{...list})
  } catch (error) {
    console.log(error);
  }
};

const showRoomList = ref(true)
</script>

<style scoped lang="scss">
.room-layout {
  display: flex;
  flex-direction: column;
  color: #333;
  width: 160px;
  max-height: calc(100vh - 70px);
  min-width: 100px;
  overflow-y: auto;
  border-bottom: 1px solid #ccc;
  border-radius: 5px;
}

.room-container{
  position: relative;
}

.flod-content{
  border-radius: 0 50% 50% 0;
  position: absolute;
  right: -30px;
  top: 15px;
  font-size: 18px;
  z-index: 1;
}
.room-layout::-webkit-scrollbar-track {
  display: none;
}
.room-layout::-webkit-scrollbar {
  width: 5px;
}
.room-layout::-webkit-scrollbar-thumb {
  display: none;
  width: 5px;
  background-color: #3333332f;
  border-radius: 5px;
}
.room-layout::-webkit-scrollbar-corner{
  display: none;
}

.room-layout:hover{
  &::-webkit-scrollbar-thumb {
    display: block;
  }
}

.room-list {
  margin-top: 10px;
}

.room-item {
  display: flex;
  justify-content: space-between;
  margin-left: -10px;
}

.room-name {
  display: inline-block;
  width: 100px;
  /* 设置一个固定的宽度 */
  white-space: nowrap;
  /* 不换行 */
  overflow: hidden;
  /* 超出部分隐藏 */
  text-overflow: ellipsis;
  /* 显示省略号 */
}

.room-item-button {
  margin-left: auto;
  margin-right: -10px;
  /* 考虑到默认的padding */
  opacity: 0.1;
}

.room-item-button:hover {
  opacity: 1;
}

.room-item-button :deep(.el-icon) {
  margin-right: 0;
}

:deep(.is-active) {
  background-color: rgb(230, 248, 255) !important;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
