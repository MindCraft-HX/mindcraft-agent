<template>
    <div>
        <!-- 选择 -->
        <div style="display: flex; justify-content: space-between; align-items: center">
            <el-radio-group v-model="radio2" @change="changeRadio">
                <el-radio-button label="我的创建" value="create" />
                <el-radio-button label="我的关注" value="share" />
            </el-radio-group>
            <div style="display: flex;align-items: center;">
                <el-select v-model="AttentionScreening" clearable placeholder="请选择" style="width: 200px"
                    @change="handleScreen">
                    <el-option v-for="item in numberOfConcerns" :key="item.value" :label="item.label"
                        :value="item.value" />
                </el-select>
                <el-button style="width: 32px;" @click="handleStort" type="" :icon="sortType ? 'SortUp' : 'SortDown'" :title="sortType ? '升序' : '降序'"></el-button>
                <el-input v-model="input3" placeholder="请输入关键字" style="width: 200px; margin-left: 5px" clearable
                    @clear="clearSearch_Mine">
                    <template #prepend>
                        <el-button :icon="Search" @click="handleSearch_Mine" />
                    </template>
                </el-input>
            </div>
        </div>
        <!-- 内容小方块 -->
        <el-scrollbar height="650px">
            <div>
                <div class="my_container">
                    <div v-if="AttentionCreation_List?.length > 0" v-for="(item, index) in AttentionCreation_List"
                        :key="item.id" :class="[
                'shareListContent',
                { selected: selectedIndex === item.id },
            ]" @click="selectItem(item)" @mouseover="hoverItem(item.id)" @mouseleave="leaveItem(item.id)">
                        <!-- <div class="thumbnail"></div> -->
                        <img :src="item.image_url" alt="" class="thumbnail">
                        <div class="content">
                            <div class="header">
                                <div class="title">{{ item.prompt_name }}</div>
                                <!-- 选择的 编辑 关注 删除 -->
                                <div style="display: flex;align-items: center;">
                                    <el-button v-if="radio2 !== '我的关注'" round size="small" icon="EditPen"
                                        style="background: #1b486e; color: #ffffff" @click="editCreate(item)"
                                        @click.stop>编辑</el-button>
                                    <el-switch v-if="radio2 !== '我的创建'" v-model="item.attention" inline-prompt
                                        active-text="已关注" inactive-text="未关注" @change="attentionSwitch(item)"
                                        @click.stop />
                                    <el-popconfirm width="220" confirm-button-text="是" cancel-button-text="否"
                                        :icon="InfoFilled" icon-color="#626AEF" title="此操作将永久删除该预设指令, 是否继续?"
                                        @confirm="removeEstablish(item.id)">
                                        <template #reference>
                                            <el-button v-if="radio2 !== '我的关注'" type="danger" :icon="Delete" circle
                                                size="small" style="margin-left: 4px" @click.stop />
                                            <span v-else></span>
                                        </template>
                                    </el-popconfirm>
                                </div>
                            </div>
                            <div class="description">{{ item.standard_prompt }}</div>
                            <div class="footer">
                                <div style="display: flex;color:#A8ABB2;font-size: 12px;">
                                    <div class="followers">
                                        <svg class="icon" aria-hidden="true">
                                            <use xlink:href="#icon-wodeguanzhu"></use>
                                        </svg>关注数：{{ item.followed_count }}
                                    </div>
                                    <div class="type">
                                        <svg class="icon" aria-hidden="true">
                                            <use xlink:href="#icon-type"></use>
                                        </svg>类型：{{ promptTypeLabel(item.prompt_type) }}
                                    </div>
                                </div>
                                <!-- 详情 -->
                                <el-tooltip class="box-item" effect="dark" content="指令详情" placement="bottom">
                                    <div style="width: 25px;height: 25px;display: inline-flex;cursor: pointer;"
                                        @click.stop @click="showDetailEDness(item)">
                                        <svg class="icon" aria-hidden="true" style="font-size: 25px;">
                                            <use xlink:href="#icon-info-filled"></use>
                                        </svg>
                                    </div>
                                </el-tooltip>
                            </div>
                        </div>
                    </div>
                    <el-empty v-else description="您还未创建或关注任何指令。请前往发现选择或创建您的指令!" style="margin: 0 auto" />
                </div>
            </div>
        </el-scrollbar>
        <!-- 分页 -->
        <el-pagination small background layout="sizes ,prev, pager, next, total" class="mt-4" :page-sizes="[10, 20]"
            :total="total" v-model:current-page="currentPage" v-model:page-size="pageSize"
            @current-change="handleCurrentChange" @size-change="handleSizeChange"
            style="float: right; margin-top: 10px" />
        <!-- 编辑弹窗 -->
        <el-dialog title="编辑" v-model="editDialogVisible" @close="editDialogVisible = false" append-to-body>
            <!-- 头像 -->
            <div
                style="float: right; width: 200px; height: 190px;display: flex;flex-direction: column;align-items: center;justify-content: space-around;">
                <img :src="currentRow.image_url" alt="" style="width: 100px;height: 100px;" />
                <!-- <el-button type="primary" @click="Mine_UploadImage">本地上传</el-button>
                <input type="file" ref="Mine_FileInput" @change="Mine_handleFileChange" style="display: none" /> -->
            </div>
            <el-form :model="currentRow" label-position="top" label-width="100px" class="add-prompt">
                <el-form-item label="指令名称" style="width: 50%">
                    <el-input v-model="currentRow.prompt_name"></el-input>
                    <el-switch v-model="currentRow.is_shared" active-text="共享" inactive-text="不共享"
                        size="large"></el-switch>
                </el-form-item>
                <el-form-item label="指令类型">
                    <el-select v-model="currentRow.prompt_type" @change="handlePromptType_Mine">
                        <!-- <el-option label="标准指令" value="standard"></el-option> -->
                        <el-option v-for="item in typeMap" :key="item.value" :label="item.label"
                            :value="item.value"></el-option>
                    </el-select>
                </el-form-item>
                    <el-form-item label="指令内容（提示词）" class="form-item">
                        <el-input v-model="currentRow.standard_prompt" type="textarea"
                            :autosize="{ minRows: 4 }"></el-input>
                    </el-form-item>
                <el-form-item label="回应发散性（LLM Temperature）">
                    <el-slider v-model="currentRow.llm_temperature" :step="10" show-stops
                        :format-tooltip="temperatureFormat" :marks="temperatureMarks" class="form-item" />
                </el-form-item>
            </el-form>
            <div class="add-prompt-footer">
                <el-button type="primary" @click="editPrompt(currentRow)">保存</el-button>
                <el-button type="danger" @click="editDialogVisible = false">取消</el-button>
            </div>
        </el-dialog>
        <!-- 详细信息弹窗 -->
        <DetailDialog ref="DetailDialogRef" :sharedListData="find_SharedMine" />
    </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch, computed, inject } from "vue";
