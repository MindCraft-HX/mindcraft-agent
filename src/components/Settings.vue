<template>
  <div class="settings">
    <el-drawer title="设置" v-model="settingsDrawer" direction="rtl" size="50%" :before-close="handleDrawerClose" @open="openSettingsDrawer">
      <el-tabs type="card" v-model="activeSetting">
        <!-- 用户中心 -->
        <el-tab-pane label="用户中心" name="userprofile">
          <!-- 头像 -->
          <el-avatar :size="80" :src="ruleForm.avatar" style="margin-top: 20px"  shape="square" />
          <!-- 表单 -->
          <el-form ref="formRef" :model="ruleForm" label-width="150px" class="demo-ruleForm" :rules="rules">
            <!-- 上传 -->
            <input type="file" ref="fileInput" @change="handleFileChange" style="display: none" accept="image/*" />
            <el-button @click="$refs.fileInput.click()" style="margin: 10px 0px">
              选择头像
            </el-button>
            <el-row :gutter="20">
              <el-col :span="20">
                <el-form-item label="用户名:" prop="userName">
                  <!-- <el-input v-model.number="ruleForm.wechat_username" type="text" /> -->
                  <div style="white-space: nowrap;overflow: hidden;text-overflow: ellipsis;display: inline;">{{ ruleForm.username }}</div>
                </el-form-item>
              </el-col>
              <el-col :span="20">
                <el-form-item label="邮箱:" prop="email">
                  <!-- <el-input v-model="ruleForm.email" type="text" /> -->
                  <div>{{ ruleForm.email }}</div>
                </el-form-item>
              </el-col>
              <el-col :span="20">
                <el-form-item label="手机号:" prop="cell_phone">
                  <!-- <el-input v-model.number="ruleForm.user_mobile" type="text" /> -->
                <div>{{ ruleForm.user_mobile }}</div>
                 </el-form-item>
              </el-col>
              <el-col :span="20">
                <el-form-item label="微信:" prop="cell_phone">
                  <!-- <el-input v-model.number="ruleForm.user_mobile" type="text" /> -->
                <div>{{ ruleForm.wechat_username }}</div>
                <el-button style="margin-left: 15px;" type="primary" @click="bindWechat" size="small">绑定微信</el-button>
                 </el-form-item>
              </el-col>
              <el-col :span="20">
                <el-form-item label="昵称:" prop="nickname">
                  <el-input v-model="ruleForm.nickname" type="text" />
                </el-form-item>
              </el-col>

            </el-row>
            <!-- 积分卡 -->
            <div class="pointCard" style="">
              <div class="pointCard-box">
                <div :class="buttonClass"></div>
                <div style="font-size: 17px; color: #000306">当前剩余积分</div>
                <div style="font-size: 50px; color: #429ff5; font-weight: 600">
                  {{user_information.points}}
                </div>
                <div style="font-size: 12px;">到期时间：{{user_information.vip_expire}}</div>
                <div style="font-size: 12px; color: #5e666d">
                  <!-- 已使用：200,000,00 -->
                </div>
                <div>
                  <el-button type="primary" style="width: 150px" @click="openPointCard">充值</el-button>
                </div>
              </div>
              <!-- <div
                style="width: 200px; height: 100px; background: #88ccf5"
              ></div> -->
            </div>
            <!-- 按钮 -->
            <el-form-item>
              <el-button type="primary" @click="submitForms(formRef)">保存</el-button>
              <el-button @click="resetForm(formRef)">取消</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
        <!-- 企业中心 -->
        <!-- <el-tab-pane label="企业中心" name="enterprise">
          <el-tabs v-model="enterpriseSetting" tab-position="left">
            <el-tab-pane label="我的企业" name="my_enterprise">
              <el-table :data="enterpriseList" border style="width: 100%" :row-key="(row) => row.id">
                <el-table-column prop="name" label="企业名称" />
                <el-table-column prop="creator" label="创建人" />
                <el-table-column label="操作">
                  <template #default="{ row }">
                    <el-button type="primary" size="small" icon="Edit" @click="openEditDialog(row)" />
                    <el-button type="danger" size="small" icon="Delete" @click="deleteEnterprise(row)" />
                  </template>
                </el-table-column>
              </el-table>
            </el-tab-pane>
            <el-tab-pane label="添加企业" name="add_enterprise">
              <el-form :model="enterpriseForm" :rules="enterpriseRules" label-width="100px"
                style="max-width: 400px; margin: 0 auto">
                <el-form-item label="企业名称" prop="name">
                  <el-input v-model="enterpriseForm.name"></el-input>
                </el-form-item>
                <el-form-item label="企业简介" prop="introduction">
                  <el-input type="textarea" v-model="enterpriseForm.introduction"></el-input>
                </el-form-item>
                <el-form-item label="企业邮箱" prop="email">
                  <el-input v-model="enterpriseForm.email"></el-input>
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" @click="submitForm()">创建企业</el-button>
                </el-form-item>
              </el-form>
            </el-tab-pane>
          </el-tabs>
        </el-tab-pane> -->
        <!-- 通用 -->
        <!-- <el-tab-pane label="通用" name="settings">
          <div class="llm_service">
            <el-text tag="b">选择LLM服务</el-text>
            <br />
            <el-select v-model="llm_service" placeholder="LLM服务选择">
              <el-option v-for="item in llm_models" :key="item.value" :label="item.label" :value="item.value"
                :disabled="item.disabled">
              </el-option>
            </el-select>
          </div>
          <br />
          <el-form v-if="llm_service === 'openai'" class="settings-form" :model="settingsForm" :rules="settingsRules"
            label-position="top">
            <el-form-item label="OpenAI API Key" prop="openai_api_key">
              <el-input v-model="settingsForm.openai_api_key"></el-input>
            </el-form-item>
            <el-form-item label="OpenAI API Base" prop="openai_api_base">
              <el-checkbox v-model="enableAPIBASE" label="自定义API_BASE" />
              <el-input v-model="settingsForm.openai_api_base" :disabled="!enableAPIBASE"></el-input>
            </el-form-item>
          </el-form>
          <div class="settings-footer">
            <el-button type="primary" @click="saveSettings">保存</el-button>
            <el-button type="danger" @click="closeDrawer">取消</el-button>
          </div>
        </el-tab-pane> -->
        <!-- 用户反馈 -->
        <el-tab-pane label="用户反馈" name="userfeedback">
          <!-- 企业微信 -->
          <el-row :gutter="20">
            <el-col :span="6" :offset="4">
              <div style="width: 156px; height: 156px; border-radius: 20px" class="img-service"></div>
            </el-col>
            <el-col :span="10" :offset="4" style="margin: auto">
              <div style="line-height: normal; text-align: justify">
                <div style="color: #414141">企业微信客服</div>
                <div style="font-size: 12px; color: #8b8b8b">
                  客服及项目咨询
                </div>
              </div>
            </el-col>
          </el-row>
          <!-- qq -->
          <!-- <el-row :gutter="20" style="margin-top: 30px">
            <el-col :span="6" :offset="4">
              <div
                style="
                  width: 156px;
                  height: 156px;
                  border-radius: 20px;
                "
                class="img-QQ"
              >
              </div>
            </el-col>
            <el-col
              :span="10"
              :offset="4"
              style="margin: auto; text-align: justify"
            >
              <div style="line-height: normal">
                <div style="color: #414141">GT-HMI技术交流社群</div>
                <div style="font-size: 12px; color: #8b8b8b">
                  官方技术支持,技术资料齐全
                </div>
                <div style="color: #414141">搜索QQ频道号:g520slerr2</div>
                <div style="color: #59a6f6">
                  点击进入<a href="https://qun.qq.com" style="color: #59a6f6"
                    >https://qun.qq.com</a
                  >
                </div>
              </div>
            </el-col>
          </el-row> -->
          <!-- 详细信息 -->
          <el-row :gutter="20" style="
              line-height: normal;
              text-align: justify;
              margin: 54px 0 10px 0px;
              color: #000000;
            ">
            <el-col :span="6" :offset="4">
              <div style="margin-left: 39px; padding-bottom: 10px">
                联系电话:
              </div>
            </el-col>
            <el-col :span="14">
              <div>0755-83453881-8021/83453855/26998913</div>
            </el-col>
            <el-col :span="6" :offset="4">
              <div style="
                  margin-left: 71px;
                  padding-bottom: 10px;
                  margin-top: 20px;
                ">
                邮箱:
              </div>
            </el-col>
            <el-col :span="14">
              <!-- <div>sales@genitop.com</div> -->
              <el-link type="primary" style="margin-top: 20px" @click="openEmail">sales@genitop.com</el-link>
            </el-col>
            <!-- <el-col :span="6" :offset="4">
              <div style="margin-left: 71px; padding-bottom: 10px">地址:</div>
            </el-col>
            <el-col :span="14">
              <div>
                广东省深圳市福田区沙头街道深南大道与泰然九路交界东南金润大厦12C
              </div>
            </el-col> -->
            <!-- <el-col :span="6" :offset="4">
              <div style="margin-left: 71px; padding-bottom: 10px">网址:</div>
            </el-col> -->
            <!-- <el-col :span="14">
              <div
                style="
                  white-space: nowrap;
                  text-overflow: ellipsis;
                  overflow: hidden;
                "
              >
                <a
                  style="color: #59a6f6"
                  href="https://qun.qq.com/qqweb/qunpro/share?_wv=3&_wwv=128&appChannel=share&inviteCode=20igkt2UZnY&businessType=9&from=181074&biz=ka&mainSourceId=share&subSourceId=others&jumpsource=shorturl#/pc"
                  >点击进入https://qun.qq.com/qqweb/qunpro/share?_wv=3&_wwv=128&appChannel=share&inviteCode=20igkt2UZnY&businessType=9&from=181074&biz=ka&mainSourceId=share&subSourceId=others&jumpsource=shorturl#/pc</a
                >
              </div>
            </el-col> -->
          </el-row>
        </el-tab-pane>
        <el-tab-pane label="设置" name="settings">
          <el-row :gutter="20">
            <el-col :span="6" :offset="4" style="display: flex;align-items: center;">
              开机启动
            </el-col>
            <el-col :span="10" :offset="4" class="setting-right">
              <el-switch v-model="loginStart" @change="setLoginItemSettings"/>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="6" :offset="4" class="setting-label">
              <span>安全模式</span>
              <el-tooltip content="开启后，进入编程智能体时不自动恢复旧会话，可避免异常历史导致卡死。" placement="top">
                <span class="setting-help">?</span>
              </el-tooltip>
            </el-col>
            <el-col :span="10" :offset="4" class="setting-right">
              <el-switch v-model="codexSafeModeEnabled" @change="setCodexSafeModeEnabled"/>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="6" :offset="4" style="display: flex;align-items: center;">
              浮窗启动
            </el-col>
            <el-col :span="10" :offset="4" class="setting-right">
              <el-switch v-model="canOpenSideFloatWin" @change="setCanOpenHoverWin"/>
            </el-col>
          </el-row>
          <el-row :gutter="20" v-if="isWIN">
            <el-col :span="6" :offset="4" style="display: flex;align-items: center;">
              截图启动
            </el-col>
            <el-col :span="10" :offset="4" class="setting-right">
              <el-switch v-model="canOpenScreenShotWin" @change="setcanOpenScreenShotWin"/>
            </el-col>
          </el-row>
          <el-row :gutter="20" v-if="isWIN">
            <el-col :span="6" :offset="4" style="display: flex;align-items: center;">
              截图快捷键
            </el-col>
            <el-col :span="10" :offset="4" class="setting-right">
              <el-button size="small" style="font-size: 12px;cursor: pointer;" @click="openSetScreenShotWinSet" v-if="!showScreenShotWinSet">{{ hotKeyScreenShotWin }}</el-button>
              <template v-else>
                <div style="display: flex;align-items: center;">
                  <el-select size="small" v-model="keydownScreenShotList[0]">
                    <el-option v-for="item in modifierSelectList" :key="item.value" :label="item.label" :value="item.value" />
                  </el-select>
                  +
                  <el-input style="max-width: 90px;" size="small" v-model="keydownScreenShotListKeyCom" @keydown="handleKeyDownScreenShotWin"></el-input>
                  <el-button style="width: 30px;" size="small" icon="check" @click="saveSetScreenShotWin"></el-button>
                </div>
              </template>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="6" :offset="4" style="display: flex;align-items: center;">
              默认模型
            </el-col>
            <el-col :span="10" :offset="4" class="setting-right">
              <el-popover
                :width="'60vw'"
                trigger="click"
                @show="openPublicDefaultModel"
                ref="publicModelListPopoverRef"
              >
                <template #reference>
                  <el-button text bg size="small"><el-image style="height:calc(var(--el-button-size) 
                  * 0.8);margin-right: 5px;" fit="contain" :src="modelImage(publicDefaultModel)" v-if="publicDefaultModel"></el-image>{{publicDefaultModel|| "点击选择模型"}}</el-button>
                </template>
                <modelListMenu ref="publicModelListMenuRef" v-model:modelName="publicDefaultModel" v-model:modelList="modelList" @changeModel="setPublicDefaultModel"></modelListMenu>
              </el-popover>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="6" :offset="4" style="display: flex;align-items: center;">
              默认识图模型
            </el-col>
            <el-col :span="10" :offset="4" class="setting-right">
              <el-popover
                :width="'60vw'"
                trigger="click"
                @show="openPicDefaultModel"
                ref="picModelListPopoverRef"
              >
                <template #reference>
                  <el-button text bg size="small"><el-image style="height: calc(var(--el-button-size) 
                  * 0.8);margin-right: 5px;" fit="contain" :src="modelImage(picDeafultModel)" v-if="picDeafultModel"></el-image>{{picDeafultModel|| "点击选择模型"}}</el-button>
                </template>
                <modelListMenu ref="picModelListMenuRef" filterAtr="image_recognition" v-model:modelName="picDeafultModel" v-model:modelList="modelList"  @changeModel="setPicDefaultModel"></modelListMenu>
              </el-popover>
            </el-col>
          </el-row>
          <el-row :gutter="20" style="margin-top: 12px;">
            <el-col :span="20" :offset="4" style="margin: auto">
              <el-badge style="margin: 0 10px;" :is-dot="isUpdateAvailable">
                <el-button  @click="checkForUpdate" type=""><el-icon><UploadFilled /></el-icon>检查更新</el-button>
              </el-badge>
              <el-button style="margin: 0 10px;" type="danger" @click="logout">退出登录</el-button>
            </el-col>
          </el-row>
        </el-tab-pane>
      </el-tabs>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, inject, reactive, watch, onMounted, toRefs ,nextTick, computed} from "vue";
