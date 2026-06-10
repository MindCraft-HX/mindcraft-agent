<template>
    <div>
        <div class="membershipDetails">
            <el-menu :default-active="activeIndex2" class="el-menu-demo" mode="horizontal" background-color="#EBF5FF"
                text-color="#409EFE" active-text-color="#409EFE" @select="handleMenuSelect" :ellipsis="false">
                <!-- @select="handleSelect" -->
                <el-menu-item index="1">全部</el-menu-item>
                <el-menu-item index="2">支出</el-menu-item>
                <el-menu-item index="3">消耗</el-menu-item>
                <el-menu-item index="4">Api消耗</el-menu-item>
                <!-- <el-menu-item index="5">冻结</el-menu-item> -->
            </el-menu>
            <!-- 下拉框 -->
            <div class="choose">
                <!-- <el-select v-model="value" clearable placeholder="账户类型" style="width: 160px" @change="accountType"
                    @clear="deleteAccountType">
                    <el-option v-for="item in options" :key="item.value" :label="item.label" :value="item.value" />
                </el-select> -->
                <el-select v-model="maketType" clearable placeholder="模型" style="width: 230px" @change="modelType"
                    @clear="deleteAccountType">
                    <el-option v-for="(item, index) in model_list" :key="index" :label="item" :value="item" />
                </el-select>
                <!-- <el-time-picker style="width: 10vw" v-model="value1" is-range range-separator="To" start-placeholder="Start time"
                    end-placeholder="End time" /> -->
                <!-- <el-time-picker v-model="value1" placeholder="开始时间" style="width: 160px" />
                <el-time-picker v-model="value2" placeholder="结束时间" style="width: 160px" /> -->
                <el-date-picker v-model="datePicker" type="datetimerange" start-placeholder="开始日期/时间"
                    end-placeholder="结束日期/时间" format="YYYY-MM-DD HH:mm:ss" date-format="YYYY/MM/DD ddd"
                    time-format="A hh:mm:ss" style="width: 350px;" @change="datePickerType" />
            </div>
            <!-- 表格 -->
            <div style="margin-top: 20px">
                <el-table :data="integralList" style="width: 100%" height="540" empty-text="暂时没数据！">
                    <el-table-column prop="created_at" label="交易时间" min-width="200" />
                    <!-- <el-table-column prop="name" label="账户类型" width="110" v-slot="{ row }">
                        <el-tag>{{ row.name }}</el-tag>
                    </el-table-column> -->
                    <el-table-column prop="record_type" label="交易类型" min-width="110" v-slot="{ row }">
                        <!-- <el-tag effect="dark" :type="row.record_type === 'recharge' ? '' : 'danger'" >{{ row.record_type === 'recharge' ? '支出' : '消耗' }}</el-tag> -->
                        <el-tag effect="dark" :type="row.record_type === 'recharge' ? '' : 'danger'">
                            {{ row.record_type === 'recharge' ? '支出' : (row.record_type === 'api_key' ? 'Api消耗' : '消耗')}}
                        </el-tag>
                    </el-table-column>
                    <el-table-column prop="points" label="积分" min-width="150" />
                    <el-table-column prop="model" label="模型" min-width="200" />
                    <el-table-column prop="record_remark" label="描述" min-width="248" />
                </el-table>
                <!-- 分页 -->
                <div style="padding: 10px 10px">
                    <el-pagination v-model:current-page="currentPage" background v-model:page-size="pageSize"
                        :page-sizes="[8, 15, 30, 50]" :small="true" layout=" sizes, prev, pager, next, jumper,->,total"
                        :total="total" @size-change="handleSizeChange" @current-change="handleCurrentChange" />
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, watch, onMounted } from "vue";
import { getPointsList } from '@/api/mainActivity/pointCard/IntegralDetail';
import { useMitt } from "../../../utils/mitt";
const mitt = useMitt();



const activeIndex2 = ref("1");
const value = ref("");
const maketType = ref("");
const datePicker = ref([]);
const integralList = ref([]); //表格数组
const recordType = ref("");

// 分页
const currentPage = ref(1);
const pageSize = ref(8);
const total = ref(0);
const model_list = ref([]);



