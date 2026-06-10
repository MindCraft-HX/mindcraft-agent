<template>
  <el-tabs tab-position="left" v-model="activeName" class="prompt-tabs">
    <!-- 我的 -->
    <el-tab-pane label="我的" name="mine">
      <div>
        <!-- 标题 -->
        <div style="display: flex; justify-content: space-between">
          <div style="
              color: var(--el-text-color-primary);
              font-size: 16px;
              font-weight: 700;
              padding: 10px 0px;
            ">
            我的指令
          </div>
          <div>
            <!-- <div class="prompt-switch">
              <el-text type="info" style="margin-bottom: 10px">指令提示词</el-text>
              <el-radio-group v-model="promptSwitch" size="large">
                <el-radio-button label="On" />
                <el-radio-button label="Off" />
              </el-radio-group>
            </div> -->
          </div>
        </div>

        <!-- 我的创建 -->
        <div style="margin-top: 16px">
          <div style="
              display: flex;
              justify-content: space-between;
              align-items: center;
            ">
            <p style="color: #c3c6c5; font-size: 14px">我的创建：</p>
            <el-input v-model="mySearchKeyword" placeholder="请输入关键字" style="width: 200px; height: 30px">
              <template #prepend>
                <el-button icon="Search" />
              </template>
            </el-input>
          </div>
          <!-- 弹窗 -->
          <el-dialog title="编辑" v-model="editDialogVisible" @close="editDialogVisible = false" append-to-body>
          <el-form :model="currentRow" label-position="top" label-width="100px" class="add-prompt">
            <el-form-item label="指令名称" style="width: 50%">
              <el-input v-model="currentRow.prompt_name"></el-input>
              <el-switch v-model="currentRow.is_shared" active-text="共享" inactive-text="不共享" size="large"></el-switch>
            </el-form-item>
            <el-form-item label="指令类型">
              <el-select v-model="currentRow.prompt_type">
                <el-option label="标准指令" value="standard"></el-option>
                <el-option label="个性化指令" value="personalized"></el-option>
                <el-option label="自定义指令" value="customized"></el-option>
              </el-select>
            </el-form-item>
            <template v-if="currentRow.prompt_type === 'standard'">
              <el-form-item label="指令内容（提示词）" class="form-item">
                <el-input v-model="currentRow.standard_prompt" type="textarea" :autosize="{ minRows: 4 }"></el-input>
              </el-form-item>
            </template>
            <template v-else-if="currentRow.prompt_type === 'personalized'">
              <el-form-item label="用户档案（告诉AI关于你自己的一些信息或偏好，以便于AI更好地回答你）" class="form-item">
                <el-input v-model="currentRowPrompt.personalized_prompt.user_profile
                  " type="textarea" :autosize="{ minRows: 4 }"></el-input>
              </el-form-item>
              <el-form-item label="回答偏好（你希望AI按照什么样的方式或者风格回答你）" class="form-item">
                <el-input v-model="currentRowPrompt.personalized_prompt
                  .response_preference
                  " type="textarea" :autosize="{ minRows: 4 }"></el-input>
              </el-form-item>
            </template>
            <template v-else-if="currentRow.prompt_type === 'customized'">
              <el-form-item v-for="(
                          item, index
                        ) in currentRowPrompt.customized_prompt" :key="index" :label="`Item ${index + 1}`">
                <el-input v-model="item.key" placeholder="标题1、标题2、……标题n" class="custom-form"></el-input>
                <el-input v-model="item.value" placeholder="内容1、内容2、……内容n" type="textarea" :autosize="{ minRows: 4 }"
                  class="custom-form"></el-input>
                <el-button type="danger" icon="Delete" @click="removeItemEdit(index)">删除</el-button>
              </el-form-item>
              <el-form-item>
                <el-button type="success" icon="CirclePlus" @click="addItemEdit">新增</el-button>
              </el-form-item>
            </template>
            <el-form-item label="回应发散性（LLM Temperature）">
              <el-slider v-model="currentRow.llm_temperature" :step="10" show-stops :format-tooltip="temperatureFormat"
                :marks="temperatureMarks" class="form-item" />
            </el-form-item>
          </el-form>
          <div class="add-prompt-footer">
            <el-button type="primary" @click="editPrompt(currentRow)">保存</el-button>
            <el-button type="danger" @click="editDialogVisible = false">取消</el-button>
          </div>
        </el-dialog>
          <!-- 表格 -->
          <CustomTable :DataList="filterMyPromptTemplateList" :selectedPrompt="selectedPrompt" :selectedRowId="selectedRowId" :showOperation="true" :showPullDown="true" :showSelect="true"
           :showPromptTypeLabel="true" @row-click="rowClick" @open-edit-dialog="openEditDialog" @delete-prompt="deletePrompt" />
        </div>

        <!-- 分割线 -->
        <el-divider />

        <!-- 我的关注 -->
        <div style="margin-top: 16px">
          <div style="
              display: flex;
              justify-content: space-between;
              align-items: center;
            ">
            <p style="color: #c3c6c5; font-size: 14px">我的关注：</p>
            <el-input v-model="attentionKeyword" placeholder="请输入关键字" style="width: 200px; height: 30px">
              <template #prepend>
                <el-button icon="Search" />
              </template>
            </el-input>
          </div>
          <!-- 表格 -->
          <CustomTable :DataList="filterMyAttentionList" :selectedPrompt="selectedPrompt" :selectedRowId="selectedRowId" :showAttention="true" :showPullDown="true" :showSelect="true"
           :showPromptTypeLabel="true"  @row-click="rowClick" @un-follow-switch="unFollowSwitch" />
        </div>
      </div>
    </el-tab-pane>
    <!-- 列表 -->
    <el-tab-pane label="列表" name="list">
      <div class="prompt-list">
        <div class="prompt-list-header">
          <el-descriptions class="selected-prompt" title="当前指令提示词" direction="vertical" :column="3" border
            style="width: 100%">
            <el-descriptions-item label="提示词名称">
              {{ selectedPromptList.prompt_name }}
            </el-descriptions-item>
            <el-descriptions-item label="指令类型">
              {{ selectedPromptList.prompt_type_label }}
            </el-descriptions-item>
            <el-descriptions-item label="创建时间">
              {{ selectedPromptList.created_at }}
            </el-descriptions-item>
            <el-descriptions-item label="创建人">
              {{ selectedPromptList.created_by }}
            </el-descriptions-item>
            <el-descriptions-item label="回复发散性">
              {{ selectedPromptList.llm_temperature_label }}
            </el-descriptions-item>
            <el-descriptions-item label="共享">
              {{ selectedPromptList.is_shared_label }}
            </el-descriptions-item>
            <div>
              <el-descriptions-item label="指令内容">
                <el-card class="card-first">
                  <div v-if="selectedPromptList.prompt_type === 'standard'">
                    {{ selectedPromptList.standard_prompt }}
                  </div>
                  <div v-else-if="selectedPromptList.prompt_type === 'personalized'
                    ">
                    <div>
                      User Profile:
                      {{
                        formatPersonalizedPrompt(
                          selectedPromptList.personalized_prompt
                        ).user_profile
                      }}
                    </div>
                    <div>
                      Response Preference:
                      {{
                        formatPersonalizedPrompt(
                          selectedPromptList.personalized_prompt
                        ).response_preference
                      }}
                    </div>
                  </div>
                  <div v-else-if="selectedPromptList.prompt_type === 'customized'">
                    {{
                      formatCustomizedPrompt(
                        selectedPromptList.customized_prompt
                      )
                    }}
                  </div>
                </el-card>
              </el-descriptions-item>
            </div>
          </el-descriptions>
        </div>
        <el-divider v-if="InstructionPromptWord"  />
        <div class="search-prompt">
          <div style="color: rgb(195, 198, 197);font-size: 14px;">共享列表:</div>
          <!-- <el-select v-model="searchType" placeholder="选择搜索类型" style="margin-right: 10px">
            <el-option label="指令名称" value="prompt_name"></el-option>
            <el-option label="创建用户" value="created_by"></el-option>
            <el-option label="指令类似" value="prompt_type"></el-option>
            <el-option label="共享" value="is_shared_label"></el-option>
          </el-select> -->
          <div>
            <el-select v-model="AttentionScreening" clearable placeholder="关注数量"
              style="width: 150px;margin-right:10px;;" @clear="handleClear" @change="handleScreen" >
              <el-option v-for="item in numberOfConcerns" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <el-input v-model="searchKeyword" placeholder="请输入关键字" style="width: 200px;" clearable  @clear="clearSearch">
            <template #prepend>
              <el-button icon="Search" @click="handleSearch"/>
            </template>
          </el-input>
          </div>

        </div>
        <!-- 表格 -->
        <CustomTable :DataList="promptList" :showAttention="true" :showTag="true" :showUpdated="true" @rowClick="pitchOnRow" @un-follow-switch="attentionSwitch"/>
        <!-- 分页 -->
        <pageComponent style="margin-top: 10px;float: right" :total="total" :pageSize="pageSize" @update:currentPage="handlePageChange" @update:pageSize="handleSizeChange"  />
      </div>
    </el-tab-pane>
    <!-- 添加 -->
    <el-tab-pane label="添加" name="add" :disabled="!userType" >
      <el-form :model="instructionPromptForm" label-position="top" label-width="100px" class="add-prompt">
        <el-form-item label="指令名称" style="width: 50%">
          <el-input v-model="instructionPromptForm.prompt_name"></el-input>
          <el-switch v-model="instructionPromptForm.is_shared" active-text="共享" inactive-text="不共享"
            size="large"></el-switch>
        </el-form-item>
        <el-form-item label="指令类型">
          <el-select v-model="instructionPromptForm.prompt_type">
            <el-option label="标准指令" value="standard"></el-option>
            <!-- <el-option label="个性化指令" value="personalized"></el-option>
            <el-option label="自定义指令" value="customized"></el-option> -->
          </el-select>
        </el-form-item>
        <template v-if="instructionPromptForm.prompt_type === 'standard'">
          <el-form-item label="指令内容（提示词）" class="form-item">
            <el-input v-model="instructionPromptForm.standard_prompt" type="textarea"
              :autosize="{ minRows: 4 }"></el-input>
          </el-form-item>
        </template>
        <template v-else-if="instructionPromptForm.prompt_type === 'personalized'">
          <el-form-item label="用户档案（告诉AI关于你自己的一些信息或偏好，以便于AI更好地回答你）" class="form-item">
            <el-input v-model="instructionPromptForm.personalized_prompt.user_profile" type="textarea"
              :autosize="{ minRows: 4 }"></el-input>
          </el-form-item>
          <el-form-item label="回答偏好（你希望AI按照什么样的方式或者风格回答你）" class="form-item">
            <el-input v-model="instructionPromptForm.personalized_prompt.response_preference
              " type="textarea" :autosize="{ minRows: 4 }"></el-input>
          </el-form-item>
        </template>
        <template v-else-if="instructionPromptForm.prompt_type === 'customized'">
          <el-form-item v-for="(item, index) in instructionPromptForm.customized_prompt" :key="index"
            :label="`Item ${index + 1}`">
            <el-input v-model="item.key" placeholder="标题1、标题2、……标题n" class="custom-form"></el-input>
            <el-input v-model="item.value" placeholder="内容1、内容2、……内容n" type="textarea" :autosize="{ minRows: 4 }"
              class="custom-form"></el-input>
            <el-button type="danger" icon="Delete" @click="removeItem(index)">删除</el-button>
          </el-form-item>
          <el-form-item>
            <el-button type="success" icon="CirclePlus" @click="addItem">新增</el-button>
          </el-form-item>
        </template>
        <el-form-item label="回应发散性（LLM Temperature）">
          <el-slider v-model="instructionPromptForm.llm_temperature" :step="10" show-stops
            :format-tooltip="temperatureFormat" :marks="temperatureMarks" class="form-item" />
        </el-form-item>
      </el-form>
      <div class="add-prompt-footer">
        <el-button type="primary" @click="createPrompt">保存</el-button>
        <el-button type="danger" @click="resetPrompt">重置</el-button>
      </div>
    </el-tab-pane>
  </el-tabs>
