<template>
  <div class="register">
    <!-- 注册 -->
    <el-drawer title="注册" v-model="drawerVisible" direction="rtl" size="380px">
      <el-tabs v-model="activeName" type="card" class="demo-tabs" @tab-change="changeTabs">
        <el-tab-pane label="邮箱注册" name="first">
          <el-form :model="registerForm" :rules="registerRules" ref="registerFormRef" label-width="80px">
            <!-- <el-form-item label="用户名" prop="username">
              <el-input v-model="registerForm.username"></el-input>
            </el-form-item> -->
            <!-- 注册邮箱 -->
            <el-form-item label="邮箱" prop="email">
              <el-input v-model="registerForm.email"> </el-input>
            </el-form-item>
            <el-form-item label="验证码" prop="verify_code">
              <el-input v-model="registerForm.verify_code" clearable>
                <template #append>
                  <el-button @click="getEmailCode">{{
      emailCodeSent
        ? `
                    已发送(${emailCountdownSeconds})`
        : "获取验证码"
    }}</el-button>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item label="用户名" prop="username">
              <el-input v-model="registerForm.username"></el-input>
            </el-form-item>
            <el-form-item label="密码" prop="password">
              <el-input type="password" v-model="registerForm.password"></el-input>
            </el-form-item>
            <!-- 再次确认密码 -->
            <el-form-item label="确认密码" prop="password2">
              <el-input type="password" v-model="registerForm.password2"></el-input>
            </el-form-item>
            <!-- <el-form-item label="昵称" prop="nickname">
              <el-input v-model="registerForm.nickname"></el-input>
            </el-form-item> -->
            <!-- <el-form-item label="验证码" prop="verify_code">
              <el-input v-model="registerForm.verify_code" type="text" clearable />
            </el-form-item> -->
            <!-- <el-form-item label="用户类别" prop="user_type">
              <el-radio-group v-model="registerForm.user_type">
                <el-radio label="human">人类</el-radio>
                <el-radio label="bot" disabled>AI</el-radio>
              </el-radio-group>
            </el-form-item> -->
            <el-form-item prop="agreement">
              <el-checkbox v-model="registerForm.agreement" size="large" style="margin-right: 5px" />
              <div>
                我已阅读并同意<a @click="goAgreement" style="color: #409eff; cursor: pointer">用户协议和</a>
                <a @click="goPrivacy" style="color: #409eff; cursor: pointer">隐私协议</a>
              </div>
            </el-form-item>

            <el-form-item class="register-footer">
              <el-button type="primary" @click="Register">确认提交</el-button>
              <el-button type="danger" @click="closeDrawer">取消</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="手机号注册" name="second">
          <el-form ref="formRef" :model="numberValidateForm" :rules="rules" label-width="80px" class="demo-ruleForm">
            <!-- <el-form-item label="用户名" prop="username">
              <el-input v-model="numberValidateForm.username" type="text" clearable />
            </el-form-item> -->
            <!-- 手机号  -->
            <el-form-item label="手机号" prop="user_mobile">
              <el-input v-model="numberValidateForm.user_mobile" type="text"></el-input>
            </el-form-item>
            <!-- 验证码 -->
            <el-form-item label="验证码" prop="phone_code">
              <el-input v-model="numberValidateForm.phone_code" clearable>
                <template #append>
                  <el-button @click="getMobileCode" :disabled="!numberValidateForm.user_mobile || mobileCodeSent
      ">{{
      mobileCodeSent
        ? ` 已发送(${mobileCountdownSeconds})`
        : "获取验证码"
    }}</el-button>
                </template>
              </el-input>
            </el-form-item>
            <!-- 用户名  -->
            <el-form-item label="用户名" prop="username">
              <el-input v-model="numberValidateForm.username" type="text" clearable />
            </el-form-item>
            <!-- 密码 -->
            <el-form-item label="密码" prop="password">
              <el-input v-model="numberValidateForm.password" type="password" clearable />
            </el-form-item>
            <el-form-item label="确认密码" prop="password2">
              <el-input v-model="numberValidateForm.password2" type="password" clearable />
            </el-form-item>

            <el-form-item prop="userAgreement">
              <el-checkbox v-model="numberValidateForm.userAgreement" size="large" style="margin-right: 5px" />
              <div>
                我已阅读并同意<a @click="goAgreement" style="color: #409eff; cursor: pointer">用户协议和</a>
                <a @click="goPrivacy" style="color: #409eff; cursor: pointer">隐私协议</a>
              </div>
            </el-form-item>
            <!-- 提交的 -->
            <el-form-item style="margin-top: 40px">
              <el-button type="primary" @click="submitInformation">确定提交</el-button>
              <el-button type="danger" @click="resetForm">取消</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-drawer>
    <!-- 找回密码 -->
    <el-drawer v-model="drawerVisible2" title="找回密码" direction="rtl" size="380px">
      <el-form :model="findPassword" :rules="findPasswordRules" ref="findPasswordRef" label-width="80px">
        <el-form-item label="输入账号" prop="account">
          <el-input v-model="findPassword.account" placeholder="请输入邮箱/手机号">

          </el-input>
        </el-form-item>

        <el-form-item label="验证码" prop="code">
          <el-input v-model="findPassword.code">
            <template #append>
              <el-button type="primary" @click="sendEmailCode" :disabled="!findPassword.account || isButtonDisabled">{{
      buttonText }}</el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="新密码" prop="new_password">
          <el-input type="password" v-model="findPassword.new_password"></el-input>
        </el-form-item>
        <el-form-item label="确认密码" prop="new_password2">
          <el-input type="password" v-model="findPassword.new_password2"></el-input>
        </el-form-item>
        <el-form-item class="register-footer">
          <el-button type="primary" @click="resetPassword">确认提交</el-button>
          <el-button type="danger" @click="closeDrawer2">取消</el-button>
        </el-form-item>
      </el-form>
    </el-drawer>
    <!-- 注册验证码弹窗 -->
    <el-dialog v-model="centerDialogVisible" :title="dialogTitle" width="400" center>
      <el-form ref="formRef" :model="numberValidateForm" :rules="rules" label-width="auto" class="demo-ruleForm">
        <el-form-item label="验证码" prop="verify_code">
          <div style="display: flex">
            <el-input v-model="numberValidateForm.verify_code" type="text" style="width: 150px" clearable>
            </el-input>
            <img class="code-img" style="object-fit: cover; margin-left: 5px" :src="URL + image_url" alt=""
              @click="refreshCode" />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="confirmVerificationCode">
            确定
          </el-button>
          <el-button @click="centerDialogVisible = false">取消</el-button>
        </div>
      </template>
    </el-dialog>
    <!-- 找回密码弹窗 -->
    <el-dialog v-model="centerDialogVisible2" title="验证码" width="400" center>
      <el-form ref="formRef" :model="numberValidateForm" :rules="rules" label-width="auto" class="demo-ruleForm">
        <el-form-item label="验证码" prop="verify_code">
          <div style="display: flex">
            <el-input v-model="numberValidateForm.verify_code" type="text" style="width: 150px" clearable>
            </el-input>
            <img class="code-img" style="object-fit: cover; margin-left: 5px" :src="URL + image_url" alt=""
              @click="sendEmailCode" />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="clickVerificationCode">
            确定
          </el-button>
          <el-button @click="centerDialogVisible2 = false">取消</el-button>
        </div>
      </template>
    </el-dialog>
    <!-- 用户协议弹窗 -->
    <userAgreement ref="userAgreementRef" :registerForm="registerForm" :numberValidateForm="numberValidateForm" />
    <!-- 隐私协议 -->
    <privacyAgreement ref="privacyAgreementRef" :registerForm="registerForm" :numberValidateForm="numberValidateForm" />
    <!-- 图形验证码 -->
    <sliderCaptcha ref="sliderCaptchaRef" 
      v-model="imgCodeVisible"
      :options="imgCodeOptions"
      :loading="imgCodeLoading"
      @check="imgCodeCheck"
      @close="imgCodeClose"
      @refresh="getSliderOptions"
      @error="getSliderOptions"/>
  </div>
