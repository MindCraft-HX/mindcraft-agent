<template>
  <div class="container">
    <!-- <div class="product-intro"> -->
    <!-- 选择服务器功能 -->
    <div style="position: absolute; top: 4px; left: 28px">
      <h5>版本号：{{config.version}}</h5>
      <!-- <el-image style="width: 40px;" src="./assets/logo旧.png"></el-image> -->
      <template v-if="!isProd">
          <h1 class="product-slogan">BETA版</h1>
          <el-select placeholder="请选择服务器" size="large" style="width: 240px; margin-top: 5px" v-model="server_selection">
            <el-option v-for="item in serverOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
      </template>
    </div>
    <!-- <div class="block text-center">
        <el-carousel
          class="carousel"
          indicator-position="outside"
          type="card"
          :interval="6000"
          trigger="click"
        >
          <el-carousel-item v-for="(image, index) in images" :key="index">
            <div class="slide-container">
              <el-image
                class="slide-image"
                :src="image"
                @click="onPreview(index)"
                :zoom-rate="1.2"
                fit="cover"
              ></el-image>
              <div class="overlay-text">{{ texts[index] }}</div>
            </div>
          </el-carousel-item>
        </el-carousel>
        <ElImageViewer
          v-if="showViewer"
          @close="closeViewer"
          :url-list="viewerImgList"
          :z-index="5000"
        >
        </ElImageViewer>
      </div> -->
    <!-- <div class="product-roadmap">
        <div class="left-column">
          <el-text size="large" type="success" tag="b">已完成</el-text>
          <br />
          <div class="text-icon">
            <el-icon color="green"> <CircleCheck /> </el-icon>智能对话
          </div>
          <div class="text-icon">
            <el-icon color="green"> <CircleCheck /> </el-icon>知识库功能
          </div>
          <div class="text-icon">
            <el-icon color="green"> <CircleCheck /> </el-icon>提示词深度定制
          </div>
        </div>
        <div class="right-column">
          <el-text size="large" type="primary" tag="b">开发中</el-text>
          <br />
          <div class="text-icon">
            <el-icon color="gray"> <Lock /> </el-icon>内容生成器
          </div>
          <div class="text-icon">
            <el-icon color="gray"> <Lock /> </el-icon>代码解释器
          </div>
          <div class="text-icon">
            <el-icon color="gray"> <Lock /> </el-icon>多人机对话
          </div>
          <div class="text-icon">
            <el-icon color="gray"> <Lock /> </el-icon>项目工厂
          </div>
          <div class="text-icon">
            <el-icon color="gray"> <Lock /> </el-icon>模型训练
          </div>
        </div>
      </div> -->
    <!-- </div> -->
    <!-- <div>
      <el-image
        class="login-title"
        src="./assets/MindCraft LOGO.png"
      ></el-image>
    </div> -->
    <div class="login-container">
      <el-image class="login-title" src="./assets/网站.png"></el-image>

      <el-card class="login-card" v-show="currentCard === 'login-card'">
        <div class="avatar-container">
          <el-avatar class="avatar" size="large" :src="circleUrl" shape="square" />
        </div>
        <el-form :model="form" :rules="rules" ref="loginForm" label-width="6px" class="login-form">
          <el-form-item prop="identifier">
            <el-input suffix-icon="UserFilled" placeholder="用户名/邮箱/手机号" v-model="form.identifier"></el-input>
          </el-form-item>
          <el-form-item prop="password">
            <el-input suffix-icon="Unlock" type="password" placeholder="密码" v-model="form.password"
              @keyup.enter.exact="login"></el-input>
          </el-form-item>
          <el-form-item>
            <el-button class="login-button" type="primary" @click="login" round>登录</el-button>
          </el-form-item>
          <el-form-item>
            <el-button class="register-button" type="primary" plain @click="showRegister" round>注册</el-button>
          </el-form-item>
          <el-form-item>
            <el-button class="find-password" type="primary" link tag="ins" @click="retrievePassword">找回密码</el-button>
            <el-button class="wxlogo" circle @click="WechatLogin('login-card1')">
              <svg class="icon" aria-hidden="true" style="font-size: 26px">
                <use xlink:href="#icon-weixindenglu"></use>
              </svg>
            </el-button>
            <el-button class="mini_program" circle @click="miniProgramLogin('login-card2')">
              <svg class="icon" aria-hidden="true" style="font-size: 26px">
                <use xlink:href="#icon-xiaochengxu"></use>
              </svg>
            </el-button>
          </el-form-item>
        </el-form>
        <!-- wx图标 -->
        <!-- <div class="wxButton" @click="wxButton('login-card1')">
          <img src="../../public/wx_logo.png" alt="" style="width: 28px; height: 28px" />
        </div> -->
      </el-card>
      <!-- 切换二维码 -->
      <el-card class="login-card2" v-show="currentCard === 'login-card1'">
        <!-- 微信二维码 -->
        <div id="login_container"></div>
        <!-- 蒙版 -->
        <div class="masking_login3" v-if="showCard">
          <div class="masking_login2">
            <el-button circle style="width: 60px;height: 60px;" @click="refurbishCode">
              <svg class="icon" aria-hidden="true" style="font-size: 24px">
                <use xlink:href="#icon-shuaxin"></use>
              </svg>
            </el-button>
          </div>
        </div>

        <div class="wxButton" style="display: flex;align-items: center;">
            <el-button @click="switchCard('login-card')" type="primary" plain>返回</el-button>
            <div style="margin-left: 12px;">
                扫码默认阅读并同意<a @click="goAgreement" style="color: #409eff; cursor: pointer">用户协议和</a>
            <a @click="goPrivacy" style="color: #409eff; cursor: pointer">隐私协议</a>
            </div>
        </div>
      </el-card>
      <!-- 切换小程序 -->
      <el-card class="login-card3" v-show="currentCard === 'login-card2'">
        <img style="width: 300px;height: 300px;" src="../assets/qrcode(2).jpg" alt="">
        <el-button class="wxButton" @click="switchCard('login-card')" type="primary" plain>返回</el-button>
      </el-card>
      <el-text class="login-footer">
        © 2020 - 2024 深圳瀚象信息科技有限公司 版权所有
      </el-text>
    </div>
    <Register />
    <!-- 微信绑定弹窗 -->
    <el-drawer v-model="WechatVisible" title="绑定账号" direction="rtl" size="380px">
      <el-form :model="wechatGather" :rules="wechatGatherRules" ref="wechatGatherRef" label-width="80px">
        <el-form-item label="绑定账号" prop="account">
          <el-input v-model="wechatGather.account" placeholder="请选择邮箱/手机号"></el-input>
        </el-form-item>
        <el-form-item label="验证码" prop="code">
          <el-input v-model="wechatGather.code">
            <template #append>
              <el-button type="primary" @click="WechatEmailCode"
                :disabled="!wechatGather.account || isButtonDisabled">{{ buttonText }}</el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item prop="agreement">
          <el-checkbox v-model="wechatGather.agreement" size="large" style="margin-right: 5px" />
          <div>
            我已阅读并同意<a @click="goAgreement" style="color: #409eff; cursor: pointer">用户协议和</a>
            <a @click="goPrivacy" style="color: #409eff; cursor: pointer">隐私协议</a>
          </div>
        </el-form-item>
        <el-form-item class="register-footer" style="margin-top: 50px;">
          <el-button type="primary" @click="resetWechat">确认提交</el-button>
          <el-button type="danger" @click="closeWechat">取消</el-button>
        </el-form-item>
      </el-form>
    </el-drawer>
    <!-- 验证码弹窗 verify_codeRules -->
    <el-dialog v-model="centerDialogWechat" title="验证码" width="400" center>
      <el-form ref="verify_codeRef" :model="verify_code" :rules="verify_codeRules" label-width="auto"
        class="demo-ruleForm">
        <el-form-item label="验证码" prop="code">
          <div style="display: flex">
            <el-input v-model="verify_code.code" type="text" style="width: 150px" clearable>
            </el-input>
            <img class="code-img" style="object-fit: cover; margin-left: 5px" :src="WxAttributes.url + image_url" alt=""
              @click="WechatEmailCode" />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="clickWechatCode">
            确定
          </el-button>
          <el-button @click="centerDialogWechat = false">取消</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 用户协议弹窗 -->
    <userAgreement ref="userAgreementRef" :wechatGather="wechatGather" />
    <!-- 隐私协议 -->
    <privacyAgreement ref="privacyAgreementRef" :wechatGather="wechatGather" />

  </div>