</template>

<script setup>
import { onMounted, ref, computed, inject, watch, nextTick} from "vue";
import { useStore } from "vuex";
// import api from "@/utils/request";
import { ElMessage,ElMessageBox } from "element-plus";
import { usePromptPropertyNameStore } from "../stores/PromptPropertyName";
import { usePromptPropertyStore } from "../stores/PromptProperty";
import { userVipTypeStore } from "../stores/vipType";
import { useMitt } from "../utils/mitt";
import {
  getInstructionPrompt,
  getUserProfile,
  myInstructionPromptList,
  postFollowInstruction,
  addInstructionPromptList,
  modifyInstructionPromptList,
  removeInstructionPromptList,
} from "@/api/mainActivity/PromptTemplate";
import CustomTable from './reuse-method/CustomTable-PromptTemplate.vue';
import { userCommandParameterStore } from '../stores/commandParameter';
import { userInstructionContentStore } from '../stores/InstructionContent';
import  pageComponent  from './reuse-method/pageComponent-PromptTemplate.vue';

const mitt = useMitt();

const activeName = ref("mine");
const InstructionPromptWord = ref(false);

const PromptPropertyNameStore = usePromptPropertyNameStore();
const PromptPropertyStore = usePromptPropertyStore();
const CommandParameterStore =userCommandParameterStore();
const VipTypeStore = userVipTypeStore();
const InstructionContentStore = userInstructionContentStore();