import api from "@/utils/request";
import { ElMessage, ElMessageBox } from "element-plus";
import axios from "axios";
import { useMitt } from "../utils/mitt";
import { userInformation } from "../stores/userInformation";
import { getUserProfileNew,postLlmBindWeb, postUploadAvatar,postModifyUserProfile } from '@/api/mainActivity/settings';


const mitt = useMitt();
const userStore = userInformation();

const settingsDrawer = inject("settingsDrawer");
const activeSetting = inject("activeSetting");
const enterpriseSetting = ref("my_enterprise");
const user_information = ref([]);

onMounted(async () => {
  // getEnterpriseList();
  // nextTick(async()=>{
  //   await userList();
  // });
});

// 打开弹窗
const openSettingsDrawer = async()=>{
  await userList();
  getLoginItemSettings()
  getCodexSafeModeEnabled()
  getCanOpenHoverWin()
  if(isWIN.value) {
    getcanOpenScreenShotWin()
  }
  getUpdateStatus()

  getModelList()
  getPublicDefaultModel()
  getPicDeafultModel()
};


//企业表单
const enterpriseForm = reactive({
  name: "",
  introduction: "",
  email: "",
  creator: localStorage.getItem("username"),
});
//企业表单验证
const enterpriseRules = ref({
  name: [{ required: true, message: "请输入企业名称", trigger: "blur" }],
  email: [
    { required: true, message: "请输入企业邮箱", trigger: "blur" },
    {
      type: "email",
      message: "请输入正确的邮箱地址",
      trigger: ["blur", "change"],
    },
  ],
});
const submitForm = () => {
  api
    .post("/chat/found_enterprise/", enterpriseForm)
    .then((response) => {
      // 如果创建成功，弹出ElMessageBox
      if (response.status === 201) {
        ElMessageBox.alert("创建企业成功", "提示", {
          confirmButtonText: "确定",
          callback: (action) => {
            //跳转到“我的企业”
            getEnterpriseList();
            enterpriseSetting.value = "my_enterprise";
            //enterpriseForm重置
            enterpriseForm.name = "";
            enterpriseForm.introduction = "";
            enterpriseForm.email = "";
          },
        });
      }
    })
    .catch((error) => {
      // 处理错误响应
      if (error.response) {
        const response = error.response;
        if (response.status === 400) {
          // 如果返回400，弹出ElMessageBox
          ElMessageBox.alert(response.data.message, "提示", {
            confirmButtonText: "确定",
            callback: (action) => {
              //跳转到“添加企业”
              enterpriseSetting.value = "add_enterprise";
            },
          });
        }
      }
    });
};
let enterpriseList = reactive([]);
//获取企业列表
// const getEnterpriseList = async () => {
//   try {
//     const response = await api.get("/chat/found_enterprise/");
//     enterpriseList = response.data;
//     // console.log('获取企业列表成功',enterpriseList);
//   } catch (error) {
//     console.error(error);
//   }
// };
const llm_service = ref("");
const llm_models = [
  { value: "openai", label: "OPENAI" },
  { value: "azure_openai", label: "Azure OPENAI", disabled: true },
];

