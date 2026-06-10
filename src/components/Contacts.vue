<template>
    <div class="contacts-layout">
        <el-button 
        type="primary" 
        plain
        icon="Switch" 
        @click="chooseEnterprise"
        >切换群组</el-button>
        <el-dialog
          v-model="setGroupVisible"
          title="设置群组"
          width="30%"
        >
        <el-dialog
        v-model="applyVisible"
        title="申请加入群组"
        width="30%"
        append-to-body
        >
        <el-table
            :data="searchEnterpriseList"
            style="width: 100%"
        >
            <el-table-column
            prop="name"
            label="企业名称"
            />
            <el-table-column label="操作">
            <template #default="{ row }">
                <el-button type="primary" @click="applyEnterprise(row)">申请加入</el-button>
            </template>
            </el-table-column>
        </el-table>
        </el-dialog>
        <div class="group-search">
          <el-input
            placeholder="请输入企业名称"
            clearable
            v-model="searchValue"
            @clear="searchValue = ''"
            style="margin-right: 10px;"
          />
          <el-button
            icon="Plus"
            @click="searchEnterprise"
          />
        </div>
          <el-table
            :data="filteredMyEnterpriseList"
            style="width: 100%"
            @row-click="getEnterprise"
          >
            <el-table-column
              prop="name"
              label="企业名称"
            />
          </el-table>
          
        </el-dialog>
        <el-menu
            class="room-list"
            :default-active="activeRoom"
            mode="vertical"
            @select="selectRoom"
            background-color="rgba(245, 245, 245, 0.3)"
        >
            <el-menu-item
                class="room-item"
                v-for="room in chatRooms"
                :key="room.id"
                :index="room.id.toString()"
            >
                <el-tooltip 
                :content="room.name" 
                placement="bottom" 
                effect="light"
                :hide-after= 0
                :disabled="room.name.length <= 10">
                    <span class="room-name">{{ room.name }}</span>
                </el-tooltip>
                <el-dropdown @command="roomAction" trigger="click">
                    <el-button 
                    class="room-item-button"
                    icon="More" 
                    type="primary"
                    circle
                    size="small"
                    />
                    <template #dropdown>
                        <el-dropdown-menu>
                        <el-dropdown-item command="rename" icon="Edit">重命名</el-dropdown-item>
                        <el-dropdown-item command="delete" icon="Delete">删除</el-dropdown-item>
                        </el-dropdown-menu>
                </template>
                </el-dropdown>
            </el-menu-item>
        </el-menu>
        <el-dialog
        title="操作"
        v-model="dialogVisible"
        width="20%"
        @close="dialogVisible = false"
        >
        <template v-if="actionType === 'rename'">
            <el-input v-model="newRoomName" placeholder="请输入对话名称"></el-input>
        </template>
        <template v-else-if="actionType === 'delete'">
            <span>确定要执行此操作吗？</span>
        </template>
        <span slot="footer" class="dialog-footer">
            <el-button @click="dialogVisible = false">取消</el-button>
            <el-button type="primary" @click="confirmAction">确定</el-button>
        </span>
        </el-dialog>
    </div>
    
</template>

<script setup>
import { ref, onMounted, computed, reactive, nextTick } from 'vue';
import api from "@/utils/request";
import { ElMessage } from 'element-plus';

const setGroupVisible = ref(false);
const activeRoom = ref(''); // 选中的房间
const chatRooms = ref([]);  // 房间列表
const dialogVisible = ref(false);   // “操作”对话框是否可见
const actionType = ref(''); // 操作类型
const newRoomName = ref('');    // 重命名时新房间名称
let myEnterpriseList = reactive([]); // 我的企业列表
const searchValue = ref('');
const filteredMyEnterpriseList = computed(() => {
  // console.log('搜索值',searchValue.value);
    if (searchValue.value) {
        return myEnterpriseList.filter(item => item.name.includes(searchValue.value));
    }
    return myEnterpriseList;
});

const chooseEnterprise = async () => {
    await getMyEnterpriseList();
    setGroupVisible.value = true;
}
let currentEnterprise = reactive({});
const getEnterprise = (row) => {
  Object.assign(currentEnterprise, row);
  // console.log('当前企业',currentEnterprise);
  //保存为本地存储
  localStorage.setItem('currentEnterprise', JSON.stringify(currentEnterprise));
  setGroupVisible.value = false;
}

const getMyEnterpriseList = async () => {
    try {
        const response = await api.get('chat/my_enterprise/');
        if (response.status === 200) {
            myEnterpriseList= response.data;
            // console.log('我的企业列表',myEnterpriseList);
        } else {
            // 处理错误响应
            ElMessage.error('获取我的企业列表失败');
        }
    } catch (error) {
        // 处理请求错误
        ElMessage.error(error);
    }
}
const applyVisible = ref(false);
let searchEnterpriseList = reactive([]);
const searchEnterprise = async () => {
    if (searchValue.value === '') {
        ElMessage.error('请输入企业名称');
        return;
    }
    try {
        const response = await api.get(`chat/search_enterprise/${searchValue.value}/`);
        if (response.status === 200) {
            searchEnterpriseList= response.data;
            // console.log('搜索企业列表',myEnterpriseList);
            nextTick();
        } else {
            // 处理错误响应
            ElMessage.error('搜索企业失败');
        }
    } catch (error) {
        // 处理请求错误
        ElMessage.error(error);
    }
    applyVisible.value = true;
}

