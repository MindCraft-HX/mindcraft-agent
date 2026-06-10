<template>
  <el-upload ref="upload" v-model:file-list="fileList" class="upload-demo" action=""
    :accept="'.txt, .docx, .pdf, .xlsx, .xls, .html, .js, .css, .c, .h, .java, .json, .py, .sql, .ts, .xml'"
    :auto-upload="false" :show-file-list="false" :multiple="true" @change="handleUpload">
    <el-button style="background: #ebf5ff; color: #4b9ee9; width: 150px"
      :icon="FileMoniker === '文件交互' ? 'FolderOpened' : ''">{{ FileMoniker }}</el-button>
    <el-popover placement="bottom-end" :width="350" trigger="click">
      <template #reference>
        <el-button type="primary" @click.stop icon="ArrowDown" style="
            margin-left: 0px;
            background: #ebf5ff;
            color: #4b9ee9;
            border-color: #dcdfe6;
            width: 10px;
          " />
      </template>
      <div>
        <el-scrollbar max-height="400px">
          <!-- 内容 -->
          <div class="UploadFileContent" v-for="item in CacheFileStore.cacheFile" :key="item.id"
            v-if="CacheFileStore.cacheFile.length > 0">
            <el-button :type="item.shouldUpload ? 'success' : 'info'" icon="Check" circle
              style="width: 24px; height: 24px" @click="showUpdatafeil(item.id)" />
            <div>
              <svg class="icon" aria-hidden="true" style="font-size: 20px">
                <use :xlink:href="getIconHref(item.files_type)"></use>
              </svg>
            </div>
            <div class="UploadFileName">{{ item.name }}</div>
            <div>
              <el-button icon="Close" type="danger" circle style="width: 10px; height: 10px; margin-right: 5px"
                @click="deleteFile(item.id)" />
            </div>
          </div>

          <div v-else style="text-align: center">当前没有上传文件！！</div>
        </el-scrollbar>

      </div>
    </el-popover>
  </el-upload>
</template>

<script setup>
import { ref, computed, provide, nextTick, onMounted, watch } from "vue";
import { ElButton, ElMessage } from "element-plus";
import { useUploadFileStore } from "../../stores/UploadFile";
import { useUploadFilePathStore } from "../../stores/UploadFilePath";
import { useSaveFileStore } from "../../stores/saveFile";
import { useCacheFileStore } from "../../stores/cacheFile";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
// pdfjs-dist
import * as pdfjs from "pdfjs-dist";
import { GlobalWorkerOptions } from "pdfjs-dist/build/pdf";
const workerUrl = new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url)
  .href;
GlobalWorkerOptions.workerSrc = workerUrl;

// import { Check, Close } from "@element-plus/icons-vue";
const value2 = ref(true);

// console.log(XLSX,'XLSX');
// console.log(pdfjs,'pdfjs');
// console.log(mammoth,'mammoth');

// 保存文件
const fileList = ref([]);
const fileToSting = ref("");
const fileNames = ref(undefined);
// const FILE_MAX_LENGTH = 10; // 允许上传的文件最大数量
const UploadFileStore = useUploadFileStore();
const UploadFilePathStore = useUploadFilePathStore(); //回显的pinia
const SaveFileStore = useSaveFileStore();
const CacheFileStore = useCacheFileStore();
const upload = ref();

// console.log(XLSX,'xlsx');

//暴露
defineExpose({
  // fileToSting,
  fileList,
});

// 只能上传这些文件
const allowedFileTypes = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/javascript",
  "text/css",
  "text/html",
  "video/vnd.dlna.mpeg-tts",
  "",
  "text/xml",
  "application/json"
];

// 拿缓存文件做对比
watch(
  () => UploadFilePathStore.file_path,
  (newValue) => {
    const correctedPath = SaveFileStore.files;
    const stringValue = correctedPath[newValue];
    UploadFileStore.getfileToSting(stringValue);
  },
  { deep: true }
);

// 上传后做处理
const handleUpload = async (file) => {
  console.log(file, 'file66666');
  // console.log(fileList.value, 'fileList.value');
  // fileList.value.push(file);

  // 限制大小
  // const isLt5M = file.size / 1024 < 50;
  // if (!isLt5M) {
  //     ElMessage.info('文件大小不能超过50KB!');
  //     return
  // }

  //拿到文件路径
  UploadFilePathStore.setFilePath(file.raw.path);
  UploadFilePathStore.setFilePathName(file.name);

  // 保存整个文件
  UploadFileStore.getfileList(file);

  // 调下面函数 转字符串
  beforeUpload(file.raw);
};

