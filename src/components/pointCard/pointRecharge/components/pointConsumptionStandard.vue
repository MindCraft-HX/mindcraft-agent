<template>
    <div class="head">
        <div class="topUp-right">
            <div style="display: flex;align-items: center;justify-content: space-between;margin-top: 5px;">
                <div style="color: #4d9ef5;font-size: 20px;margin-left: 12px;display: flex;align-items: center;">模型定价明细
                    <div style="margin-left: 40px;font-size: 14px;">1RMB = 1000 积分</div>
                </div>
                <div style="display: flex; align-items: center;margin-right: 10px; color: #4d9ef5;">
                    显示会员价<el-switch v-model="delivery" style="margin: 0px 6px" />
                    <el-select v-model="value" placeholder="积分" style="width: 140px">
                        <el-option v-for="item in options" :key="item.key" :label="item.key" :value="item.value" />
                    </el-select>
                </div>
            </div>
            <!-- 表格 -->
            <el-table style="margin-top: 5px;white-space: pre-wrap;" :data="pricingDetail" height="450">
                <el-table-column label="Model" width="240" prop="model_name"></el-table-column>
                <el-table-column width="160" prop="model_consume_data.prompt_cost" align="center">
                    <template v-slot:header>
                        <div>
                            提示词积分消耗<br>(积分/K Tokens)
                        </div>
                    </template>
                </el-table-column>
                <el-table-column width="160" prop="model_consume_data.completion_cost" align="center">
                    <template v-slot:header>
                        <div>
                            生成积分消耗<br>(积分/K Tokens)
                        </div>
                    </template>
                </el-table-column>
                <el-table-column label="Token 对汉字比例" width="200" prop="model_config.token_rate" align="center">
                    <template v-slot="scope">
                        <div v-html="formatContent(scope.row.model_config.token_rate)"></div>
                    </template>

                </el-table-column>
                <el-table-column width="130" prop="model_consume_data.average_content" align="center">
                    <template v-slot:header>
                        <div>
                            综合消耗预估<br>(积分/千文字)
                        </div>
                    </template>

                </el-table-column>
            </el-table>
            <div style="text-align: start;font-size: 13px;color: #D3D3D3;margin: 5px 10px;">
                实际消耗积分,其他币种仅作为您使用成本的参考,最大消耗是按Completion Cost推算的,实际可能会更低</div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, watch, computed, h } from "vue";
import { getPointsRecordList } from '@/api/mainActivity/pointCard/pointRecharge/pointConsumptionStandard.js'


const value = ref("points");
const delivery = ref(true);
const pricingDetail = ref([]);

const options = ref([])

onMounted(async () => {
    await pricingDetailList()
});

const pricingDetailList = async () => {
    const is_vip = delivery.value;
    const price_type = value.value;
    const res = await getPointsRecordList({ is_vip, price_type });
    //   console.log(res.data,'res.data');//points_differen
    pricingDetail.value = res.data.points_list;
    options.value = res.data.points_differen;
};
// 监听 delivery 和 value 的变化，当它们变化时重新请求数据
watch([delivery, value], () => {
    pricingDetailList();
});

function formatContent(cellValue) {
    if (cellValue === null) {
        return '/';
    }
    if (typeof cellValue === 'string') {
        return cellValue.replace(/\n/g, '<br>');
    }
    return cellValue ? String(cellValue) : '';
}

</script>

<style scoped>
.head {
    width: 891px;
    /* height: 516px; */
    /* background: pink; */
    border: 1px solid #c8c8c8;
    border-radius: 10px 10px;
}

:deep(.el-table tr > th) {
    background: #ebf5ff;
}

:deep(.el-table thead.is-group th.el-table__cell) {
    background: #ebf5ff;
}

:deep(.el-table--border .el-table__cell) {
    border-right: none;
}
</style>