import { Search, Delete, InfoFilled } from "@element-plus/icons-vue";
import {
    myInstructionPromptList,
    postFollowInstruction,
    removeInstructionPromptList,
    modifyInstructionPromptList,
    AddCreateInstructionPromptList,
    getInstructionPromptValueMap,
    modifyInstructionPrompt,
} from "../../../api/mainActivity/PromptTemplate.js";
import { ElMessage } from "element-plus";
import { useStore } from "vuex";
import { usePromptPropertyNameStore } from "../../../stores/PromptPropertyName";
import { usePromptPropertyStore } from "../../../stores/PromptProperty";
import { userCommandParameterStore } from '../../../stores/commandParameter';
import { useMitt } from "@/utils/mitt";
import DetailDialog from './instruction_DetailDialog.vue';
import { postUploadProcessor } from '../../../api/mainActivity/chat';



const mitt = useMitt();

const PromptPropertyNameStore = usePromptPropertyNameStore();
const PromptPropertyStore = usePromptPropertyStore();
const CommandParameterStore = userCommandParameterStore();
const Room_Attributes = inject("RoomAttributes");


// console.log(useMitt, 'useMitt');

//初始化store变量
const store = useStore();
// console.log(store, 'store');
const selectedPrompt = computed({
    get: () => store.state.selectedPrompt,
    set: (value) => store.commit("setSelectedPrompt", value),
});

const DetailDialogRef = ref(null);
const find_SharedMine = ref({});

const input3 = ref("");
const radio2 = ref("我的创建");
const list_type = ref("create")

const AttentionCreation_List = ref([]);
const currentRow = ref([]);
const editDialogVisible = ref(false);
const currentRowPrompt = ref({
    personalized_prompt: {
        user_profile: "",
        response_preference: "",
    },
    customized_prompt: [],
});

const options_Mine = ref([])

const Mine_FileInput = ref(null);

// 选中
const selectedIndex = ref(null);
const hoveredIndex = ref(null);

// 分页
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);

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