const applyEnterprise = async (row) => {
    try {
        const response = await api.post('chat/apply_enterprise/', {
            enterprise_id: row.id,
        });
        if (response.status === 201) {
            ElMessage.success('申请加入企业成功');
            // console.log('申请加入企业成功',response.data);
            //更新房间列表
            await getRoomList();
            //如果所有房间为空，则activeRoom置为空。如果删除的是当前选中的房间，则将选中房间置为第一个房间。
            if (chatRooms.value.length === 0) {
                activeRoom.value = '';
            }else{
                activeRoom.value = chatRooms.value[0].id.toString();
            }
            console.log('选中房间',activeRoom.value);
            findRoomNameById(activeRoom.value);
            // console.log('选中房间名称', selectedRoomName.value);
            applyVisible.value = false;
        } else {
          // 处理错误响应
          ElMessage.error('申请加入企业失败');
        }
      } catch (error) {
        // 处理请求错误
        ElMessage.error(error);
      }
}

const selectedRoomName = ref('新房间');
const findRoomNameById = (roomId) => {
  const room = chatRooms.value.find(room => room.id === Number(roomId));
  selectedRoomName.value = room ? room.name : '';
};

defineExpose({ 
    activeRoom,
    selectedRoomName, 
});
//增加房间
const addChatRoom = async () => {
  try {
    console.log('请求新增房间');
    const response = await api.post('llm/add_room/', {
        room_name: '新房间',
    });

    if (response.status === 201) {
        // const data = response.data;
        // console.log('新增房间成功',data);
        ElMessage.success('新增房间成功');
        //更新房间列表
        getRoomList();
        console.log('房间列表已更新');
      // 处理成功响应
    } else {
      // 处理错误响应
    }
  } catch (error) {
    // 处理请求错误
  }
};

const roomAction = (command) => {
  if (command === 'rename') {
    actionType.value = 'rename';
    dialogVisible.value = true;
  } else if (command === 'delete') {
    actionType.value = 'delete';
    dialogVisible.value = true;
  }
};

const confirmAction = async () => {
  const id = activeRoom.value;
  if (dialogVisible.value) {
    if (actionType.value === 'rename') {
      await renameRoom(id);
    } else if (actionType.value === 'delete') {
      await deleteRoom(id);
    }
    dialogVisible.value = false;
  }
};

const renameRoom = async (id) => {
    try {
        console.log('请求重命名房间');
        const response = await api.post(`llm/modify_room/${id}/`, {
            id: id,
            room_name: newRoomName.value,
        });
    
        if (response.status === 200) {
            ElMessage.success('重命名房间成功');
            // console.log('重命名房间成功',response.data);
            //更新房间列表
            getRoomList();
            console.log('房间列表已更新');
          // 处理成功响应
        } else {
          // 处理错误响应
        }
      } catch (error) {
        // 处理请求错误
      }
}

const deleteRoom = async (id) => {
    try {
        const response = await api.delete(`llm/delete_room/${id}/`, {
            id: id,
        });
    
        if (response.status === 200) {
            ElMessage.success('删除房间成功');
            // console.log('删除房间成功',response.data);
            //更新房间列表
            await getRoomList();
            //如果所有房间为空，则activeRoom置为空。如果删除的是当前选中的房间，则将选中房间置为第一个房间。
            if (chatRooms.value.length === 0) {
                activeRoom.value = '';
            }else if (id === activeRoom.value) {
                activeRoom.value = chatRooms.value[0].id.toString();
            }
            console.log('选中房间',activeRoom.value);
          // 处理成功响应
        } else {
          // 处理错误响应
        }
      } catch (error) {
        // 处理请求错误
      }
}

const selectRoom = (index) => {
    activeRoom.value = index;
    // console.log('选中房间',index);
    findRoomNameById(activeRoom.value);
    // console.log('选中房间名称', selectedRoomName.value);
}

onMounted(async() => {
  //读取当前企业
  currentEnterprise = JSON.parse(localStorage.getItem('currentEnterprise'));
  // console.log('当前企业',currentEnterprise);
  //将currentEnterprise推送至chatRooms;
  chatRooms.value.push(currentEnterprise);
  // 获取房间列表
  // await getRoomList();

  // 将第一个房间的id赋值给activeRoom
  if (chatRooms.value.length > 0) {
    activeRoom.value = chatRooms.value[0].id.toString();
    // console.log('选中房间',activeRoom.value);
    findRoomNameById(activeRoom.value);
    // console.log('选中房间名称', selectedRoomName.value);
  }else{
    console.log('房间列表为空');
  }
});
</script>

<style scoped>
.contacts-layout{
    display: flex;
    flex-direction: column;
    color: #333;
    width: 160px;
    max-height: 800px;
    min-width: 100px;
    overflow-y: hidden; 
    border-bottom: 1px solid #ccc;
    border-radius: 5px;
  }
.contacts-layout:hover{
    overflow-y: auto;
}
.group-search{
    display: flex;
    margin-bottom: 10px;
}
.room-list{
    margin-top: 10px;
}
.room-item{
    display: flex;
    justify-content: space-between;
    margin-left: -10px;
}
.room-name {
  display: inline-block;
  width: 100px; /* 设置一个固定的宽度 */
  white-space: nowrap; /* 不换行 */
  overflow: hidden; /* 超出部分隐藏 */
  text-overflow: ellipsis; /* 显示省略号 */
}
.room-item-button{
    margin-left: auto;
    margin-right: -10px; /* 考虑到默认的padding */
    opacity: 0.1;
}
.room-item-button:hover {
    opacity: 1;
}
.room-item-button :deep(.el-icon){
    margin-right: 0;
}
:deep(.is-active) {
    background-color:rgb(230, 248, 255) !important;
}
.dialog-footer{
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
}
</style>