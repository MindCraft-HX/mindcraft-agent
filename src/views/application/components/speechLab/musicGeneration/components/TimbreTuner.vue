<template>
    <div>
        <div class="userName" style="">用户名：{{ userName }}</div>
        <div style="display: flex">
            <!-- 侧边栏 -->
            <el-menu :default-active="activeIndex" class="el-menu-vertical-demo custom-menu" style="width: 230px"
                @open="handleOpen" @close="handleClose" @select="handleSelect">
                <el-menu-item index="1">
                    <span>音乐</span>
                </el-menu-item>
                <el-menu-item index="2">
                    <span>音色</span>
                </el-menu-item>
                <el-menu-item index="3">
                    <span>伴奏</span>
                </el-menu-item>
            </el-menu>
            <!-- 内容 -->
            <!-- 音乐 -->
            <div v-if="activeIndex === '1'" class="timbre_Right">
                <p style="font-weight: 600">音乐列表</p>
                <div style="height: 60vh" v-if="musicInformationData?.length > 0">
                    <el-scrollbar max-height="550px">
                        <div class="container">
                            <div v-for="(item, index) in musicInformationData" :key="index" class="shareListContent">
                                <img :src="item.music_data.music_cover" alt="" class="thumbnail" />
                                <div class="content">
                                    <div class="header">
                                        <div class="title" :title="item.gen_name">{{ item.gen_name }}</div>
                                        <el-button round size="small" icon="EditPen"
                                            style="background: #1b486e; color: #ffffff" @click="editMusic(item)"
                                            @click.stop>编辑</el-button>
                                        <el-popconfirm width="220" confirm-button-text="是" cancel-button-text="否"
                                            :icon="InfoFilled" icon-color="#626AEF" title="此操作将永久删除, 是否继续?"
                                            @confirm="deleteMusicList(item.gen_id)">
                                            <template #reference>
                                                <el-button type="danger" :icon="Delete" circle size="small"
                                                    style="margin-left: 4px" @click.stop />
                                            </template>
                                        </el-popconfirm>
                                    </div>
                                    <div style="margin-top: 20px">
                                        <el-tooltip class="box-item" effect="dark" :content="item.use_voice"
                                            placement="top-start">
                                            <div style="
                          white-space: nowrap;
                          overflow: hidden;
                          text-overflow: ellipsis;
                        ">
                                                voice：{{ item.use_voice }}
                                            </div>
                                        </el-tooltip>
                                        <el-tooltip class="box-item" effect="dark" :content="item.use_instrumental"
                                            placement="top-start">
                                            <div style="
                          white-space: nowrap;
                          overflow: hidden;
                          text-overflow: ellipsis;
                        ">
                                                instrumental：{{ item.use_instrumental }}
                                            </div>
                                        </el-tooltip>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </el-scrollbar>
                </div>
                <div class="Empty" v-else>暂时无数据！！</div>
                <el-pagination small background layout="prev, pager, next, total" style="float: right; margin-top: 16px"
                    :page-sizes="[10, 20]" :total="total" :current-page="currentPage" :page-size="pageSize"
                    :pager-count="5" @current-change="(page) => handleCurrentChange(page, 'music')"
                    @size-change="handleSizeChange" />
            </div>
            <!-- 音色 -->
            <div v-if="activeIndex === '2'" class="timbre_Right">
                <p style="font-weight: 600">音色列表</p>
                <div style="height: 60vh">
                    <el-scrollbar max-height="550px">
                        <div style="display: flex; justify-content: center; padding: 10px 0px">
                            <el-radio-group v-model="radio3" size="small"
                                @change="(newVal) => changeMusicType(newVal, 'timbre')">
                                <el-radio-button label="我的" value="我的" />
                                <el-radio-button label="关注" value="关注" />
                            </el-radio-group>
                        </div>
                        <div class="container" v-if="musicInformationData?.length > 0">
                            <div v-for="(item, index) in musicInformationData" :key="index" class="shareListContent">
                                <img  :src="item.music_data.music_cover" alt="" class="thumbnail" />
                                <div class="content">
                                    <div class="header">
                                        <div class="title" style="width: 90px" :title="item.gen_name">
                                            {{ item.gen_name }}
                                        </div>
                                        <el-button round size="small" icon="EditPen" v-if="radio3 === '我的'"
                                            style="background: #1b486e; color: #ffffff"
                                            @click="modification(item, 'timbre')" @click.stop>编辑</el-button>
                                        <el-switch style="margin-left: 5px" v-model="item.gen_share" inline-prompt
                                            :active-text="switchActiveText" :inactive-text="switchInactiveText" @change="(newVal) =>
            shareTimbreAccompaniment(
                item.gen_id,
                'timbre',
                newVal
            )
            " />
                                        <el-popconfirm width="220" confirm-button-text="是" cancel-button-text="否"
                                            :icon="InfoFilled" icon-color="#626AEF" title="此操作将永久删除, 是否继续?"
                                            @confirm="removeList(item.gen_id, 'timbre')" v-if="radio3 === '我的'">
                                            <template #reference>
                                                <el-button type="danger" :icon="Delete" circle size="small"
                                                    style="margin-left: 4px" @click.stop />
                                            </template>
                                        </el-popconfirm>
                                    </div>
                                    <div style="margin-top: 20px">
                                        <el-tooltip class="box-item" effect="dark" :content="item.voice_id"
                                            placement="top-start">
                                            <div style="
                          white-space: nowrap;
                          overflow: hidden;
                          text-overflow: ellipsis;
                        ">
                                                {{ item.voice_id }}
                                            </div>
                                        </el-tooltip>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="Empty" v-else>暂时无数据！！</div>
                    </el-scrollbar>
                </div>
                <el-pagination small background layout="prev, pager, next, total" style="float: right; margin-top: 16px"
                    :page-sizes="[10, 20]" :total="total" :current-page="currentPage" :page-size="pageSize"
                    :pager-count="5" @current-change="(page) => handleCurrentChange(page, 'voice')"
                    @size-change="handleSizeChange" />
            </div>
            <!-- 伴奏 -->
            <div v-if="activeIndex === '3'" class="timbre_Right">
                <p style="font-weight: 600">伴奏列表</p>
                <div style="height: 60vh">
                    <el-scrollbar max-height="550px">
                        <div style="display: flex; justify-content: center; padding: 10px 0px">
                            <el-radio-group v-model="radio3" size="small"
                                @change="(newVal) => changeMusicType(newVal, 'accompany')">
                                <el-radio-button label="我的" value="我的" />
                                <el-radio-button label="关注" value="关注" />
                            </el-radio-group>
                        </div>
                        <div class="container" v-if="musicInformationData?.length > 0">
                            <div v-for="(item, index) in musicInformationData" :key="index" class="shareListContent">
                                <img :src="item.music_data.music_cover" alt="" class="thumbnail" />
                                <div class="content">
                                    <div class="header">
                                        <div class="title" style="width: 90px" :title="item.gen_name">
                                            {{ item.gen_name }}
                                        </div>
                                        <el-button round size="small" icon="EditPen" v-if="radio3 === '我的'"
                                            style="background: #1b486e; color: #ffffff"
                                            @click="modification(item, 'accompany')" @click.stop>编辑</el-button>
                                        <el-switch style="margin-left: 5px" v-model="item.gen_share" inline-prompt
                                            :active-text="switchActiveText" :inactive-text="switchInactiveText" @change="(newVal) =>
            shareTimbreAccompaniment(
                item.gen_id,
                'accompany',
                newVal
            )
            " />
                                        <el-popconfirm width="220" confirm-button-text="是" cancel-button-text="否"
                                            :icon="InfoFilled" icon-color="#626AEF" title="此操作将永久删除, 是否继续?"
                                            @confirm="removeList(item.gen_id, 'accompany')" v-if="radio3 === '我的'">
                                            <template #reference>
                                                <el-button type="danger" :icon="Delete" circle size="small"
                                                    style="margin-left: 4px" @click.stop />
                                            </template>
                                        </el-popconfirm>
                                    </div>
                                    <div style="margin-top: 20px">
                                        <el-tooltip class="box-item" effect="dark" :content="item.instrumental_id"
                                            placement="top-start">
                                            <div style="
                          white-space: nowrap;
                          overflow: hidden;
                          text-overflow: ellipsis;
                        ">
                                                {{ item.instrumental_id }}
                                            </div>
                                        </el-tooltip>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="Empty" v-else>暂时无数据！！</div>
                    </el-scrollbar>
                </div>
                <el-pagination small background layout="prev, pager, next, total" style="float: right; margin-top: 16px"
                    :page-sizes="[10, 20]" :total="total" :current-page="currentPage" :page-size="pageSize"
                    :pager-count="5" @current-change="(page) => handleCurrentChange(page, 'instrumental')"
                    @size-change="handleSizeChange" />
            </div>
        </div>
    </div>

    <!-- 弹窗 -->
    <el-dialog v-model="dialogTableVisible" title="修改名称" width="400">
        <div>名称：<el-input v-model="inputName" style="width: 316px" /></div>
        <template #footer>
            <div class="dialog-footer">
                <el-button type="primary" @click="saveName">保存</el-button>
                <el-button @click="dialogTableVisible = false">取消</el-button>
            </div>
        </template>
    </el-dialog>
    <!-- 音色伴奏 -->
    <el-dialog v-model="showTimbreAccompaniment" title="修改名称" width="400">
        <div>
            名称：<el-input v-model="TimbreAccompaniment_name" style="width: 316px" />
        </div>
        <template #footer>
            <div class="dialog-footer">
                <el-button type="primary" @click="timbreAccompanimentName">保存</el-button>
                <el-button @click="showTimbreAccompaniment = false">取消</el-button>
            </div>
        </template>
    </el-dialog>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import {
    VideoPlay,
    Edit,
    Check,
    Message,
    Star,
    Delete,
    InfoFilled,
} from "@element-plus/icons-vue";
import {
    getVoiceInstrumentalList,
    getMusicGenerations,
    putArtistic,
    delArtistic,
    putMusicVoiceInstrumental,
    delVoiceInstrumental,
    putMyMusicVoiceInstrumental
} from "../../../../../../api/application/musicGeneration.js";
import { ElMessage, ElLoading } from "element-plus";