</template>

<script setup>
import { ref, reactive, provide, watch, computed } from "vue";
import config from "@/utils/config.json"
// import api from "@/utils/request";
import { useRouter } from "vue-router";
import { ElMessage, ElImageViewer } from "element-plus";
import { userInformation } from "../stores/userInformation";
import Register from "./Register.vue";
import { Login, WeChatLogin, postSendCode } from "@/api/mainActivity/login";
import { baseURL } from "@/utils/request";

import userAgreement from "./agreementDrawer/userAgreement.vue";
import privacyAgreement from "./agreementDrawer/privacyAgreement.vue";

import { useMitt } from "../utils/mitt";

const mitt = useMitt();

const isProd = computed(() => {
    return window.VITE_NODE_ENV != 'development' && window.VITE_NODE_ENV != 'testing'
})

const userStore = userInformation();

const server_selection = ref("");
const serverOptions = [
  {
    value: "https://api.mindcraft.com.cn/", //生产
    label: "生产",
    appid: "wxd1eee58e6c92a01a",
    wsURL: "wss://api.mindcraft.com.cn/socket-v1/"
  },
  {
    value: "https://grayapi.mindcraft.com.cn/",
    label: "灰度",
    appid: "wx051d6926de440019",
    wsURL: "wss://grayapi.mindcraft.com.cn/socket-v1/"
  },
  {
    value: "http://127.0.0.1",
    label: "本地",
    appid: "wx051d6926de440019", 
    wsURL: "ws://127.0.0.1/socket-v1/" 
  },
];