</template>

<script setup>
import { ref, inject, reactive, onMounted, watch, computed } from "vue";
import api from "@/utils/request";
import { ElMessage } from "element-plus";
import {
  postRegister,
  postEmailCode,
  postVerifyEmail,
  postResetPassword,
  postSendCode,
  postSendCodeImage,
  postGetCode,
} from "@/api/mainActivity/Register";
import userAgreement from "./agreementDrawer/userAgreement.vue";
import privacyAgreement from "./agreementDrawer/privacyAgreement.vue";
import memberSubscription from "./agreementDrawer/memberSubscription.vue";
import virtualCurrencyAgreement from "./agreementDrawer/virtualCurrencyAgreement.vue";
import { baseURL } from "@/utils/request";
import { useMitt } from "../utils/mitt";

const mitt = useMitt();

const isProd = computed(() => {
    return window.VITE_NODE_ENV != 'development' && window.VITE_NODE_ENV != 'testing'
})

const activeName = ref("first");

const image_url = ref("");
const image_hashKey = ref("");
let URL = ref(localStorage.getItem("baseURL"));
if(isProd.value) {
    URL.value = "https://api.mindcraft.com.cn/"
}
const codeType = ref(""); // 'email' 或 'mobile'

watch(
  () => baseURL.value,
  (val) => {
    URL.value = val;
  },
  { deep: true }
);

