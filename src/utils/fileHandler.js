import { ref } from "vue";
import { ElMessage } from "element-plus";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import * as pdfjs from "pdfjs-dist";
import { GlobalWorkerOptions } from "pdfjs-dist/build/pdf";
const workerUrl = new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url)
  .href;
GlobalWorkerOptions.workerSrc = workerUrl;

const allowedFileTypes = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

const beforeUpload = async (file) => {
  try {
    const isAllowedFileType = allowedFileTypes.includes(file.type);
    if (!isAllowedFileType) {
      ElMessage.warning("只能上传docx、txt、pdf格式的文件和图片!");
    }

    const fileName = file.name;
    console.log(fileName, "fileName");
    let footdata = null;

    if (file.type === "text/plain") {
      const content = await readFileAsText(file);
      footdata = {
        id: file.lastModified,
        name: file.name,
        content: content,
        path: file.path,
        files_type: file.type,
      };
    } else if (file.type === "application/pdf") {
      const content = await convertPdfToString(file);
      console.log(content, "pdfContent");
      footdata = {
        id: file.lastModified,
        name: file.name,
        content: content,
        path: file.path,
        files_type: file.type,
      };
    } else if (
      file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const content = await docxFileToString(file);
      console.log(content, "docxContent");
      footdata = {
        id: file.lastModified,
        name: file.name,
        content: content,
        path: file.path,
        files_type: file.type,
      };
    } else if (
      file.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.type === "application/vnd.ms-excel"
    ) {
      const content = await xlsxToJson(file);
      console.log(content, "xlsxContent");
      footdata = {
        id: file.lastModified,
        name: file.name,
        content: content,
        path: file.path,
        files_type: file.type,
      };
    }
    return footdata; // 阻止默认上传行为
  } catch (error) {
    console.error(error.message);
    return false;
  }
};

const readFileAsText = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

const docxFileToString = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const arrayBuffer = event.target.result;
      mammoth
        .extractRawText({ arrayBuffer })
        .then((result) => resolve(result.value))
        .catch(reject);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

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

const xlsxToJson = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = new Uint8Array(reader.result);
      const workbook = XLSX.read(data, { type: "array" });
      const allSheetsData = {};
      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        allSheetsData[sheetName] = jsonData;
      });
      resolve(allSheetsData);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

export { beforeUpload };
