<template>
    <div>
        <!-- 标题 -->
        <div style="display: flex;justify-content: space-between;">
            <div style="font-size: 16px;color: #CBC9C9;">共享列表</div>
            <div style="display: flex;align-items: center;">
                <el-select v-model="AttentionScreening" clearable placeholder="请选择" style="width: 200px"
                    @change="handleScreen">
                    <el-option v-for="item in numberOfConcerns" :key="item.value" :label="item.label"
                        :value="item.value" />
                </el-select>
                <el-button style="width: 32px;" @click="handleStort" type="" :icon="sortType ? 'SortUp' : 'SortDown'" :title="sortType ? '升序' : '降序'"></el-button>
                <el-input v-model="keyWords" placeholder="请输入关键字" style="width: 200px;margin-left:5px" clearable
                    @clear="clearSearch">
                    <template #prepend>
                        <el-button :icon="Search" @click="handleSearch" />
                    </template>
                </el-input>
            </div>
        </div>
        <!-- 内容小方块 -->
        <el-scrollbar height="650px">
            <div>
                <div class="container">
                    <div v-for="(item, index) in InstructionPromptList" :key="item.id" class="shareListContent">
                        <img :src="item.image_url" alt="" class="thumbnail">
                        <div class="content">
                            <div class="header">
                                <div class="title">{{ item.prompt_name }}</div>
                                <el-switch v-model="item.attention" inline-prompt active-text="已关注" inactive-text="未关注"
                                    @change="attentionSwitch(item)" />
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
                </div>
            </div>
        </el-scrollbar>
        <!-- 分页 -->
        <el-pagination small background layout="sizes ,prev, pager, next, total" class="mt-4" :page-sizes="[10, 20]"
            :total="total" v-model:current-page="currentPage" v-model:page-size="pageSize"
            @current-change="handleCurrentChange" @size-change="handleSizeChange"
            style="float: right;margin-top: 10px;" />
        <!-- 封装的弹窗 -->
        <DetailDialog :isVisible="showSharedList" :sharedListData="find_SharedList" ref="DetailDialogRef" />
    </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch, computed } from "vue";
import { Search, InfoFilled } from "@element-plus/icons-vue";
import { getInstructionPrompt, getUserProfile, postFollowInstruction } from '../../../api/mainActivity/PromptTemplate.js';
import { ElMessage } from "element-plus";
import DetailDialog from './instruction_DetailDialog.vue';
import { getInstructionPromptValueMap } from "../../../api/mainActivity/PromptTemplate.js";


const value3 = ref(false)
const value = ref('');
const keyWords = ref('');
const AttentionScreening = ref('');
const InstructionPromptList = ref([]);

const find_SharedList = ref({});
const showSharedList = ref(false);
const DetailDialogRef = ref(null)

onMounted(async () => {
    await getInstructionPromptList();
    await fetchTypeMap();
})

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

//分页
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);
const handleCurrentChange = (val) => {
    // console.log(val, 'val');
    currentPage.value = val;
    getInstructionPromptList();
}
const handleSizeChange = (val) => {
    // console.log(val, 'val1');
    pageSize.value = val;
    getInstructionPromptList();
}

const handleScreen = (val) => {
    AttentionScreening.value = val;
    getInstructionPromptList();
}

const handleStort = () => {
    sortType.value = !sortType.value
    getInstructionPromptList();
}

const handleSearch = () => {
    getInstructionPromptList();
}

const clearSearch = () => {
    currentPage.value = 1; // 重置到第一页
    getInstructionPromptList(); // 重新获取或过滤数据列表
}

const attentionSwitch = async (item) => {
    // console.log(item, 'id');
    try {
        if (item.attention === true) {
            await postFollowInstruction(item.id);
            ElMessage.success("关注成功");
        } else {
            await postFollowInstruction(item.id);
            ElMessage.error("取消关注");
        }
        getInstructionPromptList();
    } catch (error) {
        console.log(error);
    }
}

const showDetailEDness = (item) => {
    find_SharedList.value = item;
    DetailDialogRef.value.openDialog();
};

const typeMap = ref([]);

const fetchTypeMap = async (type) => {
    try {
        const res = await getInstructionPromptValueMap();
        typeMap.value = res.data.data.prompt_type;
    } catch (error) {
        console.log(error, 'error');
    }
};

const promptTypeLabel = (type) => {
    const typeItem = typeMap.value.find(item => item.value === type);
    return typeItem ? typeItem.label : "未知类型";
};



const getInstructionPromptList = async () => {
    try {
        const res = await getInstructionPrompt(pageSize.value, currentPage.value, keyWords.value, String(AttentionScreening.value), sortType.value);
        // console.log(res, 'res');
        InstructionPromptList.value = res.data.results;
        total.value = res.data.count;

        InstructionPromptList.value.forEach((item) => {
            //   item.prompt_type_label = labelDict.value.prompt_type[item.prompt_type];
            //   item.is_shared_label = labelDict.value.is_shared[item.is_shared];
            //   item.llm_temperature_label = item.llm_temperature / 100;
            item.attention = false;
        });
        // console.log(InstructionPromptList.value, 'InstructionPromptList.value');

        //显示关注或者不关注
        const attention_List = await getUserProfile();
        const followedInstructions =
            attention_List.data.userfollowedstatus.followed_instructions || [];
        InstructionPromptList.value.forEach((item) => {
            if (followedInstructions.includes(item.id)) {
                item.attention = true;
            }
        });


    } catch (error) {
        console.log(error);
    }
}

defineExpose({
    getInstructionPromptList,
})

</script>

<style scoped>
.container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    max-height: 650px;
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
}

.thumbnail {
    width: 90px;
    height: 88px;
    /* background-color: #a8d8ea; */
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
    color: #4A4848;
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
</style>