const countdownSeconds = ref(0); // 倒计时剩余秒数
const emailCodeSent = ref(false);
const emailCountdownSeconds = ref(0);
const mobileCodeSent = ref(false);
const mobileCountdownSeconds = ref(0);

const centerDialogVisible2 = ref(false);

const userAgreementRef = ref(null);
const privacyAgreementRef = ref(null);

const registerForm = ref({
  username: "",
  password: "",
  password2: "",
  nickname: "",
  user_type: "",
  email: "",
  email_code: "",
  agreement: false,
});

const registerRules = reactive({
  username: [
    { required: true, message: "请输入用户名", trigger: "blur" },
    { min: 2, max: 20, message: "长度在 2 到 20 个字符", trigger: "blur" },
  ],
  password: [
    { required: true, message: "请输入密码", trigger: "blur" },
    { min: 6, max: 20, message: "长度在 6 到 20 个字符", trigger: "blur" },
  ],
  password2: [
    { required: true, message: "请再次输入密码", trigger: "blur" },
    { min: 6, max: 20, message: "长度在 6 到 20 个字符", trigger: "blur" },
    { validator: validatePassword, trigger: "blur" },
  ],
  email: [
    { required: true, message: "请输入邮箱", trigger: "blur" },
    { type: "email", message: "请输入正确的邮箱地址", trigger: "blur" },
  ],
  user_type: [{ required: true, message: "请选择类别", trigger: "blur" }],
  verify_code: [{ required: true, message: "请输入验证码", trigger: "blur" }],
  agreement: [
    { required: true, message: "请阅读用户协议" },
    {
      validator: (rule, value, callback) => {
        if (value) {
          console.log(value, "value");
          callback(); // 如果value为true，即复选框被勾选，验证通过
        } else {
          console.log(value, "value");
          callback(new Error("请阅读并同意用户协议"));
        }
      },
      trigger: "change",
    },
  ],
});
function validatePassword(rule, value, callback) {
  if (value !== registerForm.value.password) {
    callback(new Error("两次输入的密码不一致"));
  } else {
    callback();
  }
}
// 注册表单的引用
const registerFormRef = ref(null);

// 注册表单的提交
const Register = () => {
  // 首先进行表单验证
  registerFormRef.value.validate(async (valid) => {
    if (valid) {
      // // 如果验证通过，就提交表单
      // api.post('llm/register/', registerForm.value)
      //   .then(response => {
      //     // 注册成功后的处理逻辑
      //     console.log(response);
      //     if (response.status === 200) {
      //       // 弹出提示
      //       ElMessage.success(response.data.message);
      //       // 关闭drawer
      //       drawerVisible.value = false;
      //     } else {
      //       // 弹出提示
      //       ElMessage.error(response.data.message);
      //     }
      //   })
      //   .catch(error => {
      //     console.error('注册请求出错', error);
      //     //弹出提示
      //     ElMessage.error(error.response.data.message);
      //   });

      try {
        await postRegister(registerForm.value);
        //弹出提示
        ElMessage.success("注册成功");
        //清空
        registerForm.value = {};

        //清除定时器
        // clearInterval(emailCountdownTimer);
        emailCodeSent.value = false;
        emailCountdownSeconds.value = 0;

        // 关闭drawer
        drawerVisible.value = false;
      } catch (error) {
        console.error("注册请求出错", error);
        ElMessage.warning(error.response.data.message);
        //弹出提示
        ElMessage.warning("注册失败");
      }
    } else {
      // 如果验证不通过，就返回，不提交表单
      ElMessage.warning("请检查表单内容是否正确");
      return false;
    }
  });
};

