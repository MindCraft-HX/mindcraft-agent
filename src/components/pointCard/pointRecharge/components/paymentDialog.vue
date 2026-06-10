<template>
  <div>
    <!-- 弹窗 -->
    <el-dialog v-model="paymentPopupDialog" title="支付方式" width="600" center @close="closePaymentPopupDialog">
      <div class="payMent">
        <div style="display: flex; flex-direction: row-reverse; margin-bottom: 4px">
          <!-- <el-button type="primary" plain size="small" @click="goTopUp" icon="ArrowLeftBold">返回</el-button> -->
        </div>
        <div class="payMent-content">
          <div style="font-size: 20px;font-weight: 600;">您已选择了{{ props.gptTitle || props.SubscriptionTitle }}，即将支付</div>
          <div style="
              display: flex;
              flex-direction: row;
              justify-content: center;
              font-size: 22px;
            ">
            <div style="margin-right: 50px; color: #f17174;font-size: 38px;">RMB</div>
            <div style="color: #f17174;font-size: 38px;">
              {{ props.gptIntegral || props.Subscriptionprice }}元
            </div>
          </div>
          <!-- 二维码 -->
          <div class="payMentp-wx" v-if="currentPaymentMethod === 'WeChatPay'">
            <!-- 微信二维码 -->
            <div v-loading="wxLoading">
              <canvas ref="qrcode" v-if="read"></canvas>
            </div>
          </div>
          <div class="payMentp-AliPay" v-if="currentPaymentMethod === 'AliPay'">
            <!-- 支付宝二维码 -->
            <div v-loading="AliPayLoading">
              <iframe :src="zfbPay" frameborder="no" border="0" marginwidth="0" marginheight="0" scrolling="no"
                width="200" height="200" style="overflow: hidden" v-if="showQRCode && read">
              </iframe>
            </div>

          </div>
          <!-- 提示 -->
          <!-- <div style="display: flex;justify-content: center;">温馨提醒：二维码已过期，请您点击获取最新二维码<el-link type="danger" @click="paymentRefresh" >刷新</el-link></div> -->
          <!-- <div style="margin-top: 20px; text-align: center">
            支付即同意会员协议
          </div> -->
          <div style="
              display: flex;
              justify-content: space-evenly;
              width: 500px;
            ">
            <el-button style="width: 208px;font-size: 20px; height: 42px;" round
              @click="changePaymentMethod('WeChatPay')">
              <svg class="icon" aria-hidden="true" style="font-size: 36px;">
                <use xlink:href="#icon-weixinzhifu"></use>
              </svg>
              <div style="margin-left: 10px;">微信支付</div>
            </el-button>
            <el-button style="width: 208px; font-size: 20px;height: 42px;" round @click="changePaymentMethod('AliPay')">
              <svg class="icon" aria-hidden="true" style="font-size: 34px;">
                <use xlink:href="#icon-zhifubaozhifu"></use>
              </svg>
              <div style="margin-left: 10px;">支付宝支付</div>
            </el-button>
          </div>
          <div style="display: flex;align-items: center;justify-content: center;">
            <el-checkbox v-model="read" size="large" style="margin-right: 5px" />
            <div>
              我已阅读并同意<a @click="goMemberSubscription" style="color: #409eff; cursor: pointer">网络会员订阅服务协议和</a>
              <a @click="goVirtualCurrencyAgreement" style="color: #409eff; cursor: pointer;">网络虚拟币服务协议</a>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <!-- <el-button @click="centerDialogVisible = false">Cancel</el-button> -->
          <el-button type="primary" @click="closePaymentPopupDialog">
            关闭
          </el-button>
        </div>
      </template>
    </el-dialog>
    <!-- 协议弹窗 -->
    <memberSubscription ref="memberSubscriptionRef" />
    <virtualCurrencyAgreement ref="virtualCurrencyAgreementRef" />
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed, nextTick, onBeforeUnmount } from "vue";
import {
  getRechargePoints,
  getWhetherPayment,
} from "@/api/mainActivity/pointCard/pointRecharge/paymentDialog";
import memberSubscription from '../../../agreementDrawer/memberSubscription.vue'
import virtualCurrencyAgreement from '../../../agreementDrawer/virtualCurrencyAgreement.vue'
import QRCode from "qrcode"; // 引入生成二维码插件qrcode
import { ElMessage } from "element-plus";
import { useMitt } from '@/utils/mitt';

const mitt = useMitt();

const paymentPopupDialog = ref(false); // 弹窗开关
const orderInformation = ref({}); // 订单信息
const qrcode = ref(null); //插件qrcode实例
const zfbPay = ref(""); // 支付宝支付二维码
const currentPaymentMethod = ref("WeChatPay"); // 默认为微信支付
const timer = ref(null); //定时器
// const QRCodeLoading = ref(false);
const showQRCode = ref(true);
// const showPayMeat = ref(true);

