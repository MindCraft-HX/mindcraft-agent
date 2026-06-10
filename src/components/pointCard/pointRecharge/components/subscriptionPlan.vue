<template>
  <div class="pointRecharge">
    <div class="pointRecharge-now">
      <!-- 表格 -->
      <table>
        <thead>
        <tr>
          <th></th>
          <th class="tr2" v-for="items in RecordVIP" :key="items.id">
            {{ items.pricing_name }}
          </th>
        </tr>
        <!-- 标题 -->
        <tr class="tr1">
          <th style="background: #ecf5ff"></th>
          <th v-for="items in RecordVIP" :key="items.id">
            <!-- 免费显示 -->
            <div v-if="items.pricing_price === 0">
              <div style="font-size: 32px; font-weight: 600; margin-bottom: 4px">
                免费
              </div>
              <div style="font-size: 10px">
                {{ items.pricing_structure.description }}
              </div>
            </div>
            <!-- 月卡或者年卡 -->
            <div v-else style="display: flex; flex-direction: column; position: relative">
              <div style="position: absolute; top: 0px; left: 0px">RMB</div>
              <div style="
                  display: flex;
                  justify-content: center;
                  align-items: center;
                ">
                <div style="font-size: 40px; font-weight: 600">
                  {{ items.pricing_price }}
                </div>
                <div style="margin-top: 16px">
                  /{{ items.pricing_price == "39" ? "月" : "年" }}
                </div>
              </div>
              <div style="font-size: 10px">
                {{ items.pricing_structure.description }}
              </div>
            </div>
          </th>
        </tr>
        <!-- 内容 -->
        </thead>
        <tbody>
        <tr v-for="(item, z_index) in permission_list_name" :key="z_index">
          <td>{{ item }}</td>
          <td v-for="itemm in permission_description" style="font-size: 14px">
            <span style="font-weight: 600" v-if="itemm['permission_description'][z_index] === true">✔</span>
            <span v-else-if="itemm['permission_description'][z_index] === false">━</span>
            <!-- 在这里使用 removeDash 方法处理文本 -->
            <span v-else style="white-space: pre-wrap;font-weight: 600;">{{ removeDash(itemm["permission_description"][z_index])
              }}</span>
          </td>
        </tr>
        <!-- 按钮 -->
        <tr>
          <td></td>
          <td v-for="items in RecordVIP" :key="items.id">
            <template v-if="items.id >= 2">
              <el-button @click="
            clickSubscriptionCharge(
              items.id,
              items.pricing_price,
              items.pricing_name
            )
            " type="primary" style="width: 150px; height: 38px; font-size: 18px">{{
            items.pricing_structure.plan_text }}</el-button>
            </template>
          </td>
        </tr>
        </tbody>
      </table>
    </div>
    <paymentDialog ref="paymentDialogRef" :SubscriptionCharge="SubscriptionCharge"
      :Subscriptionprice="Subscriptionprice" :SubscriptionTitle="SubscriptionTitle" />
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed, nextTick } from "vue";
import { InfoFilled } from "@element-plus/icons-vue";
import paymentDialog from "../components/paymentDialog.vue";

const SubscriptionCharge = ref(null);
const Subscriptionprice = ref(null);
const SubscriptionTitle = ref("");
const paymentDialogRef = ref(null);
// const RecordVIP = ref([]);
// const permission_description = ref([]);
// const permission_list_name = ref([]);

const props = defineProps({
  PricingRecordVIP: {
    type: Array,
  },
  permission_list_name: {
    type: Array,
  },
});

const permission_list_name = computed(() => props.permission_list_name);
const RecordVIP = computed(() => props.PricingRecordVIP);
const permission_description = computed(() => {
  return RecordVIP.value.map((item) => ({
    id: item.id,
    permission_description: item.pricing_structure.permission_description,
  }));
});

// console.log(permission_description, 'permission_description66666>>>>>>>>>.');

// 打开支付弹窗
const clickSubscriptionCharge = (id, price, title) => {
  SubscriptionCharge.value = id;
  Subscriptionprice.value = price;
  SubscriptionTitle.value = title;
  paymentDialogRef.value.paymentPopupDialog = true;
  nextTick(() => {
    paymentDialogRef.value.createOrder(); //创建订单
  });
};

const removeDash = (text) => {
  // 使用正则表达式替换所有的“-”为空字符串
  return text.replace(/-/g, '');
}