const userType = computed(()=>{
  const res = VipTypeStore.privilege.includes('use_prompt_add');
  // console.log(res,'>>>>>>>>>>>>>>>.');
  return res
})

const Room_Attributes = inject("RoomAttributes");
// const onSelectPrompt = ()=>{
//   // selectedPrompt.value = Room_Attributes.value.instruction;
// }
// mitt.on('onSelectPrompt',()=>{
//   onSelectPrompt();
// })

//初始化store变量
const store = useStore();
const selectedPrompt = computed({
  get: () => store.state.selectedPrompt,
  set: (value) => store.commit("setSelectedPrompt", value),
});
const promptSwitch = computed({
  get: () => store.state.promptSwitch,
  set: (value) => store.commit("setPromptSwitch", value),
});
const searchType = ref("prompt_name");
const searchKeyword = ref("");
const promptList = ref([]);
const promptName = ref("");

const instructionPromptForm = ref({
  prompt_name: "",
  is_shared: false,
  prompt_type: "standard",
  standard_prompt: "" || InstructionContentStore.content, //指令内容提示词
  personalized_prompt: {
    user_profile: "",
    response_preference: "",
  },
  customized_prompt: [],
  llm_temperature: 20,
});

watch(()=>InstructionContentStore.content,(val)=>{
  instructionPromptForm.standard_prompt = val;
},{immediate:true})