let WxAttributes = ref({
    url: "",
    appid: "",
    wsURL: ""
});//灰度
if(isProd.value) {
    WxAttributes.value = {
        url:"https://api.mindcraft.com.cn/",
        appid:"wxd1eee58e6c92a01a",
        wsURL: "wss://api.mindcraft.com.cn/socket-v1/"
    };//切换生产
}

watch(
  () => server_selection,
  (newVal) => {
    console.log(newVal, 'newVal');
    baseURL.value = newVal.value;
    localStorage.setItem("baseURL", newVal.value);
    WxAttributes.value.url = newVal.value;
    const selectedServer = serverOptions.find(option => option.value === newVal.value);
    // console.log(selectedServer,'selectedServer');
    WxAttributes.value.appid = selectedServer.appid;
    WxAttributes.value.wsURL = selectedServer.wsURL;
    localStorage.setItem("wsURL", selectedServer.wsURL);
  },
  { deep: true }
);

const router = useRouter();
// 定义表单数据的初始值
const form = reactive({
  identifier: localStorage.getItem("identifier"),
  password: "",
});
//幻灯片图片及文字
const images = ref([
  "./assets/界面展示1.png",
  "./assets/展示2.png",
  "./assets/预设指令展示.png",
  "./assets/代码块高亮展示.png",
]);
const texts = ref([
  "功能丰富的智能对话体验",
  "知识库添加",
  "多样化的提示词设置",
  "代码块高亮",
]);
//幻灯片预览
const showViewer = ref(false);
const viewerImgList = ref([]);

const currentCard = ref("login-card");