// loading 
const wxLoading = ref(false);
const AliPayLoading = ref(false);

const read = ref(true);

const emit = defineEmits(["closeMemberSubscription",])


const props = defineProps({
  gptPrice: {
    type: Number,
  },
  gptIntegral: {
    type: Number,
  },
  gptTitle: {
    type: String,
  },
  SubscriptionCharge: {
    type: Number,
  },
  Subscriptionprice: {
    type: Number,
  },
  SubscriptionTitle: {
    type: String,
  }
});

// 支付流程
const createOrder = async () => {
  const pricing_id = props.gptPrice || props.SubscriptionCharge;
  const order_type = currentPaymentMethod.value; //AliPay WeChatPay

  const res = await getRechargePoints({ pricing_id, order_type });
  orderInformation.value = res.data;

  if (currentPaymentMethod.value === "WeChatPay") {
    wxLoading.value = true;
    // 生成微信支付二维码
    qrCode(orderInformation.value.order_remark?.pay_url);
    setTimeout(() => {
      wxLoading.value = false;
    }, 300); // 延迟1秒
  } else if (currentPaymentMethod.value === "AliPay") {
    AliPayLoading.value = true;
    // 显示支付宝支付二维码
    zfbPay.value = orderInformation.value.order_remark?.pay_url;
    showQRCode.value = true;
    setTimeout(() => {
      AliPayLoading.value = false;
    }, 1000); // 延迟1秒
  }

  // 在设置新的长轮询前，先清除之前的定时器
  if (timer.value) {
    clearInterval(timer.value);
    timer.value = null; // 重置timer
  }

  // 长轮询 去看看有没有支付成功
  timer.value = setInterval(async () => {
    let id = orderInformation.value.id;
    const estimate = await getWhetherPayment(id);
    // console.log(estimate, 'estimate');

    if (estimate.status === 200) {  //成功
      // 成功后清除定时器
      clearInterval(timer.value);
      timer.value = null; // 重置timer

      currentPaymentMethod.value = "WeChatPay";
      showQRCode.value = false;
      paymentPopupDialog.value = false;
      //提示成功
      ElMessage.success("已支付成功，请移步页面使用");
      // 刷新权限管理
      mitt.emit('userPermission');

    } else if (estimate.status === 204) { //三分钟还没支付的
      // 可以选择不做任何操作，等待下一次轮询
    }

  }, 2000);
}

// 切换支付方式
const changePaymentMethod = async (type) => {
  currentPaymentMethod.value = type;
  console.log(currentPaymentMethod.value, "currentPaymentMethod.value");
  createOrder();
};

//暴露
defineExpose({
  paymentPopupDialog,
  createOrder,
});

// 转wx二维码
const qrCode = (url) => {
  nextTick(() => {
    QRCode.toCanvas(
      qrcode.value,
      url,
      {
        width: 200,
        height: 200,
      },
      function (error) {
        if (error) console.error(error);
        else console.log("二维码生成成功！");
      }
    );
  });
};

// 点击关闭
const closePaymentPopupDialog = () => {
  paymentPopupDialog.value = false;
  showQRCode.value = false; //关闭支付宝轮询
  clearInterval(timer.value);
};


// onBeforeUnmount(()=>{
//   clearInterval(timer.value);
// });

const memberSubscriptionRef = ref(null);
const virtualCurrencyAgreementRef = ref(null)

// 协议 弹窗打开
const goMemberSubscription = () => {
  // mitt.emit('memberSubscriptionShow')
  // emit('closeMemberSubscription');
  memberSubscriptionRef.value.closeMemberSubscription();
}
const goVirtualCurrencyAgreement = () => {
  // mitt.emit('virtualCurrencyAgreementShow')
  virtualCurrencyAgreementRef.value.openVirtualCurrencyAgreement();
}

watch(() => read.value, (value) => {
  console.log(value);
  if (value) {
    if (currentPaymentMethod.value === 'WeChatPay') {
      changePaymentMethod('WeChatPay')
    }
  }
})


</script>

<style scoped>
.payMent {
  height: 100%;
}

.payMent-content {
  height: 410px;
  /* border: 1px solid #c8c8c8; */
  border-radius: 10px;
  /* padding: 10px 10px; */
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  align-items: center;
}

.payMentp-wx {
  display: flex;
  justify-content: space-around;
  align-items: center;
  border: 4px solid #0AB706;
  width: 210px;
  height: 210px;
  border-radius: 10px 10px;
}

.payMentp-AliPay {
  display: flex;
  justify-content: space-around;
  align-items: center;
  border: 4px solid #009FE8;
  width: 232px;
  height: 224px;
  border-radius: 10px 10px;
}

:deep(.el-dialog__header) {
  border-bottom: 1px solid #E9EBED;
  margin: 5px 15px;
}
</style>