const labelDict = ref({
  prompt_type: {
    standard: "标准指令",
    personalized: "个性化指令",
    customized: "自定义指令",
  },
  is_shared: {
    true: "是",
    false: "否",
  },
});
const formatPersonalizedPrompt = (prompt) => {
  let parsedPrompt;
  try {
    parsedPrompt = JSON.parse(prompt);
  } catch (e) {
    console.error("Failed to parse prompt:", e);
    return {};
  }
  return parsedPrompt;
};
const formatCustomizedPrompt = (prompt) => {
  const parsedPrompt = JSON.parse(prompt);
  return parsedPrompt.reduce((obj, item) => {
    obj[item.key] = item.value;
    return obj;
  }, {});
};

const selectedRowId = ref(null);// 用于追踪当前选中的行的ID
const showCertain = ref(false);// 控制是否显示选择列

// 监听赋值
watch(
  () => Room_Attributes.value.instruction,
  (newVal) => {
    selectedPrompt.value = newVal;
    selectedRowId.value = newVal;
  },
  { immediate: true }
);

// 点击行时，将行数据赋值给selectedPrompt
const selectedPromptList = ref([]);
function rowClick(selection) {


  if (selection.id === selectedRowId.value) {
    selectedRowId.value = null;
    PromptPropertyNameStore.setPromptName("预设指令");
    PromptPropertyStore.deletePromptId();
    CommandParameterStore.deleteTemperaturePatchList();
    mitt.emit("PromptSwitchOff");
    ElMessage.info("预设指令已关闭")
    console.log('取消选择');
    return;
  }

  // console.log(selection.id, 'selection.id');
  selectedPrompt.value = selection.id;
  // selectedPromptList.value = selection;
  promptName.value = selection.prompt_name;
  selectedRowId.value = selectedPrompt.value;
  
  mitt.emit("PromptSwitchOn");
  ElMessage.success("预设指令已开启");

  // 保存选择id
  PromptPropertyNameStore.setPromptName(selection.prompt_name);
  // localStorage.setItem('selectionPrompt.id',selection.id);// 之前
  PromptPropertyStore.setPromptId(selection.id); //现在
   
  // 保存温度
  CommandParameterStore.setTemperaturePatchList(selection.llm_temperature_label);
}