const onPreview = (index) => {
  showViewer.value = true;
  let tempImgList = [...images.value];
  let temp = [];
  for (let i = 0; i < index; i++) {
    temp.push(tempImgList.shift());
  }
  viewerImgList.value = tempImgList.concat(temp);
};

const closeViewer = () => {
  showViewer.value = false;
};
//头像图片
const circleUrl = ref("./assets/default-avatar.png");

// 创建表单实例的引用
const loginForm = ref(null);
const rules = reactive({
  identifier: [
    { required: true, message: "请输入用户或邮箱", trigger: "blur" },
    { min: 2, message: "用户名不能少于2个字符", trigger: "blur" },
  ],
  password: [
    { required: true, message: "请输入密码", trigger: "blur" },
    { min: 6, message: "密码不能少于6个字符", trigger: "blur" },
  ],
});

const login = async () => {
  const valid = await loginForm.value.validate();
  if (valid) {
    try {
      // const response = await api.post("llm/login/", {
      //   identifier: form.identifier,
      //   password: form.password,
      // });
      // 发送登录请求
      const response = await Login({
        identifier: form.identifier,
        password: form.password,
      });
      const data = response.data;
      if (data.message === "登录成功") {
        const userInfo = {
          user_id: data.user_id,
          username: data.username,
          email: data.email,
          avatar: data.avatar,
          nickname: data.nickname,
          wechat_username: data.wechat_username,
        };
        console.log(data, "看看数据");
        userStore.setUserInfo(userInfo);
        // 弹出登录成功的提示信息
        ElMessage.success(data.message);
        // 将Token保存到本地存储中
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("refresh_token", data.refresh_token);
        // 将用户名保存到本地存储中
        if (data.get_username === 'username') {
          localStorage.setItem("username", data.username);
        } else if (data.get_username === 'nickname') {
          localStorage.setItem("username", data.nickname);
        }
        // localStorage.setItem("username", data.username);


        //将账号保存到本地
        localStorage.setItem("identifier", form.identifier);

        // 跳转到主页
        // router.push('/main/chat');
        router.push({ name: "Chat" });
        console.log("跳转到主页");
      } else {
        console.error(data.message);
      }
    } catch (error) {
      console.error("登录请求出错", error);
      ElMessage.error(error.response.data.message);
    }
  } else {
    // console.error('登录失败');
    ElMessage.error("登录失败");
  }
};

//注册功能,跳转到Register.vue
const drawerVisible = ref(false);
const drawerVisible2 = ref(false);
provide("drawerVisible", drawerVisible);
provide("drawerVisible2", drawerVisible2);
const showRegister = () => {
  drawerVisible.value = true;
};
const retrievePassword = () => {
  drawerVisible2.value = true;
  // WechatVisible.value = true;
};

// 点击切换二维码
// const wxButton = (card) => {
//   currentCard.value = card;
// };

/*微信登录************************************************************************************************************************* */

const state = ref(""); //随机字符串
const showCard = ref(false);
const WechatVisible = ref(false);
const wechatGatherRef = ref(null); //表单示例
const centerDialogWechat = ref(false);

const verify_codeRef = ref(null);//邮箱表单示例

const image_url = ref(""); //图片
const image_hashKey = ref("");
const userData = ref('');

// watch(baseURL.value,(newVal)=>{
//    console.log(newVal,'newVal');
// },{deep:true});




// 定时器倒计时
const isButtonDisabled = ref(false);
const buttonText = ref('发送验证码');
const countdown = ref(60);

// 绑定数据
const wechatGather = ref({
  account: "",
  code: "",
  agreement: false,
});

const userAgreementRef = ref(null);
const privacyAgreementRef = ref(null);

// 验证码列表
const verify_code = ref({
  code: '',
})

const verify_codeRules = reactive({
  code: [
    { required: true, message: "请输入验证码", trigger: "blur" },
  ],
});

