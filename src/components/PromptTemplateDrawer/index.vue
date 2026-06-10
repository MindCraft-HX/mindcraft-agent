<template>
    <div>
        <el-drawer v-model="table" title="预设指令" direction="rtl" size="75%">
            <el-tabs v-model="activeName" type="card" class="demo-tabs" @tab-click="handleClick">
                <el-tab-pane label="发现" name="first">
                    <instructionList ref="instructionListRef" />
                </el-tab-pane>
                <el-tab-pane label="我的" name="second">
                    <instructionMine ref="instructionMineRef" />
                </el-tab-pane>
                <el-tab-pane label="添加" name="third" :disabled="!userType">
                    <template #label>
                      <div style="display: flex;flex-direction: row;align-items: center;justify-content: center;">
                        <span>添加</span>
                        <div class="vip-icon" :class="{ 'vip-icon-active': userType }"></div>
                      </div>
                    </template>
                    <instructionAdd @successfulJump="successfulJump" />
                </el-tab-pane>
            </el-tabs>
        </el-drawer>
    </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch, computed } from "vue";
import { useMitt } from "@/utils/mitt";
import instructionAdd from './components/instruction_add.vue';
import instructionList from './components/instruction_List.vue';
import instructionMine from './components/instruction_mine.vue';

const mitt = useMitt();


const table = ref(false);
const activeName = ref('first');
const instructionListRef = ref(null);
const instructionMineRef = ref(null);


const openPromptTemplate = () => {
    table.value = true
};

mitt.on('openPromptTemplate', () => {
    openPromptTemplate();
})

const handleClick = (val) => {
    if (val.props.name === "second") {
        instructionMineRef.value.getMinePromptTempList();
    } else if (val.props.name === "first") {
        instructionListRef.value.getInstructionPromptList();
    }
}

const successfulJump = () => {
    activeName.value = 'second';
    instructionMineRef.value.SuccessfulJump_Mine();
}


defineExpose({
    openPromptTemplate,
})

import { userVipTypeStore } from '../../stores/vipType';
const VipTypeStore = userVipTypeStore();
const userType = computed(() => {
  // const res = VipTypeStore.privilege.includes('use_library_add');
  const res = VipTypeStore.vip_level > 0
  // console.log(res,'>>>>>>>>>>>>>>>.');
  return res
})

</script>

<style scoped>
.vip-icon{
  background: url("../../assets/VIP1.png");
  background-position: center;
  background-repeat: no-repeat;
  background-size: auto 100%;
  width: 26px;
  height: 10px;
}
.vip-icon-active{
  background-image: url("../../assets/VIP2.png");
}
</style>