// 我的列表选择
const selectedPrompt2 = ref(null);
const pitchOnRow = (selection) => {
  selectedPromptList.value = selection;
};

const total = ref(50); //总数
const pageSize = ref(10); //每页显示条数
const currentPage = ref(1);
// 处理页码改变的函数
function handlePageChange(newPage) {
  // console.log('当前页码:', newPage);
  currentPage.value = newPage;
  getPromptList();
};
function handleSizeChange(newSize){
  // console.log('当前条:', newSize);
  pageSize.value = newSize;
  getPromptList();
};
const handleSearch = ()=>{
  // currentPage.value = 1; // 重置到第一页
  getPromptList(); // 重新获取或过滤数据列表
};
const clearSearch = ()=>{
  currentPage.value = 1; // 重置到第一页
  getPromptList(); // 重新获取或过滤数据列表
}

// 获取指令提示词列表
const getPromptList = async () => {
  try {
    const response = await getInstructionPrompt(pageSize.value,currentPage.value,searchKeyword.value,String(AttentionScreening.value));
    total.value = response.data.count;
    promptList.value = response.data.results;
     
    // console.log(promptList.value,'promptList.value>>>>>>>>>>>>>>');

    promptList.value.forEach((item) => {
      item.prompt_type_label = labelDict.value.prompt_type[item.prompt_type];
      item.is_shared_label = labelDict.value.is_shared[item.is_shared];
      item.llm_temperature_label = item.llm_temperature / 100;
      item.attention = false;
    });
    // console.log('指令列表',promptList.value);
    //显示关注或者不关注
    const attention_List = await getUserProfile();
    // console.log(attention_List.data.userfollowedstatus.followed_instructions,'attention_List',);
    const followedInstructions =
      attention_List.data.userfollowedstatus.followed_instructions || [];
    promptList.value.forEach((item) => {
      if (followedInstructions.includes(item.id)) {
        item.attention = true;
      }
    });
  } catch (error) {
    console.error(error);
    // ElMessage.error(error);
  }
};
onMounted(() => {
  getPromptList();
  myPromptTemplateList();
});