const AttentionScreening = ref('');
const numberOfConcerns = [
    {
        value: 'followed_count',
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
    {
        value: 'created_at',
        label: '创建时间',
    },
]

const sortType = ref(true)

onMounted(async () => {
    await getMinePromptTempList();
    await fetchTypeMap();
});

const hoverItem = (id) => {
    // hoveredIndex.value = id;
};

const leaveItem = (id) => {
    if (hoveredIndex.value === id) {
        hoveredIndex.value = null;
    }
};

watch(
    () => Room_Attributes.value.instruction,
    (newVal) => {
        selectedPrompt.value = newVal;
        selectedIndex.value = newVal;
        // console.log(newVal, 'newVal新的');
    },
    { immediate: true }
);

// 点击选中的
const selectItem = (item) => {
    console.log(item, "id选中");
    //4.  再点击关闭
    if (item.id === selectedIndex.value) {
        selectedIndex.value = null;
        PromptPropertyNameStore.setPromptName("预设指令");
        PromptPropertyStore.deletePromptId();
        CommandParameterStore.deleteTemperaturePatchList();
        mitt.emit("PromptSwitchOff");
        ElMessage.info("预设指令已关闭")
        return
    }

    selectedIndex.value = item.id;
    selectedPrompt.value = item.id;

    mitt.emit("PromptSwitchOn");
    ElMessage.success("预设指令已开启");

    // 保存选择id 名字
    PromptPropertyNameStore.setPromptName(item.prompt_name);
    PromptPropertyStore.setPromptId(item.id); //现在
    // 保存温度
    // CommandParameterStore.setTemperaturePatchList(item.llm_temperature_label);
};

const changeRadio = (value) => {
    radio2.value = value;
    list_type.value = value;
    getMinePromptTempList();
};

//新增自定义
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

const Mine_UploadImage = () => {
    Mine_FileInput.value.click();
};

const Mine_handleFileChange = async (event) => {
    console.log(event, 'event');
    const file = event.target.files[0];
    if (file) {
        const link_file = await uploadImages(file);
        currentRow.value.image_url = link_file.file_url;
        // 添加到保存
        // currentRow.value.image_url = Test_file
        // const reader = new FileReader();
        // reader.onload = async (e) => {
        //     // Mine_ImageUrl.value = e.target.result;
        //     currentRow.value.image_url = e.target.result;
        // };
        // reader.readAsDataURL(file);
    }

};

// 修改打开弹窗
const editCreate = async (item) => {
    console.log(item, 'item');
    currentRow.value = { ...item };
    // currentRowPrompt.value = {
    //     personalized_prompt: {
    //         user_profile: "",
    //         response_preference: "",
    //     },
    //     customized_prompt: [],
    // }; // 清空表单数据
    editDialogVisible.value = true;
}
//确定弹窗内容
const editPrompt = async (item) => {
    const formData = new FormData();
    formData.append('prompt_name', currentRow.value.prompt_name);
    formData.append('standard_prompt', currentRow.value.standard_prompt);
    formData.append('prompt_type', currentRow.value.prompt_type);
    formData.append('update_image_url', currentRow.value.image_url);
    formData.append('llm_temperature', currentRow.value.llm_temperature);
    formData.append('is_shared', currentRow.value.is_shared);

    try {
        await modifyInstructionPrompt(item.id, formData);
        ElMessage.success("修改成功");
        editDialogVisible.value = false;
        getMinePromptTempList();
    } catch (error) {
        console.log(error);
        ElMessage.success("修改失败");
    }
}



const removeEstablish = async (id) => {
    try {
        await removeInstructionPromptList(id);
        ElMessage.success("删除成功");
        getMinePromptTempList();
    } catch (error) {
        console.log(error, "error");
    }
};

const attentionSwitch = async (item) => {
    // console.log(item, "item");
    try {
        if (item.attention === true) {
            await postFollowInstruction(item.id);
            ElMessage.success("关注成功");
        } else {
            await postFollowInstruction(item.id);
            ElMessage.error("取消关注");
        }
        getMinePromptTempList();
    } catch (error) {
        console.log(error, "error");
    }
};

const handleCurrentChange = (val) => {
    currentPage.value = val;
    getMinePromptTempList();
};
const handleSizeChange = (val) => {
    pageSize.value = val;
    getMinePromptTempList();
};


// 过滤后的数据列表
// const filteredAttentionCreationList = computed(() => {
//     if (!input3.value) {
//         return AttentionCreation_List.value;
//     }
//     return AttentionCreation_List.value.filter(item =>
//         item.prompt_name.includes(input3.value) ||
//         item.standard_prompt.includes(input3.value)
//     );
// });

// 点击打开弹窗
const showDetailEDness = (item) => {
    // console.log(item, 'item');
    find_SharedMine.value = item;
    DetailDialogRef.value.openDialog();
}


// 上传图片 转链接
async function uploadImages(file) {
    let uploadImageUrl = null;
    const formData = new FormData();

    if (file && file.type && file.type.startsWith("image/")) {
        formData.append("files[]", file);
        formData.append("update_type", "file_url");
        try {
            const res = await postUploadProcessor(formData);
            console.log(res.data.data[0], 'res');
            uploadImageUrl = res.data.data[0]; // 假设返回的链接在 data 数组的第一个元素
        } catch (error) {
            console.error("上传错误：", error.response ? error.response.data : error);
        }
    } else {
        console.error("文件类型错误");
    }
    return uploadImageUrl;
}

const typeMap = ref([]);

const fetchTypeMap = async (type) => {
    try {
        const res = await getInstructionPromptValueMap();
        typeMap.value = res.data.data.prompt_type;
    } catch (error) {
        console.log(error, 'error');
    }
};

const handleScreen = async (val) => {
    AttentionScreening.value = val;
    await getMinePromptTempList();
}

const handleStort = () => {
    sortType.value = !sortType.value
    getMinePromptTempList();
}

const handleSearch_Mine = async () => {
    await getMinePromptTempList();
}

const clearSearch_Mine = async () => {
    await getMinePromptTempList();
}


const getMinePromptTempList = async () => {
    // const res = await myInstructionPromptList();
    // console.log(res.data, 'res>>>>>>>>>>>..');
    // if (radio2.value === "我的关注") {
    //     // console.log('我的关注');
    //     AttentionCreation_List.value = res.data.followed;
    //     AttentionCreation_List.value.forEach((item) => {
    //         // item.prompt_type_label = labelDict.value.prompt_type[item.prompt_type];
    //         // item.is_shared_label = labelDict.value.is_shared[item.is_shared];
    //         // item.llm_temperature_label = item.llm_temperature / 100;
    //         item.attention = true;
    //     });
    // } else if (radio2.value === "我的创建") {
    //     // console.log('我的创建');
    //     AttentionCreation_List.value = res.data.created;
    //     AttentionCreation_List.value.forEach((item) => {
    //         // item.prompt_type_label = labelDict.value.prompt_type[item.prompt_type];
    //         // item.is_shared_label = labelDict.value.is_shared[item.is_shared];
    //         // item.llm_temperature_label = item.llm_temperature / 100;
    //         item.attention = true;
    //     });
    // }
    const res = await AddCreateInstructionPromptList(pageSize.value, currentPage.value, input3.value, String(AttentionScreening.value), list_type.value, sortType.value);
    total.value = res.data.count;
    AttentionCreation_List.value = res.data.results;
    AttentionCreation_List.value.forEach((item) => {
        item.attention = true;
    });
};

const promptTypeLabel = (type) => {
    // console.log(type,'type>>>>>>>>>>>>>');
    const typeItem = typeMap.value.find(item => item.value === type);
    return typeItem ? typeItem.label : "未知类型";
};

const SuccessfulJump_Mine = () => {
    radio2.value = "我的创建";
    getMinePromptTempList();
}

const handlePromptType_Mine = (val) => {
    currentRow.value.prompt_type = val;
    const selectedItem = typeMap.value.find(item => item.value === val);
    currentRow.value.image_url = selectedItem.url;
}


defineExpose({
    getMinePromptTempList,
    SuccessfulJump_Mine,
});
</script>

<style scoped>
.my_container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    max-height: 650px;
    /* min-width: 860px; */
}

.shareListContent {
    width: 424px;
    height: 114px;
    border-radius: 10px;
    margin-top: 10px;
    border: 1px solid #E6E8ED;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.3s;
    cursor: pointer;
}

.shareListContent.selected {
    background-image: linear-gradient(to left, #7db9f6, #d6eaff, #fafafa);
    border-color: #196fc8;
}

.shareListContent:hover {
    /* background-image: linear-gradient(to left, #7db9f6, #d6eaff, #fafafa);
    border-color: #196fc8; */
}

.thumbnail {
    width: 90px;
    height: 88px;
    background-color: #a8d8ea;
    border-radius: 10px;
}

.content {
    width: 310px;
    height: 90px;
    margin-left: 8px;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.title {
    width: 190px;
    color: #000000;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.description {
    width: 248px;
    color: #4a4848;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.footer {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
    margin-top: 18px;
}

.followers,
.type {
    display: flex;
    align-items: center;
}

.followers svg,
.type svg {
    margin-right: 5px;
    font-size: 14px;
}

.type {
    margin-left: 20px;
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
    margin-top: 110px;
}
</style>