//找回密码表单
const findPassword = ref({
  code: "",
  new_password: "",
  new_password2: "",
  account: "",
});
//找回密码规则
const findPasswordRules = reactive({
  new_password: [
    { required: true, message: "请输入密码", trigger: "blur" },
    { min: 6, max: 20, message: "长度在 6 到 20 个字符", trigger: "blur" },
  ],
  new_password2: [
    { required: true, message: "请再次输入密码", trigger: "blur" },
    { min: 6, max: 20, message: "长度在 6 到 20 个字符", trigger: "blur" },
    { validator: validateNewPassword, trigger: "blur" },
  ],
  account: [
    { required: true, message: "请输入邮箱/手机", trigger: "blur" },
    { validator: validateAccount, trigger: "blur" },
  ],
  code: [{ required: true, message: "请输入验证码", trigger: "blur" }],
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

//验证新密码
function validateNewPassword(rule, value, callback) {
  if (value !== findPassword.value.new_password) {
    callback(new Error("两次输入的密码不一致"));
  } else {
    callback();
  }
}
//验证邮箱是否已验证
const emailVerified = ref(false);
//发送验证码，api访问相对路径，llm/send_email_code/

const sendEmailCode = async () => {
  try {
    const account = findPassword.value.account;
    let requestData = {};

    // 判断输入的是手机号还是邮箱
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\d{11}$/;

    if (emailRegex.test(account)) {
      requestData = { has_user: true, email: account };
    } else if (phoneRegex.test(account)) {
      requestData = { has_user: true, user_mobile: account };
    } else {
      // 如果既不是手机号也不是邮箱，这里可能需要给出提示
      console.error("请输入有效的邮箱或手机号");
      return;
    }
    // const res = await postSendCode(requestData);
    // image_url.value = res.data.image_url;
    // image_hashKey.value = res.data.hashkey;
    // console.log(findPassword.value);
    // // 点击打开弹窗验证码
    // centerDialogVisible2.value = true;
    await getSendCodeImage(requestData);
  } catch (error) {
    ElMessage.error("用户未注册");
  }
};

//验证邮箱验证码
const verifyEmailCode = async () => {
  try {
    // console.log('请求验证邮箱验证码');
    // const response = await api.post('llm/verify_email_code/', {
    //   email: findPassword.value.email,
    //   code: findPassword.value.code,
    // });
    const response = await postVerifyEmail({
      email: findPassword.value.email,
      code: findPassword.value.code,
    });
    if (response.status === 200) {
      ElMessage.success(response.data.message);
      // console.log('邮箱验证码验证成功');
      emailVerified.value = true;
    } else {
      ElMessage.error(response.data.message);
      // console.error('邮箱验证码验证失败', response.data);
    }
  } catch (error) {
    // console.error('邮箱验证码验证请求出错', error);
    ElMessage.error(error.response.data.message);
  }
};
//找回密码表单的引用
const findPasswordRef = ref(null);
//找回密码表单的提交
const resetPassword = () => {
  // 首先进行表单验证
  findPasswordRef.value.validate(async (valid) => {
    if (valid) {
      try {
        const account = findPassword.value.account;
        const new_password = findPassword.value.new_password;
        const new_password_agin = findPassword.value.new_password2;
        const verify_code = findPassword.value.code;
        let requestData = {};

        // 判断输入的是手机号还是邮箱
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const phoneRegex = /^\d{11}$/;

        if (emailRegex.test(account)) {
          requestData = {
            verify_code,
            new_password,
            new_password_agin,
            email: account,
          };
        } else if (phoneRegex.test(account)) {
          requestData = {
            verify_code,
            new_password,
            new_password_agin,
            user_mobile: account,
          };
        } else {
          // 如果既不是手机号也不是邮箱，这里可能需要给出提示
          console.error("请输入有效的邮箱或手机号");
          return;
        }

        await postResetPassword(requestData);
        //弹出提示
        ElMessage.success("找回密码成功");
        // 清空
        findPassword.value = "";
        // 关闭drawer
        drawerVisible2.value = false;
      } catch (error) {
        ElMessage.error("找回密码失败");
        console.log(error);
      }
    } else {
      // 如果验证不通过，就返回，不提交表单
      console.error("找回密码表单验证失败");
      ElMessage.warning("请检查表单内容是否正确");
      return false;
    }
  });
};

const drawerVisible = inject("drawerVisible");
const drawerVisible2 = inject("drawerVisible2");

const closeDrawer = () => {
  drawerVisible.value = false;
};
const closeDrawer2 = () => {
  drawerVisible2.value = false;
};

/*手机验证***************************************************************************************************************************** */

const formRef = ref(); //实例
const centerDialogVisible = ref(false);

// 手机表单的数据
const numberValidateForm = reactive({
  user_mobile: "", // 手机号
  password: "", // 密码
  password2: "", // 密码2
  username: "", //用户名
  phone_code: "", //验证码
  verify_code: "", //手机验证码
  userAgreement: false, //用户协议
});

// 校验
const rules = reactive({
  username: [
    { required: true, message: "请输入用户名", trigger: "blur" },
    { min: 2, max: 20, message: "长度在 2 到 20 个字符", trigger: "blur" },
  ],
  user_mobile: [
    { required: true, message: "请输入手机号", trigger: "blur" },
    {
      pattern: /^1[3456789]\d{9}$/,
      message: "手机号格式不正确",
      trigger: "blur",
    },
  ],
  password: [
    { required: true, message: "请输入密码", trigger: "blur" },
    { min: 6, max: 20, message: "长度在 6 到 20 个字符", trigger: "blur" },
  ],
  password2: [
    { required: true, message: "请再次输入密码", trigger: "blur" },
    { min: 6, max: 20, message: "长度在 6 到 20 个字符", trigger: "blur" },
    { validator: validatePasswords, trigger: "blur" },
  ],
  verify_code: [{ required: true, message: "请输入验证码", trigger: "blur" }],
  phone_code: [{ required: true, message: "请输入验证码", trigger: "blur" }],
  userAgreement: [
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

function validatePasswords(rule, value, callback) {
  if (value !== numberValidateForm.password) {
    callback(new Error("两次输入的密码不一致"));
  } else {
    callback();
  }
}

const user_type = ref("");
// 获取验证码
const refreshCode = () => {
  getCode(codeType.value);
};
const getEmailCode = async () => {
  codeType.value = "email";
  await getCode("email");
};
const getMobileCode = async () => {
  codeType.value = "mobile";
  await getCode("mobile");
};
const codeParam = ref({})
const getCode = async (type) => {
  try {
    codeParam.value = {};
    let key = "";
    if (type === "email") {
      key = registerForm.value.email;
      codeParam.value = { email: key, has_user: false };
      user_type.value = "email";
    } else if (type === "mobile") {
      key = String(numberValidateForm.user_mobile);
      codeParam.value = { user_mobile: key, has_user: false };
      user_type.value = "mobile";
    }
    if(!key) {
      return
    }

    // const res = await postSendCode(codeParam.value);
    // image_url.value = res.data.image_url;
    // image_hashKey.value = res.data.hashkey;
    // // 点击打开弹窗验证码
    // centerDialogVisible.value = true;

    await getSendCodeImage(codeParam.value)
  } catch (error) {
    ElMessage.error(`${error.response.data.message}`);
  }
};
import sliderCaptcha from "./sliderCaptcha/kkokk-slider-captcha.vue"
const imgCodeVisible = ref(false)
const imgCodeLoading = ref(false)
const imgCodeOptions = ref({
  sliderImg: "",
  sliderImgDraw: "",
  sliderKey: "",
  sliderY: 0
})
const getSendCodeImage = async (requestData) => {
  const res = await postSendCodeImage(requestData);
  imgCodeOptions.value = {
    sliderImg: res.data.image_modified,
    sliderImgDraw: res.data.image_square,
    sliderKey: res.data.hashkey,
    sliderY: res.data.sliderY
  }
  imgCodeVisible.value = true
}
const imgCodeCheck = (sliderKey, sliderX, sucCb, errCb) => {
  imgCodeLoading.value = true
  if(drawerVisible.value) {
    confirmVerificationCode(sliderX, sucCb, errCb)
  } else if(drawerVisible2.value) {
    clickVerificationCode(sliderX, sucCb, errCb)
  }
}
const imgCodeClose = () => {
  console.log('imgCodeClose');
}
const getSliderOptions = () => {
  if(drawerVisible.value) {
    getSendCodeImage(codeParam.value)
  } else if(drawerVisible2.value) {
    sendEmailCode(codeParam.value)
  }
}

// 弹窗title
const dialogTitle = computed(() => {
  // 这里判断如果 codeType.value 是 email 就显示邮箱
  // 如果是mobile 那就是  手机
  return codeType.value === 'email' ? '请验证以获邮箱验证码' : '请验证以获手机验证码';
})


// 弹窗邮箱或者手机 确认
const confirmVerificationCode = async (sliderX, sucCb, errCb) => {
  try {
    await formRef.value.validate(); // 等待表单验证完成
  } catch (error) {
  }
  try {

    const email = registerForm.value.email; //邮箱
    const user_mobile = String(numberValidateForm.user_mobile); //手机号

    // const hashkey = image_hashKey.value;
    // const response = numberValidateForm.verify_code;
    const hashkey = imgCodeOptions.value.sliderKey;
    const sliderY = imgCodeOptions.value.sliderY;
    const has_user = false;

    let res;
    if (email) {
      // res = await postSendCode({ email, hashkey, response, has_user });
      res = await postSendCodeImage({ email, hashkey, sliderY, sliderX, has_user });
    } else if (user_mobile) {
      // res = await postSendCode({ user_mobile, hashkey, response, has_user });
      res = await postSendCodeImage({ user_mobile, hashkey, sliderY, sliderX, has_user });
    } else {
      throw new Error("请输入邮箱或手机号");
    }
    // const res =  await postSendCode({user_mobile,hashkey,response,has_user,email});
    // console.log(res.data,'54654');
    // console.log(res);
    imgCodeLoading.value = false
    if (res.status === 200) {
      sucCb()
      ElMessage.success("已发送验证码，请及时查看");
      // numberValidateForm.verify_code = ""; //清空
      // centerDialogVisible.value = false;
      imgCodeVisible.value = false

      // 开始倒计时
      if (user_type.value === "email") {
        emailCodeSent.value = true;
        startCountdown("email");
      } else if (user_type.value === "mobile") {
        mobileCodeSent.value = true;
        startCountdown("mobile");
      }
    } else {
      errCb()
    }
  } catch (error) {
    if(imgCodeVisible.value) {
      errCb()
      imgCodeLoading.value = false
    }
    console.log(error);
    ElMessage.error(`${error.response.data.message}`);
  }
};

// 修改startCountdown函数，接收一个type参数
const startCountdown = (type) => {
  let countdownSeconds =
    type === "email" ? emailCountdownSeconds : mobileCountdownSeconds;
  countdownSeconds.value = 60; // 五分钟
  const countdownTimer = setInterval(() => {
    countdownSeconds.value--;
    if (countdownSeconds.value <= 0) {
      clearInterval(countdownTimer);
      if (type === "email") {
        emailCodeSent.value = false;
      } else if (type === "mobile") {
        mobileCodeSent.value = false;
      }
    }
  }, 1000);
};

// 确定按钮
const submitInformation = async () => {
  console.log(numberValidateForm);
  await formRef.value.validate(async (valid) => {
    if (valid) {
      try {
        const username = numberValidateForm.username;
        const password = numberValidateForm.password;
        const user_mobile = String(numberValidateForm.user_mobile);
        const verify_code = numberValidateForm.phone_code;
        console.log(numberValidateForm);

        const res = await postRegister({
          username,
          password,
          user_mobile,
          verify_code,
        });
        if (res.status === 200) {
          ElMessage.success("注册成功");
          // formRef.value.resetField();
          // 清空
          Object.keys(numberValidateForm).forEach((key) => {
            numberValidateForm[key] = ""; // 或者设置为其他初始值
          });

          // 清除定时器
          // clearInterval(mobileCountdownTimer);
          mobileCodeSent.value = false;
          mobileCountdownSeconds.value = 0;

          drawerVisible.value = false;
        }
      } catch (error) {
        console.log(error);
        ElMessage.error(`${error.response.data.message}`);
      }
    } else {
      ElMessage.warning("请检查表单内容是否正确");
      return false;
    }
  });
};

// 取消的
const resetForm = () => {
  formRef.value.resetFields();
};

const isButtonDisabled = ref(false);
const buttonText = ref('发送验证码');
const countdown = ref(60);

// 找回密码
const clickVerificationCode = async (sliderX, sucCb, errCb) => {
  try {
    await formRef.value.validate(); // 等待表单验证完成
  } catch (error) {
  }
  try {
    const account = findPassword.value.account;
    // const hashkey = image_hashKey.value;
    // const response = numberValidateForm.verify_code;
    const hashkey = imgCodeOptions.value.sliderKey;
    const sliderY = imgCodeOptions.value.sliderY;
    let requestData = {};

    // 判断输入的是手机号还是邮箱
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\d{11}$/;

    if (emailRegex.test(account)) {
      // requestData = { has_user: true, hashkey, response, email: account };
      requestData = { has_user: true, hashkey,  sliderY, sliderX, email: account };
    } else if (phoneRegex.test(account)) {
      // requestData = { has_user: true, hashkey, response, user_mobile: account };
      requestData = { has_user: true, hashkey,  sliderY, sliderX, user_mobile: account };
    } else {
      // 如果既不是手机号也不是邮箱，这里可能需要给出提示
      console.error("请输入有效的邮箱或手机号");
      return;
    }
    // const res = await postSendCode(requestData);
    const res = await postSendCodeImage(requestData);
    imgCodeLoading.value = false
    if (res.status === 200) {
      sucCb()
      ElMessage.success("已发送验证码，请及时查看");
      // numberValidateForm.verify_code = "";
      startCountdowns();
      // centerDialogVisible2.value = false;
      imgCodeVisible.value = false
    } else {
      errCb()
    }
  } catch (error) {
    if(imgCodeVisible.value) {
      errCb()
      imgCodeLoading.value = false
    }
    ElMessage.error(`${error.response.data.message}`);
    console.log(12132);
  }
};


const startCountdowns = () => {
  isButtonDisabled.value = true;
  buttonText.value = `${countdown.value}已发送`;

  const interval = setInterval(() => {
    countdown.value -= 1;
    buttonText.value = `${countdown.value}已发送`;

    if (countdown.value <= 0) {
      clearInterval(interval);
      isButtonDisabled.value = false;
      buttonText.value = '发送验证码';
      countdown.value = 60; // 重置倒计时
    }
  }, 1000);
};

// 打开用户协议
const goAgreement = () => {
  // mitt.emit("centerDialogAgreement");
  userAgreementRef.value.centerDialogAgreement = true;
};

const goPrivacy = () => {
  // mitt.emit("privacyDialogAgreement");
  privacyAgreementRef.value.privacyDialogAgreement = true;
};

const changeTabs = () => {
  // console.log(132);
  registerForm.value = {};
  // numberValidateForm.value = {};
  Object.keys(numberValidateForm).forEach((key) => {
    if (key !== "userAgreement") {
      numberValidateForm[key] = ""; // 清空字段
    }
  });
  // console.log(registerForm.value);
  // console.log(numberValidateForm.value);
};


</script>

<style scoped>
.register {
  max-width: 400px;
  margin: 0 auto;
  margin-top: 100px;
}

.register-footer {
  margin-top: 30px;
}

.email-verify {
  margin-top: 10px;
}

:deep(.el-input-group__append) {
  width: 40px;
}
</style>