/*我的**************************************************************************************************************************** */

// 关键字查询
const mySearchKeyword = ref("");
const filterMyPromptTemplateList = computed(() => {
  if (mySearchKeyword.value) {
    const keyword = mySearchKeyword.value.toLowerCase();
    return myPromptUserList.value.created.filter((item) => {
      return item.prompt_name.toLowerCase().includes(keyword);
    });
  }
  return myPromptUserList.value.created;
});

const myPromptUserList = ref([]);
const myPromptTemplateList = async () => {
  try {
    const res = await myInstructionPromptList();
    if (res.status === 200) {
      myPromptUserList.value = res.data;
      // 创建的
      myPromptUserList.value.created.forEach((item) => {
        item.prompt_type_label = labelDict.value.prompt_type[item.prompt_type];
        item.is_shared_label = labelDict.value.is_shared[item.is_shared];
        item.llm_temperature_label = item.llm_temperature / 100;
      });
      // 关注的
      myPromptUserList.value.followed.forEach((item) => {
        item.prompt_type_label = labelDict.value.prompt_type[item.prompt_type];
        item.is_shared_label = labelDict.value.is_shared[item.is_shared];
        item.llm_temperature_label = item.llm_temperature / 100;
        item.attention = true;
      });
    }
  } catch (error) {
    console.log(error);
  }
};

/*关注**************************************************************************************************************************** */

// 关键词搜索
const attentionKeyword = ref("");
const filterMyAttentionList = computed(() => {
  if (attentionKeyword.value) {
    const keyword = attentionKeyword.value.toLowerCase();
    return myPromptUserList.value.followed.filter((item) => {
      return item.prompt_name.toLowerCase().includes(keyword);
    });
  }
  return myPromptUserList.value.followed;
});

// 点击关注触发
const attentionSwitch = async (row) => {
  try {
    if (row.attention === true) {
      await postFollowInstruction(row.id);
      ElMessage.success("关注成功");
    } else {
      await postFollowInstruction(row.id);
      ElMessage.error("取消关注");
    }
    myPromptTemplateList(); //更新一下列表
  } catch (error) {
    console.log(error);
  }
};
// 取消关注
const unFollowSwitch = async (row) => {
  try {
    await postFollowInstruction(row.id);
    ElMessage.error("取消关注");
    myPromptTemplateList();
    getPromptList();
  } catch (error) {
    console.log(error);
  }
};

/********************************************************************************************************************************* */

// 搜索指令提示词，直接用computed赋值给filteredPromptList
const filteredPromptList = computed(() => {
  if (searchKeyword.value) {
    return promptList.value.filter((item) => {
      return item[searchType.value].includes(searchKeyword.value);
    });
  }
  return promptList.value;
});

const addItem = () => {
  instructionPromptForm.value.customized_prompt.push({ value: "" });
};
const addItemEdit = () => {
  currentRowPrompt.value.customized_prompt.push({ value: "" });
};
const removeItem = (index) => {
  instructionPromptForm.value.customized_prompt.splice(index, 1);
};
const removeItemEdit = (index) => {
  currentRowPrompt.value.customized_prompt.splice(index, 1);
};
const temperatureFormat = (val) => {
  return val / 100;
};
const temperatureMarks = {
  0: "0",
  20: "思维严谨",
  80: "思维发散",
  50: "0.5",
  100: "1",
};
const resetPrompt = () => {
  instructionPromptForm.value = {
    prompt_name: "",
    prompt_type: "standard",
    standard_prompt: "",
    personalized_prompt: {
      user_profile: "",
      response_preference: "",
    },
    customized_prompt: [],
    llm_temperature: 20,
  };
};

