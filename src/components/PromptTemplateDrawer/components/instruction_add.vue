<template>
  <!-- style="height: 680px;padding: 6px;" -->
  <div>
    <!-- 上面 -->
    <div style="display: flex; justify-content: space-between">
      <!-- 左 -->
      <div style="width: 668px; height: 190px">
        <div style="font-size: 15px; color: #606266; margin-bottom: 5px">
          指令名称
        </div>
        <div>
          <el-input v-model="instructionPromptForm.prompt_name" style="width: 440px; margin-right: 35px"
            placeholder="指令名称" clearable />
          <el-switch v-model="instructionPromptForm.is_shared" class="mb-2" active-text="共享" inactive-text="不共享" />
        </div>

        <div style="
            font-size: 15px;
            color: #606266;
            margin-top: 30px;
            margin-bottom: 5px;
          ">
          指令分类
        </div>
        <el-select v-model="instructionPromptForm.prompt_type" placeholder="指令分类" style="width: 440px"
          @change="handlePromptType">
          <el-option v-for="item in options" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </div>
      <!-- 右 -->
      <div style="
          width: 180px;
          height: 190px;
          display: flex;
          align-items: center;
          justify-content: space-evenly;
          flex-direction: column;
        ">
        <img :src="instructionPromptForm.update_image_url" alt="" style="width: 100px; height: 100px" />
        <!-- <el-button type="primary" @click="add_UploadImage">本地上传</el-button>
        <input type="file" ref="add_FileInput" @change="add_handleFileChange" style="display: none" /> -->
      </div>
    </div>
    <!-- 下面 -->
    <div>
      <div style="margin-bottom: 10px">指令内容（提示词）</div>
      <el-input v-model="instructionPromptForm.standard_prompt" type="textarea" :autosize="{ minRows: 4 }" />
    </div>
    <div style="margin-top: 50px">
      <div>回应发散性 （LLM Temperature）</div>
      <el-slider v-model="instructionPromptForm.llm_temperature" :step="10" show-stops
        :format-tooltip="temperatureFormat" :marks="temperatureMarks" class="form-item" />
    </div>

    <div style="margin-top: 80px">
      <el-button type="primary" @click="createPrompt">保存</el-button>
      <el-button type="danger" @click="resetPrompt">重置</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch, computed } from "vue";
import { addInstructionPromptList } from "../../../api/mainActivity/PromptTemplate.js";
import { ElMessage } from "element-plus";
import { postUploadProcessor } from "../../../api/mainActivity/chat";
import { getInstructionPromptValueMap, AddCreateInstructionPrompt } from "../../../api/mainActivity/PromptTemplate.js";

const llm_temperature = ref(20);
const desc = ref("");
const input = ref("");
const value1 = ref(false);

const emit = defineEmits(['successfulJump']);

const instructionPromptForm = ref({
  prompt_name: "",
  is_shared: false,
  prompt_type: "miscellaneous",
  standard_prompt: "", //指令内容提示词
  llm_temperature: 20,
  update_image_url: "https://download.mindcraft.com.cn/mindcraft_media/prompt/其他.png"
,
});

const add_FileInput = ref(null);

const temperatureMarks = {
  0: "0",
  20: "思维严谨",
  80: "思维发散",
  50: "0.5",
  100: "1",
};
const temperatureFormat = (val) => {
  return val / 100;
};

const value = ref("");
const options = ref([])
// const options = [
//   {
//     value: "standard",
//     label: "标准指令",
//   },
// ];

onMounted(async () => {
  await getInstructionPromptList();
})

const createPrompt = async () => {
  // update_image_url
  const formData = new FormData();

  // 遍历 instructionPromptForm 对象并将每个字段添加到 formData 中
  for (const key in instructionPromptForm.value) {
    if (instructionPromptForm.value.hasOwnProperty(key)) {
      formData.append(key, instructionPromptForm.value[key]);
    }
  }
  // console.log(formData, 'formData');

  try {
    await AddCreateInstructionPrompt(formData);
    ElMessage.success("创建成功");
    instructionPromptForm.value = {
      prompt_name: "",
      is_shared: false,
      prompt_type: "miscellaneous",
      standard_prompt: "",
      llm_temperature: 20,
      update_image_url: "https://download.mindcraft.com.cn/mindcraft_media/prompt/其他.png"
,
    };
    emit('successfulJump');
  } catch (error) {
    console.log(error, "error");
    ElMessage.error("创建失败");
  }
};
const resetPrompt = () => {
  instructionPromptForm.value = {
    prompt_name: "",
    prompt_type: "miscellaneous",
    is_shared: false,
    standard_prompt: "",
    // personalized_prompt: {
    //   user_profile: "",
    //   response_preference: "",
    // },
    // customized_prompt: [],
    update_image_url:"https://download.mindcraft.com.cn/mindcraft_media/prompt/其他.png",
    llm_temperature: 20,
  };
};

const add_UploadImage = () => {
  add_FileInput.value.click();
};

const add_handleFileChange = async (event) => {
  console.log(event, "event");
  const file = event.target.files[0];
  if (file) {
    const link_file = await uploadImages(file);
    // 添加到保存
    instructionPromptForm.value.update_image_url = link_file.file_url;
    // const reader = new FileReader();
    // reader.onload = async (e) => {
    //   instructionPromptForm.value.update_image_url = e.target.result;
    // };
    // reader.readAsDataURL(file);
  }
};

// 上传图片 转链接
async function uploadImages(file) {
  let uploadImageUrl = null;
  const formData = new FormData();

  if (file && file.type && file.type.startsWith("image/")) {
    formData.append("files[]", file);
    formData.append("update_type", "file_url");
    try {
      const res = await postUploadProcessor(formData);
      console.log(res.data.data[0], "res");
      uploadImageUrl = res.data.data[0]; // 假设返回的链接在 data 数组的第一个元素
    } catch (error) {
      console.error("上传错误：", error.response ? error.response.data : error);
    }
  } else {
    console.error("文件类型错误");
  }
  return uploadImageUrl;
}

const handlePromptType = (val) => {
  instructionPromptForm.value.prompt_type = val;
  const selectedItem = options.value.find(item => item.value === val);
  instructionPromptForm.value.update_image_url = selectedItem.url;
  // console.log(selectedItem.url,'selectedItem.url');
}

const getInstructionPromptList = async () => {
  const res = await getInstructionPromptValueMap();
  options.value = res.data.data.prompt_type;
};
</script>

<style scoped>
.form-item {
  width: 97%;
  padding-left: 15px;
}
</style>