</script>

<style scoped>
.pointRecharge {
  /* height: 776px; */
  /* background: pink; */
  /* height: 100%; */
}

.pointRecharge-now {
  /* height: 570px; */
  /* display: flex;
  justify-content: space-around; */
  width: 891px;
  overflow: hidden;
  border: 1px solid #dddddd;
  border-radius: 10px;
}

.freePlan {
  /* background: red; */
  padding: 10px 10px;
  width: 228px;
  border: 1px solid #c8c8c8;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  transition: background-color 0.3s ease;
  /* 添加过渡效果 */
}

.freePlan:hover {
  background-color: #ebf5ff;
  /* 鼠标悬停时的背景颜色 */
}

.freePlan-image {
  width: 50px;
  height: 50px;
  background-image: url(../../../../assets/积分.png);
  background-size: 100% 100%;
  margin: 20px 0px;
}

ol {
  list-style-type: none;
  padding: 0;
  margin: 0;
}

i {
  font-style: normal;
  /* 取消斜体 */
  font-weight: normal;
  /* 取消加粗 */
}

.freePlan-ol {
  color: #cbcbcb;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.freePlan-ol>li {
  margin-bottom: 10px;
  font-size: 15px;
}

.extensionPlan {
  /* background: yellow; */
  padding: 10px 10px;
  width: 228px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border: 1px solid #c8c8c8;
  border-radius: 10px;
  transition: background-color 0.3s ease;
  /* 添加过渡效果 */
}

.extensionPlan:hover {
  background-color: #ebf5ff;
  /* 鼠标悬停时的背景颜色 */
}

.extensionPlan-ol {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.extensionPlan-head {
  position: relative;
}

.extensionPlan-SGD {
  position: absolute;
  top: 0px;
  left: 0px;
}

.extensionPlan-image {
  width: 50px;
  height: 50px;
  background-image: url(../../../../assets/积分.png);
  background-size: 100% 100%;
  margin: 20px 0px;
}

.extensionPlan-ol>li {
  margin-bottom: 10px;
  font-size: 15px;
}

.extensionPlan-ol li:nth-last-child(-n + 1) {
  color: #cbcbcb;
  /* 最后两个元素的颜色 */
}

.upgradeToThisPlan-ol li:nth-last-child(-n + 1) {
  color: #cbcbcb;
  /* 最后两个元素的颜色 */
}

.extensionPlan-Button {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 66px;
}

.upgradeToThisPlan {
  /* background: chartreuse; */
  padding: 10px 10px;
  width: 228px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border: 1px solid #c8c8c8;
  border-radius: 10px;
  transition: background-color 0.3s ease;
  /* 添加过渡效果 */
}

.upgradeToThisPlan:hover {
  background-color: #ebf5ff;
  /* 鼠标悬停时的背景颜色 */
}

.upgradeToThisPlan-ol {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.upgradeToThisPlan-ol>li {
  margin-bottom: 10px;
  font-size: 15px;
}

.topUp {
  /* height: 600px; */
  height: 100%;
}

.topUp-head {
  display: flex;
  justify-content: space-between;
}

.topUp-left {
  /* background: pink; */
  width: 230px;
  height: 620px;
  border: 1px solid #c8c8c8;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 10px 10px;
}

.topUp-right {
  /* background: yellow; */
  width: 480px;
  border: 1px solid #c8c8c8;
  border-radius: 10px;
  padding: 10px 10px;
}

.extensionPlan-upgrade-Button {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 95px;
}

.Scrollbar::-webkit-scrollbar-thumb {
  border-radius: 4px;
  background-color: #d7d7d7;
  -webkit-box-shadow: 0 0 1px rgba(255, 255, 255, 0.5);
  box-shadow: 0 0 1px rgba(255, 255, 255, 0.5);
}

.Scrollbar::-webkit-scrollbar-track {
  background-color: #f0f0f0;
  border-radius: 4px;
}

table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}

th,
td {
  border: 1px solid #dddddd;
  text-align: center;
  padding: 10px;
  word-wrap: break-word;
}

th {
  /* background-color: #f2f2f2; */
}

.tr1 th:not(:first-child) {
  background-color: #4d9ef5;
  color: aliceblue;
}

.tr2 {
  background: #ecf5ff;
  padding: 10px;
  color: #686b70;
}
</style>