const settingsForm = reactive({
  openai_api_key: "",
  openai_api_base: "",
});

const settingsRules = reactive({
  openai_api_key: [
    { required: true, message: "请输入OpenAI API Key", trigger: "blur" },
  ],
});

const enableAPIBASE = ref(false);

const closeDrawer = () => {
  settingsDrawer.value = false;
};
//存储API信息，llm/save_api_info
// const saveSettings = () => {
//   if (llm_service.value === "openai") {
//     api
//       .post("llm/save_api_info/", {
//         llm_service: llm_service.value,
//         openai_api_key: settingsForm.openai_api_key,
//         openai_api_base: settingsForm.openai_api_base,
//       })
//       .then((res) => {
//         if (res.status === 201 || res.status === 200) {
//           //将API KEY保存到本地
//           localStorage.setItem("openai_api_key", settingsForm.openai_api_key);
//           localStorage.setItem("openai_api_base", settingsForm.openai_api_base);
//           ElMessage.success(res.data.message);
//           //关闭设置抽屉
//           settingsDrawer.value = false;
//           //请求访问set_api_info_cache
//           // api.post('llm/set_api_info_cache/').then(res => {
//           //     if (res.status === 200) {
//           //         //打印日志，存储API信息
//           //         console.log('缓存API信息成功')
//           //     }
//           //     //刷新页面
//           //     window.location.replace('/main')
//           // }).catch(err => {
//           //     ElMessage.error('缓存API信息失败');
//           //     //刷新页面
//           //     window.location.replace('/main')
//           // })
//         }
//       })
//       .catch((err) => {
//         ElMessage.error(err.response.data.message);
//       });
//   }
// };
//获取API信息，llm/get_api_info
// const getSettings = () => {
//   api
//     .get("llm/get_api_info/")
//     .then((res) => {
//       if (res.status === 200) {
//         settingsForm.openai_api_key = res.data.openai_api_key;
//         settingsForm.openai_api_base = res.data.openai_api_base;
//         //打印日志，获取API信息
//         console.log("加载API信息成功");
//       }
//     })
//     .catch((err) => {
//       ElMessage.error("加载API信息失败");
//     });
// };
//监听settingsDrawer，当打开时获取API信息
// watch(
//   settingsDrawer,
//   (newValue) => {
//     if (newValue) {
//       getSettings();
//     }
//   },
//   { immediate: false }
// );