const dialogTableVisible = ref(false);
const showTimbreAccompaniment = ref(false);

const radio3 = ref("我的");

const TimbreAccompaniment_name = ref("");
const inputName = ref("");

const value = ref("");

const activeIndex = ref("1");
const musicInformationData = ref([]);

const userName = localStorage.getItem("username");

onMounted(async () => {
    await musicList(10, 1);
});

const switchActiveText = computed(() => {
    return radio3.value === "关注" ? "关注" : "已分享";
});

const switchInactiveText = computed(() => {
    return radio3.value === "关注" ? "未关注" : "未分享";
});

/**分页************************************* */

const currentPage = ref(1);
const pageSize = ref(10);
const total = ref(0);

const handleSizeChange = (size) => {
    console.log(size, "size");
};

const handleCurrentChange = async (page, val) => {
    currentPage.value = page;
    if (val === "voice") {
        if (radio3.value === "我的") {
            await getMusicInformationData("voice", pageSize.value, currentPage.value);
        } else if (radio3.value === "关注") {
            await getMusicInformationData(
                "voice",
                pageSize.value,
                currentPage.value,
                true
            );
        }
    } else if (val === "instrumental") {
        if (radio3.value === "我的") {
            await getMusicInformationData(
                "instrumental",
                pageSize.value,
                currentPage.value
            );
        } else if (radio3.value === "关注") {
            await getMusicInformationData(
                "instrumental",
                pageSize.value,
                currentPage.value,
                true
            );
        }
    } else if (val === "music") {
        await musicList(pageSize.value, page);
    }
};