// 上传之前做处理 :before-upload
const beforeUpload = async (file) => {
  // 判断是不是我们可以上传的文件
  console.log(file, "file");

  try {
    const isAllowedFileType = allowedFileTypes.includes(file.type);
    if (!isAllowedFileType) {
      ElMessage.error("只能上传docx、txt、pdf格式的文件!");
      return false;
    }

    // 文件名
    const fileName = file.name;
    fileNames.value = fileName;
    //  || "text/javascript"
    if (file.type === "text/plain" || file.type === "text/html" || file.type === "text/css" || file.type === "text/javascript" || file.type === "video/vnd.dlna.mpeg-tts" || file.type === "" || file.type === "text/xml") {
      // 处理txt文件
      const reader = new FileReader();
      reader.onload = function (event) {
        const fileContent = event.target.result;
        // UploadFileStore.getfileToSting(fileContent);
        // SaveFileStore.saveToFile(file.path, fileContent);
        CacheFileStore.addFile(
          file.uid,
          file.name,
          fileContent,
          file.path,
          file.type
        );
        CacheFileStore.addCacheFile(
          file.uid,
          file.name,
          fileContent,
          file.path,
          file.type
        );
        console.log(fileContent, 'fileContent');
      };
      reader.readAsText(file);
      // console.log(fileContent,'fileContent>>>>>>>>>>>>');

    } else if (file.type === "application/pdf") {
      // 处理pdf
      try {
        const content = await convertPdfToString(file);
        // UploadFileStore.getfileToSting(content);
        // SaveFileStore.saveToFile(file.path, content);
        CacheFileStore.addFile(
          file.uid,
          file.name,
          content,
          file.path,
          file.type
        );
        CacheFileStore.addCacheFile(
          file.uid,
          file.name,
          content,
          file.path,
          file.type
        );
        console.log(content, 'content');
      } catch (error) {
        console.log(error);
      }
    } else if (
      file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      // 处理docx
      try {
        const content = await docxFileToString(file);
        // UploadFileStore.getfileToSting(content);
        // SaveFileStore.saveToFile(file.path, content);
        console.log(content, 'content>>>>>>>>>.');
        CacheFileStore.addFile(
          file.uid,
          file.name,
          content,
          file.path,
          file.type
        );
        CacheFileStore.addCacheFile(
          file.uid,
          file.name,
          content,
          file.path,
          file.type
        );
      } catch (error) {
        console.error(error);
      }
    } else if (
      file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      "application/vnd.ms-excel"
    ) {
      try {
        // 转为json
        const content = await xlsxToJson(file);
        // console.log(content,'content');
        // UploadFileStore.getfileToSting(JSON.stringify(content));
        // SaveFileStore.saveToFile(file.path, JSON.stringify(content));
        CacheFileStore.addFile(
          file.uid,
          file.name,
          JSON.stringify(content),
          file.path,
          file.type
        );
        CacheFileStore.addCacheFile(
          file.uid,
          file.name,
          JSON.stringify(content),
          file.path,
          file.type
        );
        console.log(content, 'content');
      } catch (error) {
        console.log(error);
      }
    }
    return false; // 阻止默认上传行为
  } catch (error) {
    console.log(error, "error");
  }
  console.log(SaveFileStore.files, "SaveFileStore.files");
};
// 上传超出限制
// const handleExceed = (files) => {
//   // console.log(files,'>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>.');
//   // ElMessage.warning(`上传文件数量不能超过${FILE_MAX_LENGTH}个！`);
//   upload.value.clearFiles();
//   nextTick(() => {
//     upload.value.handleStart(files[0]);
//   });
// };
// 处理docx
const docxFileToString = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const arrayBuffer = event.target.result;
      console.log(arrayBuffer, 'arrayBuffer');

      mammoth
        .extractRawText({ arrayBuffer: arrayBuffer })
        .then((result) => {
          resolve(result.value);
          console.log(result, 'result');
        })
        .catch((error) => {
          reject(error);
          console.log(error);
        });
    };

    reader.onerror = (error) => {
      reject(error);
    };

    reader.readAsArrayBuffer(file);
  });
};
// 处理pdf pdfjs方法
const convertPdfToString = async (file) => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    const textArray = [];
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join("");
      textArray.push(pageText);
    }
    return textArray.join("\n");
  } catch (error) {
    throw error;
  }
};

// 处理xlsx
async function xlsxToJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = new Uint8Array(reader.result);
      // 读取 Excel 文件
      const workbook = XLSX.read(data, { type: "array" });
      // 存储所有表格的 JSON 数据
      const allSheetsData = {};
      // 遍历所有表格
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        // 将表格数据转换为 JSON 格式
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        allSheetsData[sheetName] = jsonData;
      });
      resolve(allSheetsData);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
// 过滤名字的
const FileMoniker = computed(() => {
  return CacheFileStore.cacheFile.length > 0 ? `已有上传文件(${CacheFileStore.cacheFile.length})` : "文件交互";
});

// 换行
const removeQuotes = (str) => {
  return str.replace(/"/g, "");
};

// const TestClick = () => {
//   console.log(CacheFileStore.files, "CacheFileStore.files>>>>>>>>>>.");
// };

// 删除
const deleteFile = (id) => {
  CacheFileStore.removeCacheFile(id);
  CacheFileStore.removeFile(id);
};

//显示图标处理
const getIconHref = (fileType) => {
  const typeToIcon = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      "#icon-xlsx",
    "application/vnd.ms-excel": "#icon-xlsx",
    "text/plain": "#icon-txt",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "#icon-docx",
    "application/pdf": "#icon-pdf",
    "text/javascript": "#icon-daimawenjian",
    "": "#icon-daimawenjian",
    "text/css": "#icon-daimawenjian",
    "text/html": "#icon-daimawenjian",
    "video/vnd.dlna.mpeg-tts": "#icon-daimawenjian",
    "text/xml": "#icon-daimawenjian",
    "application/json": "#icon-daimawenjian",
  };
  return typeToIcon[fileType] || "#icon-default"; // 返回默认图标，如果没有匹配的类型
};

// "text/javascript",
//   "text/css",
//   "text/html",
//   "video/vnd.dlna.mpeg-tts",
//   "",
//   "text/xml"

const showUpdatafeil = (id) => {
  CacheFileStore.toggleUpload(id);
  // CacheFileStore.toggleShouldUpload(id);
};
</script>

<style scoped>
.upload-demo {
  display: flex;
  justify-content: center;
  align-items: center;
}

.UploadFileContent {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e4e7ed;
  padding: 5px 5px;
  height: 30px;
}

.UploadFileName {
  width: 180px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline;
}
</style>
