<template>
  <div>
    <div class="pointRecharge">
      <!-- 上面 -->
      <ul style="display: flex; justify-content: space-between">
        <li class="box" v-for="item in topPoints" :key="item.id">
          <div class="box-conte">
            <div>
              <div style="margin: 12px 0px -5px 12px; color: #4d9ef5">{{item.pricing_name}}</div>
              <div
                style="
                  margin: 3px 8px;
                  color: #4d9ef5;
                  font-size: 50px;
                  font-weight: 600;
                "
              >
                {{ item.pricing_points }}
              </div>
            </div>
            <div class="A">
              <el-button
                style="width: 216px"
                type="primary"
                @click="ClickRechargeAmount(item.id,item.pricing_price,title)"
                >RMB {{item.pricing_price}}</el-button
              >
            </div>
          </div>
        </li>
      </ul>
      <!-- 下面 -->
      <ul style="display: flex; justify-content: space-between">
        <li class="box" v-for="item in bottomPoints" :key="item.id" >
          <div class="box-conte">
            <div>
              <div style="margin: 12px 0px -5px 12px; color: #4d9ef5">{{item.pricing_name}}</div>
              <div
                style="
                  margin: 3px 8px;
                  color: #4d9ef5;
                  font-size: 50px;
                  font-weight: 600;
                "
              >
                {{item.pricing_points}}
              </div>
            </div>
            <div class="A">
              <el-button
                style="width: 216px"
                type="primary"
                @click="ClickRechargeAmount(item.id,item.pricing_price,title)"
                >RMB {{item.pricing_price}}</el-button
              >
            </div>
          </div>
        </li>
      </ul>
    </div>
    <!-- 弹窗 -->
    <paymentDialog ref="myDialog" :gptPrice="gptPrice" :gptIntegral="gptIntegral" :gptTitle="gptTitle" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch, computed, nextTick  } from "vue";
import paymentDialog from "../components/paymentDialog.vue";

// const mitt = useMitt();
const gptPrice = ref(null);
const gptIntegral =ref(null);
const gptTitle = ref("");

const myDialog = ref(null);
const title = ref('充值积分');

const topPoints = ref([]);
const bottomPoints = ref([]);

const props = defineProps({
  PricingRecordPoints: {
    type: Array,
  },
});
// pricing_name 名字 积分 
// pricing_points 积分 5400

// 打开支付弹窗
const ClickRechargeAmount = (id,price,title) => {
  gptPrice.value = id;
  gptIntegral.value = price;
  gptTitle.value = title;
  console.log(id,price,title);
  myDialog.value.paymentPopupDialog = true;
  nextTick(()=>{
    myDialog.value.createOrder();//创建订单
  });
};

watch(()=>props.PricingRecordPoints,(newVal)=>{
  const topData = newVal.slice(0, 3);
  const bottomData = newVal.slice(3);
  topPoints.value = topData;
  bottomPoints.value = bottomData;
},{deep:true});

</script>

<style scoped>
.pointRecharge {
  width: 891px;
  /* height: 662px; */
  /* background: pink; */
  /* border: 1px solid #c8c8c8; */
  border-radius: 10px 10px 10px 10px;
  /* margin-top: 40px; */
}

ul,
li {
  list-style: none;
  padding: 0;
  margin: 0;
}

.box {
  /* background: red; */
  width: 276px;
  height: 320px;
  border: 1px solid #c8c8c8;
  margin-bottom: 15px;
  /* 调整盒子之间的间距 */
  border-radius: 10px 10px;
  background-image: url("../../../../assets/background197.png");
  background-size: 100% 100%;
}
.box-conte {
  text-align: left;
}
.A {
  height: 153px;
  display: flex;
  justify-content: space-around;
  align-items: flex-end;
  margin-top: 54px;
}
:deep(.el-button > span) {
  font-size: 20px;
}
</style>