// 上传的-------------------------------------------------------------------------------------------------   LIN
// 跳转积分充值
const openPointCard = () => {
  mitt.emit("clickDrawer");
};

const fileList = ref([]);

// 打开邮箱(只能在electron环境下打开)
const openEmail = () => {
  const emailAddress = "sales@genitop.com";
  window.electronAPI.openEmail(emailAddress);
};

// 表单实例
const formRef = ref();
const AvatarFile = ref("");
// 收集用户数据
const ruleForm = ref({
  nickname: "",
  avatar: "./assets/default-avatar.png",
  email: userStore.userInformation.email,
  user: userStore.userInformation.user_id,
  wechat_username: userStore.userInformation.wechat_username,
  username: "",
  user_type: "human",
  user_mobile:"",
});
// 校验
const rules = reactive({
  // name: [
  //   { required: true, message: "请输入昵称", trigger: "blur" },
  //   { min: 3, max: 5, message: "Length should be 3 to 5", trigger: "blur" },
  // ],
  // userName: [{ required: true, message: "请输入用户名", trigger: "change" }],
  // email: [
  //   { required: true, message: "请输入邮箱", trigger: "blur" },
  //   {
  //     type: "email",
  //     message: "Please input correct email address",
  //     trigger: ["blur", "change"],
  //   },
  // ],
});