const wechatGatherRules = reactive({
  account: [
    { required: true, message: "请输入邮箱/手机", trigger: "blur" },
    { validator: validateAccount, trigger: "blur" },
  ],
  code: [{ required: true, message: "请输入验证码", trigger: "blur" }],
  agreement: [
    { required: true, message: "请阅读用户协议" },
    {
      validator: (rule, value, callback) => {
        if (value) {
          console.log(value, "value");
          callback();
        } else {
          console.log(value, "value");
          callback(new Error("请阅读并同意用户协议"));
        }
      },
      trigger: "change",
    },
  ],
});

// 自定义校验函数，验证输入的账号是邮箱还是手机号
function validateAccount(rule, value, callback) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^\d{11}$/;

  if (emailRegex.test(value) || phoneRegex.test(value)) {
    callback(); // 校验通过
  } else {
    callback(new Error("请输入有效的邮箱或手机号")); // 校验失败
  }
}

const generateRandomString = (length) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

// 生产 wxd1eee58e6c92a01a
// 灰度 wx051d6926de440019

const setWxerwma = () => {
  new WxLogin({
    self_redirect: true,
    // self_redirect: false,
    id: "login_container",
    appid: `${WxAttributes.value.appid}`,
    scope: "snsapi_login",
    // redirect_uri: URL.value,
    redirect_uri: `${WxAttributes.value.url}/wxweb/`,
    state: state.value,
    style: "black",
    href: "",
  });
};
//点击微信登录
const WechatLogin = async (card) => {
  currentCard.value = card;
  wx_logo();
};

const skipCode = ref("")
const wx_logo = async () => {
  const randomState = generateRandomString(16); // 生成一个16位的随机字符串
  state.value = randomState;
  setWxerwma(); //渲染二维码
  try {
    const res = await WeChatLogin({ state: state.value });
    if (res.status === 200) {
      console.log('没有绑定的');
      // 拿到user_data
      userData.value = res.data.user_data;
      skipCode.value = res.data.skip_code;
      //经行绑定
      WechatVisible.value = true;
      ElMessage.warning('请绑定账号');

    } else if (res.status === 201) {
      console.log('绑定过的');
      console.log(res, 'res');
      const userInfo = {
        user_id: res.data.user_id,
        username: res.data.username,
        email: res.data.email,
        avatar: res.data.avatar,
        nickname: res.data.nickname,
        wechat_username: res.data.wechat_username,
      };
      userStore.setUserInfo(userInfo);

      localStorage.setItem("user_id", Number(res.data.user_id));



      localStorage.setItem("access_token", res.data.access_token);
      localStorage.setItem("refresh_token", res.data.refresh_token);
      // 将用户名保存到本地存储中
      if (res.data.get_username === 'username') {
        localStorage.setItem("username", res.data.username);
      } else if (res.data.get_username === 'nickname') {
        localStorage.setItem("username", res.data.nickname);
      }
      ElMessage.success('登录成功');
      router.push({ name: "Chat" });
    }
  } catch (error) {
    console.log(error, 'error');
    // ElMessage.error('登录超时');
    showCard.value = true;
  }
}

// 返回的
const switchCard = (card) => {
  currentCard.value = card;
};

// 刷新二维码
const refurbishCode = async () => {
  showCard.value = false;
  wx_logo();
}
/*绑定微信手机号逻辑************************************************************************************************************* */

// 获取验证码
const WechatEmailCode = async () => {
  try {
    const account = wechatGather.value.account;
    let requestData = {};

    // 判断输入的是手机号还是邮箱
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\d{11}$/;

    if (emailRegex.test(account)) {
      requestData = { email: account, skip_code: skipCode.value  };
    } else if (phoneRegex.test(account)) {
      requestData = { user_mobile: account, skip_code: skipCode.value };
    } else {
      // 如果既不是手机号也不是邮箱，这里可能需要给出提示
      ElMessage.warning("请输入有效的邮箱或手机号");
      // console.error("请输入有效的邮箱或手机号");
      return;
    }
    const res = await postSendCode(requestData);
    console.log(res, 'res');
    if(res.status == 201) {
      image_url.value = res.data.image_url;
      image_hashKey.value = res.data.hashkey;
  
      centerDialogWechat.value = true;
    } else {
      ElMessage.success("已发送验证码，请及时查看");
      // numberValidateForm.verify_code = "";
      startCountdown();
    }
  } catch (error) {
    console.log(error, 'error');
    ElMessage.error("用户未注册");
  }
};