// 挂载
onMounted(async () => {
    IntegralDetailLIst();
});

// 请求表格List
const IntegralDetailLIst = async (min_create, max_create,) => {
    try {
        const res = await getPointsList(recordType.value, maketType.value, currentPage.value, pageSize.value, min_create, max_create);
        // console.log(res,'看看数据');
        integralList.value = res.data.results;

        total.value = res.data.count;

        model_list.value = res.data.model_list;
        // console.log(model_list.value,'model_list.value');
        // console.log(integralList.value, 'integralList.value');
        // 更新日期选择器的默认值
    } catch (error) {
        console.log(error);
    }
};

mitt.on('IntegralDetailLIst', () => {
    IntegralDetailLIst();
});


const handleCurrentChange = (val) => {
    currentPage.value = val;  // 更新当前页
    IntegralDetailLIst();  // 获取新页面数据
};
const handleSizeChange = (val) => {
    pageSize.value = val;  // 更新每页显示条数
    IntegralDetailLIst();  // 重新获取数据
};

// 模型选择 下拉框
const modelType = (value) => {
    maketType.value = value; // 更新模型选择的值
    IntegralDetailLIst(); // 根据选择的模型重新请求数据
};

// 下拉框 清空回调
const deleteAccountType = () => {
    IntegralDetailLIst();
};

const datePickerType = (value) => {
    const startTimeStamp = Math.floor(new Date(value[0]).getTime() / 1000); // 起始时间戳，转换为秒
    const endTimeStamp = Math.floor(new Date(value[1]).getTime() / 1000); // 结束时间戳，转换为秒
    IntegralDetailLIst(startTimeStamp, endTimeStamp);
}

// 点击过滤
const handleMenuSelect = (key, keyPath) => {
    if (key == 1) {
        recordType.value = "";
        currentPage.value = 1;
        IntegralDetailLIst();
    }
    if (key == 2) {
        recordType.value = "recharge";
        currentPage.value = 1;
        IntegralDetailLIst();
    }
    if (key == 3) {
        recordType.value = "consume";
        currentPage.value = 1;
        IntegralDetailLIst();
    }
    if(key == 4){
        recordType.value = "api_key";
        currentPage.value = 1;
        IntegralDetailLIst();
    }
};

// 下拉框 账户类型
const options = [
    {
        value: "主账户",
        label: "主账户",
    },
    {
        value: "子账户",
        label: "子账户",
    },
];
// 模型类型
const options1 = [
    // {
    //     value: "GPT-3.5-Turbo (16K)",
    //     label: "GPT-3.5-Turbo (16K)",
    // },
    // {
    //     value: "GPT-4-Turbo (128K)",
    //     label: "GPT-4-Turbo (128K)",
    // },
    {
        value: "GPT-3.5-Turbo",
        label: "GPT-3.5-Turbo",
    },
    {
        value: "GPT-4-Turbo",
        label: "GPT-4-Turbo",
    },
    {
        value: "DALL-E-3",
        label: "DALL-E-3",
    },
    {
        value: "GPT-4-V",
        label: "GPT-4-V",
    },
];




</script>

<style scoped>
.membershipDetails {
    border: 1px solid #cacaca;
    border-radius: 10px;
    height: 680px;
}

:deep(.el-menu--horizontal) {
    border-radius: 10px 10px 0px 0px;
    height: 40px;
}

:deep(.el-menu--horizontal > .el-menu-item.is-active:first-child) {
    border-radius: 10px 0px 0px 0px;
}

.choose {
    margin: 10px 0;
    display: flex;
    justify-content: space-evenly;
    align-items: center;
}

:deep(.el-scrollbar__wrap--hidden-default) {
    display: flex;
}

:deep(.el-table tr > th) {
    background: #ebf5ff;
}

:deep(.el-table.is-scrolling-left th.el-table-fixed-column--left) {
    background: #ebf5ff;
}

/* 日期时间选择器 取消了这个 不然会宽度推开全部 */
:deep(.el-input__wrapper) {
    flex-grow: 0;
}
</style>