// 更新用户数据
const userList = async () => {
  try {
    const res = await getUserProfileNew();
    user_information.value = res.data.data;     
    console.log("获取用户信息成功", res);
    const { nickname, avatar, user_name,user_mobile, wechat_username, email } = res.data.data;
    ruleForm.value.nickname = nickname;
    ruleForm.value.username = user_name;
    ruleForm.value.avatar = avatar;
    ruleForm.value.email = email;
    ruleForm.value.user_mobile = user_mobile;
    ruleForm.value.wechat_username = wechat_username;
  } catch (error) {
    console.log(error);
  }
};

// 调整图片尺寸的函数
const resizeImage = (file, width, height) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        resolve(new File([blob], file.name, {
          type: 'image/png',
          lastModified: Date.now()
        }));
      }, 'image/png');
    };
    img.src = e.target.result;
  };
  reader.onerror = (error) => reject(error);
  reader.readAsDataURL(file);
});


// 上传头像
const handleFileChange = async (event) => {
  const fileInput = event.target;
  const selectedFile = fileInput.files[0];
  if (!selectedFile) {
    return;
  }
  // 使用Canvas调整图片尺寸
  const resizedImage = await resizeImage(selectedFile, 512, 512);
  AvatarFile.value = resizedImage; // 存储调整尺寸后的图片  
  const imageUrl = URL.createObjectURL(selectedFile);
  ruleForm.value.avatar = imageUrl; //显示出来
};

