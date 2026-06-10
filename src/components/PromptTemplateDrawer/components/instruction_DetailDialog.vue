<template>
    <el-dialog title="指令详情" v-model="isVisible" @close="closeDialog" append-to-body>
        <div
            style="float: right; width: 200px; height: 190px;display: flex;flex-direction: column;align-items: center;justify-content: space-around;">
            <img :src="sharedListData.image_url" alt="" style="width: 100px;height: 100px;" />
        </div>
        <el-form :model="sharedListData" label-position="top" label-width="100px" class="add-prompt">
            <el-form-item label="指令名称" style="width: 50%">
                <el-input v-model="sharedListData.prompt_name" disabled></el-input>
                <el-switch v-model="sharedListData.is_shared" active-text="共享" inactive-text="不共享" size="large"
                    disabled></el-switch>
            </el-form-item>
            <el-form-item label="指令类型">
                <el-select v-model="sharedListData.prompt_type" disabled>
                    <el-option label="标准指令" value="standard"></el-option>
                </el-select>
            </el-form-item>
                <el-form-item label="指令内容（提示词）" class="form-item">
                        <el-input v-model="sharedListData.standard_prompt" type="textarea"
                            :autosize="{ minRows: 4, maxRows: 6 }"></el-input>
                </el-form-item>
            <el-form-item label="回应发散性（LLM Temperature）">
                <el-slider v-model="sharedListData.llm_temperature" :step="10" show-stops
                    :format-tooltip="temperatureFormat" :marks="temperatureMarks" class="form-item" disabled />
            </el-form-item>
        </el-form>
    </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
    isVisible: Boolean,
    sharedListData: Object,
});

const emit = defineEmits(['update:isVisible']);


const isVisible = ref(props.isVisible);
const sharedListData = ref(props.sharedListData);

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

const closeDialog = () => {
    isVisible.value = false;
};

const openDialog = () => {
    // console.log(sharedListData.value);
    isVisible.value = true;;
}

watch(() => props.sharedListData, (newVal) => {
    sharedListData.value = newVal;
});

defineExpose({
    openDialog,
})
</script>