/***************************************** */

const handleOpen = () => { };
const handleClose = () => { };

const handleSelect = async (index) => {
    activeIndex.value = index;
    currentPage.value = 1;
    if (index === "1") {
        await musicList(10, 1);
    } else if (index === "2") {
        radio3.value = "我的";
        await getMusicInformationData("voice", pageSize.value, currentPage.value);
    } else if (index === "3") {
        radio3.value = "我的";
        await getMusicInformationData(
            "instrumental",
            pageSize.value,
            currentPage.value
        );
    }
};

const musicList = async (size, page) => {
    try {
        const res = await getMusicGenerations(size, page);
        // console.log(res.data.results, 'res');
        musicInformationData.value = res.data.results;
        total.value = res.data.count;
        console.log(musicInformationData.value, "musicInformationData.value");
    } catch (error) {
        console.log(error, "error");
    }
};

const getMusicInformationData = async (
    gen_category,
    size,
    page,
    gen_followed
) => {
    try {
        const res = await getVoiceInstrumentalList(
            gen_category,
            size,
            page,
            gen_followed
        );
        musicInformationData.value = res.data.results;
        total.value = res.data.count;
        // console.log(musicInformationData.value, 'musicInformationData.value');
    } catch (error) {
        console.log(error);
    }
};

const amend = ref({
    id: "",
    name: "",
});