// 绑定微信
const state = ref("")
const bindWechat = async () => {
  ElMessageBox.alert(
    '<view id="webLoginCode" class="flex-column" style="justify-content: center;align-items: center;"></view>',
    '微信绑定',
    {
      dangerouslyUseHTMLString: true,
      center:true,
    }
  )
  nextTick(async () => {
    try {
      let params = {}
      state.value = generateRandomString(16)
      setWxerwma()
      params.state = state.value
      const res = await postLlmBindWeb(params)
      ruleForm.value.wechat_username = res?.data?.data?.wechat_username;
    } catch (error) {
      ElMessage.error(error?.response?.data?.message||'绑定失败');
    }
  })
}
const isProd = computed(() => {
    return window.VITE_NODE_ENV != 'development' && window.VITE_NODE_ENV != 'testing'
})
let WxAttributes = ref({
    url: "",
    appid: "",
});//灰度
if(isProd.value) {
    WxAttributes.value = {
        url:"https://api.mindcraft.com.cn/",
        appid:"wxd1eee58e6c92a01a",
    };//切换生产
} else {
    WxAttributes.value = {
        url:"https://grayapi.mindcraft.com.cn/",
        appid:"wx051d6926de440019",
    };//切换测试
}
const isWIN = computed(() => {
    return window.VITE_NODE_PLATFORM != 'IOS'
})

const setWxerwma = () => {
  new WxLogin({
    self_redirect: true,
    id: "webLoginCode",
    appid: WxAttributes.value.appid,
    scope: "snsapi_login",
    redirect_uri: `${WxAttributes.value.url}/wxweb/`,
    state: state.value,
    style: "black",
    href: "",
  });
};
const generateRandomString = (length) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

// 点击保存 修改
const submitForms = async (formEl) => {
  try {
    if (AvatarFile.value) {
      const formData = new FormData();
      // 将文件添加到FormData对象中
      formData.append("avatar", AvatarFile.value);
      //  上传头像
      await postUploadAvatar(formData);
    }

    // 删除 avatar 字段
    const { avatar, ...requestData } = ruleForm.value;

    console.log();
    // 修改个人信息
    await postModifyUserProfile(requestData);
    ElMessage.success('保存成功');
    await userList(); //更新
  } catch (error) {
    ElMessage.error('保存失败')
    console.log(error);
  }
};
// 点击取消
const resetForm = (formEl) => {
  settingsDrawer.value = false;
};
//关闭弹窗时
const handleDrawerClose = async()=>{
  try {
    // 重新获取用户数据
    await userList();
    settingsDrawer.value = false;
  } catch (error) {
    console.log(error);
    settingsDrawer.value = false;
  }
};