const startCountdown = () => {
  isButtonDisabled.value = true;
  buttonText.value = `${countdown.value}秒后重新发送`;

  const interval = setInterval(() => {
    countdown.value -= 1;
    buttonText.value = `${countdown.value}秒后重新发送`;

    if (countdown.value <= 0) {
      clearInterval(interval);
      isButtonDisabled.value = false;
      buttonText.value = '发送验证码';
      countdown.value = 60; // 重置倒计时
    }
  }, 1000);
};

// 验证码确定
const clickWechatCode = async () => {
  try {
    await verify_codeRef.value.validate(); // 等待表单验证完成
    const account = wechatGather.value.account;
    const hashkey = image_hashKey.value;
    const response = verify_code.value.code;
    let requestData = {};

    // 判断输入的是手机号还是邮箱
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\d{11}$/;

    if (emailRegex.test(account)) {
      requestData = { hashkey, response, email: account };
    } else if (phoneRegex.test(account)) {
      requestData = { hashkey, response, user_mobile: account };
    } else {
      // 如果既不是手机号也不是邮箱，这里可能需要给出提示
      ElMessage.warning("请输入有效的邮箱或手机号");
      // console.error("请输入有效的邮箱或手机号");
      return;
    }
    const res = await postSendCode(requestData);
    if (res.status === 200) {
      ElMessage.success("已发送验证码，请及时查看");
      // numberValidateForm.verify_code = "";
      startCountdown();
      centerDialogWechat.value = false;
    }

  } catch (error) {
    ElMessage.error(`${error.response.data.message}`);
  }
};

// 点击确认
const resetWechat = async () => {
  try {
    await wechatGatherRef.value.validate();
    const account = wechatGather.value.account;
    const user_data = userData.value;
    const verify_code = wechatGather.value.code;
    let requestData = {};

    // 判断输入的是手机号还是邮箱
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\d{11}$/;

    if (emailRegex.test(account)) {
      requestData = { email: account, user_data, verify_code };
    } else if (phoneRegex.test(account)) {
      requestData = { user_mobile: account, user_data, verify_code };
    } else {
      // 如果既不是手机号也不是邮箱，这里可能需要给出提示
      ElMessage.warning("请输入有效的邮箱或手机号");
      // console.error("请输入有效的邮箱或手机号");
      return;
    }
    const res = await WeChatLogin(requestData);
    if (res.status === 201) {
      // console.log('绑定过的');
      const userInfo = {
        user_id: res.data.user_id,
        username: res.data.username,
        email: res.data.email,
        avatar: res.data.avatar,
        nickname: res.data.nickname,
        wechat_username: res.data.wechat_username,
      };
      userStore.setUserInfo(userInfo);
      localStorage.setItem("user_id", Number(res.data.user_id));
      localStorage.setItem("access_token", res.data.access_token);
      localStorage.setItem("refresh_token", res.data.refresh_token);
      // 将用户名保存到本地存储中
      if (res.data.get_username === 'username') {
        localStorage.setItem("username", res.data.username);
      } else if (res.data.get_username === 'nickname') {
        localStorage.setItem("username", res.data.nickname);
      }
      ElMessage.success('已绑定成功');
      router.push({ name: "Chat" });
    }
  } catch (error) {
    console.log(error, 'error');
    ElMessage.warning(error.response.data.message);
  }
};