const editMusic = (item) => {
    dialogTableVisible.value = true;
    // console.log(item.gen_name, 'item');
    inputName.value = item.gen_name;
    amend.value.id = item.gen_id;
    amend.value.name = item.gen_name;
    // console.log(amend.value, 'amend');
};

const saveName = async () => {
    const footdata = {
        gen_name: inputName.value,
    };
    try {
        await putArtistic(amend.value.id, footdata);
        await musicList(10, 1);
        ElMessage.success("修改成功");
        dialogTableVisible.value = false;
    } catch (error) {
        console.log(error, "error");
        ElMessage.error("修改失败");
        dialogTableVisible.value = false;
    }
};

// 删除
const deleteMusicList = async (id) => {
    try {
        await delArtistic(id);
        await musicList(10, 1);
        ElMessage.success("删除成功");
    } catch (error) {
        console.log(error, "error");
        ElMessage.error("删除失败");
    }
};

//*音色 和 伴奏*************************************************************************** */

const harmonicHorizon = ref({
    id: "",
    name: "",
    type: "",
});

const modification = (item, val) => {
    console.log(item, 'item');
    showTimbreAccompaniment.value = true;
    harmonicHorizon.value.id = item.gen_id;
    harmonicHorizon.value.name = item.gen_name;
    TimbreAccompaniment_name.value = item.gen_name;
    harmonicHorizon.value.type = val;
};

const removeList = async (id, val) => {
    if (val === "timbre") {
        try {
            await delVoiceInstrumental(id);
            await getMusicInformationData("voice", pageSize.value, currentPage.value);
            ElMessage.success("删除成功");
        } catch (error) {
            console.log(error, "error");
            ElMessage.error("删除失败");
        }
    } else if (val === "accompany") {
        try {
            await delVoiceInstrumental(id);
            await getMusicInformationData(
                "instrumental",
                pageSize.value,
                currentPage.value
            );
            ElMessage.success("删除成功");
        } catch (error) {
            console.log(error, "error");
            ElMessage.error("删除失败");
        }
    }
};