// 会员积分
const buttonClass = computed(()=>{
  const vip_level = user_information.value.vip_level;
  if(vip_level == '0' || vip_level == null){
     return 'pointCard-img1'
  }else if(vip_level >= "0"){
     return 'pointCard-img'
  }
});

/************ 设置 ***********/
import { Conf } from 'electron-conf/renderer'
// 开机启动
const loginStart = ref(false)
const codexSafeModeEnabled = ref(false)
const getLoginItemSettings = async () => {
  loginStart.value = await window.electronAPI.getLoginItemSettings()
  // console.log(loginStart.value)
}
const setLoginItemSettings = async () => {
  window.electronAPI.setLoginItemSettings(loginStart.value)
}
const getCodexSafeModeEnabled = async () => {
  try {
    const conf = new Conf()
    const value = await conf.get('codexSafeModeEnabled')
    codexSafeModeEnabled.value = typeof value === 'boolean' ? value : false
  } catch (_) {
    codexSafeModeEnabled.value = false
  }
}
const setCodexSafeModeEnabled = async () => {
  const conf = new Conf()
  await conf.set('codexSafeModeEnabled', codexSafeModeEnabled.value)
}
const modifierSelectList = [
  { value: 'CmdOrCtrl', label: 'CmdOrCtrl' },
  { value: 'Alt', label: 'Alt' },
  { value: 'Shift', label: 'Shift' },
]
// 浮窗启动
const canOpenSideFloatWin = ref(false)
const getCanOpenHoverWin = async () => {
  const info = await window.electronAPI.getSideFloatInfo()
  canOpenSideFloatWin.value = info.canOpenSideFloatWin
}
const setCanOpenHoverWin = async () => {
  window.electronAPI.setSideFloatInfo({canOpenSideFloatWin: canOpenSideFloatWin.value})
  // 将应用内配置写入全局配置
  const conf = new Conf()
  await conf.set('canOpenSideFloatWin', canOpenSideFloatWin.value)
  if(canOpenSideFloatWin.value){
    window.electronAPI.sidefloatOperation({ type: 'openWin' })
  } else {
    window.electronAPI.sidefloatOperation({ type: 'closeWin' })
  }
}
// 截图启动
const canOpenScreenShotWin = ref(false)
const getcanOpenScreenShotWin = async () => {
  const info = await window.electronAPI.getScreenShotInfo()
  canOpenScreenShotWin.value = info.canOpenScreenShotWin
  hotKeyScreenShotWin.value = info.openShortcut
}
const setcanOpenScreenShotWin = async () => {
  window.electronAPI.setScreenShotInfo({canOpenScreenShotWin: canOpenScreenShotWin.value})
  // 将应用内配置写入全局配置
  const conf = new Conf()
  await conf.set('canOpenScreenShotWin', canOpenScreenShotWin.value)
}
const showScreenShotWinSet = ref(false)
const hotKeyScreenShotWin = ref('')
const openSetScreenShotWinSet = async() => {
  const info = await window.electronAPI.getScreenShotInfo()
  hotKeyScreenShotWin.value = info.openShortcut
  keydownScreenShotList.value = info.openShortcut.split('+')
  showScreenShotWinSet.value = !showScreenShotWinSet.value
}
const keydownScreenShotList = ref(['Alt'])
const keydownScreenShotListKeyCom = computed({
  get() {
    return keydownScreenShotList.value[1]
  },
  set(value) {
    console.log(value)
  }
})
const handleKeyDownScreenShotWin = (e) => {
  console.log(e)
  if(e.key == " ") {
    keydownScreenShotList.value[1] = "Space"
  } else if(e.key == "Process") {
    keydownScreenShotList.value[1] = "Q"
  } else  {
    keydownScreenShotList.value[1] = e.key
  }
}
const saveSetScreenShotWin = async () => {
  hotKeyScreenShotWin.value = keydownScreenShotList.value.join('+')
  console.log(hotKeyScreenShotWin.value)
  await window.electronAPI.setScreenShotInfo({openShortcut: hotKeyScreenShotWin.value})
  showScreenShotWinSet.value = !showScreenShotWinSet.value
}

