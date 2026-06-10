<template>
    <div style="overflow-y:auto;">
        <!-- 订阅计划 -->
        <div>
            <div style="text-align: left;font-size: 20px; margin-bottom: 12px;color: #c6c6c6;">订阅计划</div>
            <div>
                <subscriptionPlan :PricingRecordVIP="PricingRecordVIP" :permission_list_name="permission_list_name" />
            </div>
        </div>
        <!-- 积分充值 -->
        <div>
            <div style="text-align: left;color: #c6c6c6;font-size: 20px;margin: 10px">积分充值</div>
            <div>
                <integraRecharge :PricingRecordPoints="PricingRecordPoints" />
            </div>
        </div>
        <!-- 积分消费标准 -->
        <!-- <div>
            <div style="text-align: left;font-size: 20px; margin-bottom: 12px;color: #c6c6c6;margin: 10px">积分消费标准</div>
            <div>
                <pointConsumptionStandard />
            </div>
        </div> -->
    </div>
</template>

<script setup>
import { ref, onMounted, watch, computed } from "vue";
import subscriptionPlan from './components/subscriptionPlan.vue';
import integraRecharge from './components/integraRecharge.vue';
import pointConsumptionStandard from './components/pointConsumptionStandard.vue';
import { getPricingRecord } from '../../../api/mainActivity/pointCard/pointRecharge/subscriptionPlan';

const PricingRecordVIP = ref([]); //vip数组
const PricingRecordPoints = ref([]); //积分数组
const permission_list_name = ref([]);

onMounted(async ()=>{
   const res = await getPricingRecord();
   PricingRecordVIP.value = res.data.VIP;
   PricingRecordPoints.value = res.data.points;
   permission_list_name.value = res.data.permission_list_name;
});


</script>

<style scoped></style>