// 创建指令提示词
const createPrompt = async () => {
  try {
    // const url = 'llm/create_instruction_prompt/';
    const form = { ...instructionPromptForm.value }; // 复制表单数据到新对象
    form.personalized_prompt = JSON.stringify(form.personalized_prompt);
    form.customized_prompt = JSON.stringify(form.customized_prompt);
    await addInstructionPromptList(form);
    // 提示保存成功
    ElMessage.success("创建成功");
    getPromptList();
    myPromptTemplateList();
    // 清空表单数据
    resetPrompt();
    activeName.value = 'mine';
  } catch (error) {
    console.error(error);
    // 提示保存失败
    ElMessage.error("创建失败");
  }
};
const currentRow = ref("");
const currentRowPrompt = ref({
  personalized_prompt: {
    user_profile: "",
    response_preference: "",
  },
  customized_prompt: [],
});
const openEditDialog = (row) => {
  currentRow.value = { ...row };
  currentRowPrompt.value = {
    personalized_prompt: {
      user_profile: "",
      response_preference: "",
    },
    customized_prompt: [],
  }; // 清空表单数据
  editDialogVisible.value = true;
  // currentRow.value.personalized_prompt_stringify = null;
};
// 编辑指令提示词
const editDialogVisible = ref(false);
const editPrompt = async (row) => {
  try {
    const form = { ...row };
    form.personalized_prompt = JSON.stringify(
      currentRowPrompt.value.personalized_prompt
    );
    form.customized_prompt = JSON.stringify(
      currentRowPrompt.value.customized_prompt
    );
    await modifyInstructionPromptList(row.id, form);
    // 提示保存成功
    editDialogVisible.value = false;
    ElMessage.success("修改成功");
    getPromptList();
    myPromptTemplateList();
  } catch (error) {
    console.error(error);
    // 提示获取失败
    ElMessage.error("修改失败");
  }
};

//删除指令提示词
const deletePrompt = async (row) => {
  try {
    await ElMessageBox.confirm("此操作将永久删除该预设指令, 是否继续?", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });
    await removeInstructionPromptList(row.id);
    // 提示删除成功
    ElMessage.success("删除成功");
    getPromptList();
    myPromptTemplateList();
    // 删除选中名字
    PromptPropertyNameStore.setPromptName("预设指令");
  } catch (error) {
    console.error(error);
    // 提示删除失败
    ElMessage.error("删除失败");
  }
};

// 传递tabs默认我的
const changeTabs = () => {
  activeName.value = 'add';
};
mitt.on('changeTabs',()=>{
    changeTabs();
});

const AttentionScreening = ref("");
const numberOfConcerns = [
{
    value: '-followed_count',
    label: '关注数量',
  },
  {
    value: 'updated_at',
    label: '更新时间',
  },
  {
    value: 'index_name',
    label: '字母排序',
  },
]
const handleClear = () => {};
const handleScreen = (val) =>{ 
  AttentionScreening.value = val;
  getPromptList();
}



</script>

<style scoped>
.prompt-list-header {
  display: flex;
  justify-content: space-between;
  margin-right: 20px;
}

.prompt-list {
  margin-top: 10px;
  height: 700px;
  overflow-y: auto;
  position: relative;
}

.selected-prompt {
  margin-left: 20px;
}

.prompt-switch {
  display: flex;
  flex-direction: column;
}

.search-prompt {
  /* display: flex;
  margin-left: auto;
  width: 50%;
  padding: 20px; */
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0px;
}

.card-first span {
  margin-right: 25px;
}

.add-prompt {
  margin-top: 10px;
  height: 650px;
  overflow-y: auto;
  position: relative;
}

.form-item {
  width: 90%;
  padding-left: 15px;
}

.custom-form {
  width: 90%;
  padding-left: 15px;
  margin-bottom: 10px;
}

.add-prompt-footer {
  margin-top: 20px;
}
</style>