import modelListMenu from "@/components/modelListMenu.vue"

const modelList = ref([])
import { getModel_list_new } from "../api/mainActivity/chat";
const getModelList = async () => {
  const res = await getModel_list_new()
  modelList.value = res.data;
}
const modelImage = (name) => {
  let img = ""
  modelList.value.map(item => {
    item.model_list.map(model => {
      if(model.model_name === name) {
        img = item.image_url
      }
    })
  })
  return img
}
// 默认模型
const publicDefaultModel = ref('')
const getPublicDefaultModel = async () => {
  const conf = new Conf()
  publicDefaultModel.value = await conf.get("publicDefaultModel") || ""
}
const publicModelListMenuRef = ref(null)
const openPublicDefaultModel = () => {
  publicModelListMenuRef.value.getModelList()
}
const publicModelListPopoverRef = ref(null)
const setPublicDefaultModel = async () => {
  // publicModelListPopoverRef.value.hide()
  const conf = new Conf()
  await conf.set("publicDefaultModel", publicDefaultModel.value)
}

// 识图模型
const picDeafultModel = ref('')
const getPicDeafultModel = async () => {
  const conf = new Conf()
  picDeafultModel.value = await conf.get("picDeafultModel") || ""
}
const picModelListMenuRef = ref(null)
const openPicDefaultModel = () => {
  picModelListMenuRef.value.getModelList()
}
const picModelListPopoverRef = ref(null)
const setPicDefaultModel = async () => {
  // picModelListPopoverRef.value.hide()
  const conf = new Conf()
  await conf.set("picDeafultModel", picDeafultModel.value)
}


// 检查更新
const checkForUpdate = async () => {
  await window.electronAPI.checkForUpdates()
  if(!isUpdateAvailable.value && activeSetting.value == "settings") {
    ElMessage({
      message: '当前已是最新版本',
      type: 'success',
    })
  }
}
const isUpdateAvailable = ref(false)
const getUpdateStatus = async () => {
  window.electronAPI.getClientUpdateInfoData()
}
window.electronAPI.clientUpdateInfoData((progress) => {
  isUpdateAvailable.value = progress
})

//登出事件
import { useRouter } from "vue-router";
const router = useRouter();
const logout = () => {
  userStore.logout()
  return
  // localStorage.clear();

  // 获取所有键名
  const keys = Object.keys(localStorage);
  // 除了"identifier"外全部清除
  // && key !== "baseURL"
  keys.forEach((key) => {
    if (key !== "identifier" && key !== "baseURL" && key !== "wsURL" ) {
      localStorage.removeItem(key);
    }
  });

  // 跳转到登录页面,使用router

  mitt.emit('clearIntervalMail');

  router.push("/login");
};
/************ 设置 ***********/

</script>

<style scoped>
.settings {
  padding: 10px;
}

.llm_service {
  text-align: left;
  margin-left: 70px;
}

.settings-form {
  width: 400px;
  margin: 0 auto;
}

.settings-footer {
  display: flex;
  justify-content: flex-start;
  /* position: absolute;
  bottom: 20px;
  left: 50px;
  right: 0; */
  padding: 10px;
}

.settings-footer .el-button {
  margin-left: 20px;
}

.img-service {
  background-image: url(../assets/clip_image001.png);
  background-size: 100% 100%;
}

/* .img-QQ{
  background-image: url(../assets/QQ.jpg)
} */
.upload-demo {
  margin-bottom: 20px;
}

.pointCard {
  display: flex;
  flex-direction: row;
  justify-content: center;
  margin-bottom: 50px;
}

.pointCard-box {
  width: 32vw;
  height: 190px;
  background: #ebf5ff;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  position: relative;
  border-radius: 10px;
}

.pointCard-img {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 80px;
  height: 32px;
  background-image: url(../assets/VIP.png);
  background-size: 100% 100%;
}
.pointCard-img1 {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 80px;
  height: 32px;
  background-image: url(../assets/VIP-3.png);
  background-size: 100% 100%;
}
:deep(.el-col).setting-right{
  margin: 2px 15px; 
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
:deep(.el-col).setting-label{
  display: flex;
  align-items: center;
  gap: 6px;
}
.setting-help{
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid #c0c4cc;
  color: #909399;
  font-size: 11px;
  line-height: 1;
  cursor: help;
}
</style>