//保存  timbre
const timbreAccompanimentName = async () => {
    if (harmonicHorizon.value.type === "timbre") {
        const footdata = {
            gen_name: TimbreAccompaniment_name.value,
        };
        try {
            await putMyMusicVoiceInstrumental(harmonicHorizon.value.id, footdata);
            await getMusicInformationData("voice", pageSize.value, currentPage.value);
            ElMessage.success("修改成功");
            showTimbreAccompaniment.value = false;
        } catch (error) {
            console.log(error, "error");
            ElMessage.error("修改失败");
            showTimbreAccompaniment.value = false;
        }
    } else if (harmonicHorizon.value.type === "accompany") {
        const footdata = {
            gen_name: TimbreAccompaniment_name.value,
        };
        try {
            await putMyMusicVoiceInstrumental(harmonicHorizon.value.id, footdata);
            await getMusicInformationData(
                "instrumental",
                pageSize.value,
                currentPage.value
            );
            ElMessage.success("修改成功");
            showTimbreAccompaniment.value = false;
        } catch (error) {
            console.log(error, "error");
            ElMessage.error("修改失败");
            showTimbreAccompaniment.value = false;
        }
    }
};

//分享
const shareTimbreAccompaniment = async (id, val, newShareStatus) => {
    const footdata = {
        gen_id: id,
        gen_share: newShareStatus,
    };
    const body = {
        gen_share: newShareStatus,
    }
    const successMessage = radio3.value === "关注" ? (newShareStatus ? '关注成功' : '取消关注') : (newShareStatus ? '分享成功' : '取消分享');

    try {
        if (radio3.value === "我的") {

            await putMyMusicVoiceInstrumental(id, body);
        } else {
            await putMusicVoiceInstrumental(footdata);
        }
        const type = val === 'timbre' ? 'voice' : 'instrumental';
        await getMusicInformationData(type, pageSize.value, currentPage.value, radio3.value === "关注");

        if (newShareStatus) {
            ElMessage.success(successMessage);
        } else {
            ElMessage.error(successMessage);
        }
    } catch (error) {
        console.log(error, 'error');
        ElMessage.error(error.response.data.message);
    }
};

const changeMusicType = async (val, type) => {
    console.log(val, "val");
    if (type === "timbre") {
        if (val === "我的") {
            await getMusicInformationData("voice", pageSize.value, currentPage.value);
        } else if (val === "关注") {
            await getMusicInformationData(
                "voice",
                pageSize.value,
                currentPage.value,
                true
            );
        }
    } else if (type === "accompany") {
        if (val === "我的") {
            await getMusicInformationData(
                "instrumental",
                pageSize.value,
                currentPage.value
            );
        } else if (val === "关注") {
            await getMusicInformationData(
                "instrumental",
                pageSize.value,
                currentPage.value,
                true
            );
        }
    }
};
</script>

<style scoped>
.userName {
    border-bottom: 1px solid #dcdfe6;
    height: 74px;
    display: flex;
    align-items: center;
    font-size: 22px;
    padding-left: 12px;
    font-weight: 600;
}

.timbre_Left {
    width: 22%;
    height: 72vh;
}

.timbre_Right {
    width: 100%;
    height: 72vh;
    /* padding: 5px; */
    padding: 5px 35px;
}

:deep(.el-menu-item) {
    justify-content: center;
}

.List_ofMusic {
    border: 1px solid #ccc;
    border-radius: 10px;
    height: 100px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px;
    margin-bottom: 10px;
}

.custom-menu :deep(.el-menu-item.is-active) {
    background-color: #409eff;
    /* 选中时的背景颜色 */
    color: white;
    /* 选中时的文字颜色 */
}

.custom-menu :deep(.el-menu-item:hover) {
    /* background-color: #66b1ff; */
    /* 移入时的背景颜色 */
    /* color: white; */
    /* 移入时的文字颜色 */
}

.Empty {
    height: 60vh;
    display: flex;
    align-items: center;
    justify-content: center;
}

.container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    max-height: 650px;
}

.shareListContent {
    width: 370px;
    height: 114px;
    border-radius: 10px;
    margin-top: 10px;
    border: 1px solid #e6e8ed;
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
    width: 250px;
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
</style>