const goAgreement = () => {
  // mitt.emit("centerDialogAgreement");
  userAgreementRef.value.centerDialogAgreement = true;
};
const goPrivacy = () => {
  // mitt.emit("privacyDialogAgreement");
  privacyAgreementRef.value.privacyDialogAgreement = true;
};




// 点击取消的
const closeWechat = () => { };


//切换小程序
const miniProgramLogin = (card) => {
  currentCard.value = card;
};


</script>

<style lang="scss" scoped>
.container {
  margin: 0;
  padding: 0;
  display: flex;
  height: 100vh;
  background-image: url("../assets/dlbj.jpg");
  background-size: 100% 100%;
  overflow: hidden;
}

.product-intro {
  flex: 6;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  padding: 20px;
}

.product-slogan {
  margin-bottom: auto;
  margin-right: auto;
  /* margin-left: 20px; */
}

.demonstration {
  color: var(--el-text-color-secondary);
}

.carousel {
  transform: translate(0, -200px);
  width: 800px;
  /* height: 600px; */
}

.product-roadmap {
  display: flex;
  transform: translate(0, -150px);
}

.left-column,
.right-column {
  display: flex;
  flex-direction: column;
}

.left-column {
  margin-right: 80px;
  /* 调整左右列之间的间距 */
}

.text-icon .el-icon {
  margin-right: 10px;
  /* Add some space between the icon and the text */
}

.overlay-text {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  padding: 10px;
  background-color: rgba(0, 0, 0, 0.5);
  /* semi-transparent black */
  color: white;
  text-align: center;
}

.login-container {
  flex: 4;
  /* background-color: #fff; */
  /* background: linear-gradient(to right, transparent 50%, #fff 70%); */
  display: flex;
  /* flex-direction: column;
  justify-content: center;
  align-items: center; */
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
}

.login-card {
  width: 309px;
  height: fit-content;
  padding: 20px;
  padding-bottom: 0;
  border-radius: 20px;
  /* transform: translate(-100px, 0); */
  /* position: relative; */
  background-color: rgba(255, 255, 255, 0.5);
  position: relative;
}

.login-card2 {
  width: 338px;
  height: 430px;
  padding: 20px;
  border-radius: 20px;
  /* transform: translate(-100px, 0); */
  /* position: relative; */
  background-color: rgba(255, 255, 255, 0.5);
  position: relative;
}

.login-card3 {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 309px;
  height: 364px;
  padding: 20px;
  border-radius: 20px;
  /* transform: translate(-100px, 0); */
  /* position: relative; */
  background-color: #FFFFFF;
  position: relative;
}

.avatar-container {
  display: flex;
  justify-content: center;
}

.avatar {
  align-self: center;
  margin-bottom: 50px;
}

.login-title {
  text-align: center;
  margin-left: auto;
  margin-top: 30px;
  margin-right: 20px;
}

.login-button {
  width: 96%;
  height: 40px;
}

.register-button {
  width: 96%;
  height: 40px;
}

.find-password {
}

.wxlogo {
  width: 26px !important;
  height: 26px;
}

.mini_program {
  width: 26px !important;
  height: 26px;
}

.login-form {
  width: 100%;
  height: 100%;
}

.login-footer {
  text-align: top;
  margin-right: 10px;
  margin-left: auto;
  margin-bottom: 20px;
}

.wxButton {
  position: absolute;
  left: 12px;
  bottom: 4px;
}

:deep(.el-form-item__content) {
  margin-left: none !important;
}

.wechat-login-container {
  width: 300px;
  height: 300px;
}

.masking_login2 {
  width: 93px;
  height: 93px;
  /* background: red; */
  /* position: absolute;
  top: 180px;
  left: 98px; */
  display: flex;
  align-items: center;
  justify-content: center;
}

.masking_login3 {
  width: 280px;
  height: 280px;
  /* background: rgba(255, 0, 0, 0); */
  background: rgba(128, 128, 128, 98%);
  /* 透明灰色 */
  position: absolute;
  top: 88px;
  left: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
}

</style>
