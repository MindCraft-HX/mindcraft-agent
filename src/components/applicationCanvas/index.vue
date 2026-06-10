<template>
  <div style="position: relative">
    <canvas class="canvas" id="canvasDOM" ref="canvas" :style="{ cursor: cursorStyle }"></canvas>
    <input v-show="showTextInput" v-model="inputText" ref="textInput" />
    <!-- 上面工具 -->
    <div class="Head-tool" v-show="showTool">
      <el-popover placement="bottom" :width="200" trigger="click">
        <template #reference>
          <el-button style="width: 42px; height: 32px; border: none" @click="setTool('pencil')">
            <svg class="icon" aria-hidden="true" style="font-size: 30px">
              <use xlink:href="#icon-qianbi-"></use>
            </svg>
          </el-button>
        </template>
        <el-slider v-model="penSize" :min="1" :max="20" @change="handlePenSizeChange"></el-slider>
      </el-popover>
      <el-popover placement="bottom" :width="200" trigger="click">
        <template #reference>
          <el-button style="width: 42px; height: 32px; border: none" @click="setTool('eraser')">
            <svg class="icon" aria-hidden="true" style="font-size: 36px">
              <use xlink:href="#icon-xiangpica"></use>
            </svg>
          </el-button>
        </template>
        <el-slider v-model="eraserSize" :min="5" :max="50" @change="handlePenSizeChange2"></el-slider>
      </el-popover>
      <el-button style="width: 42px; height: 32px; border: none" @click="setTool('text')">
        <svg class="icon" aria-hidden="true" style="font-size: 30px">
          <use xlink:href="#icon-wenzi"></use>
        </svg>
      </el-button>
    </div>
    <!-- 侧面工具 -->
    <div class="Right-tool" v-show="showTool">
      <!-- 颜色 -->
      <div style="padding: 10px 0px; border-bottom: 1px solid #e4e7ed">
        <div style="margin-bottom: 10px">
          <el-button class="button-size" circle style="background: #000" @click="changeColor('#000')"></el-button>
          <el-button class="button-size" circle style="background: #ffffff" @click="changeColor('#ffffff')"></el-button>
          <el-button class="button-size" circle style="background: #9a9a9a" @click="changeColor('#9a9a9a')"></el-button>
          <el-button class="button-size" circle style="background: #ff3f00" @click="changeColor('#ff3f00')"></el-button>
        </div>
        <div>
          <el-button class="button-size" circle style="background: #00b4ff" @click="changeColor('#00b4ff')"></el-button>
          <el-button class="button-size" circle style="background: #ffec00" @click="changeColor('#ffec00')"></el-button>
          <el-button class="button-size" circle style="background: #61ed00" @click="changeColor('#61ed00')"></el-button>
          <el-button class="button-size" circle style="background: #b403ff" @click="changeColor('#b403ff')"></el-button>
        </div>
      </div>
      <!-- 图形 -->
      <div style="padding: 14px 5px; border-bottom: 1px solid #e4e7ed">
        <div style="margin-bottom: 15px">
          <el-button class="button-form" @click="setTool('line')">
            <svg class="icon" aria-hidden="true" style="font-size: 22px">
              <use xlink:href="#icon-xiexianzuo"></use>
            </svg>
          </el-button>
          <el-button class="button-form" @click="setTool('circle')">
            <svg class="icon" aria-hidden="true" style="font-size: 20px">
              <use xlink:href="#icon-weixuanzhongyuanquan"></use>
            </svg>
          </el-button>
          <el-button class="button-form" @click="setTool('square')">
            <svg class="icon" aria-hidden="true" style="font-size: 20px">
              <use xlink:href="#icon-24gl-square"></use>
            </svg>
          </el-button>
          <el-button class="button-form" @click="setTool('arrow')">
            <svg class="icon" aria-hidden="true" style="font-size: 20px">
              <use xlink:href="#icon-youbian"></use>
            </svg>
          </el-button>
        </div>
      </div>
      <!-- 第三层 -->
      <div style="padding: 12px 5px">
        <el-button class="button-form" @click="undo">
          <svg class="icon" aria-hidden="true" style="font-size: 20px">
            <use xlink:href="#icon-fanhui"></use>
          </svg>
        </el-button>
        <el-button class="button-form" @click="redo">
          <svg class="icon" aria-hidden="true" style="font-size: 20px">
            <use xlink:href="#icon-fanhuiyou"></use>
          </svg>
        </el-button>
        <el-button class="button-form" @click="clearCanvas" title="删除">
          <svg class="icon" aria-hidden="true" style="font-size: 20px">
            <use xlink:href="#icon-shanchu"></use>
          </svg>
        </el-button>
        <el-button class="button-form" @click="saveCanvas" title="复制">
          <svg class="icon" aria-hidden="true" style="font-size: 20px">
            <use xlink:href="#icon-fuzhi1"></use>
          </svg>
        </el-button>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted, nextTick } from "vue";
import domtoimage from "dom-to-image";
import { ElMessage } from "element-plus";

const canvas = ref(null);
const penSize = ref(1); // 默认铅笔大小为5
const eraserSize = ref(5); //默认橡皮擦是5
const ctx = ref(null);
const drawingTool = ref("pencil"); // 默认为铅笔工具
const isDrawing = ref(false); // 标记是否正在绘制
const cursorStyle = ref("default"); // 默认光标样式
let startX = 0; // 鼠标按下时的X坐标
let startY = 0; // 鼠标按下时的Y坐标
const currentColor = ref("#000");
const drawHistory = ref([]); //定义一个绘制历史数组
let prevImageData = null; // 保存之前的绘制内容
const undoStack = ref([]); // 撤销栈
const redoStack = ref([]); // 重做栈
const showTool = ref(true);

const textInput = ref(null);
const inputText = ref("");
const showTextInput = ref(false);
let textPosition = ref({ x: 0, y: 0 });
const isInput = ref(false);

onMounted(() => {
  const canvasEl = canvas.value;
  canvasEl.width = canvasEl.offsetWidth;
  canvasEl.height = canvasEl.offsetHeight;
  ctx.value = canvasEl.getContext("2d");
  canvasEl.addEventListener("mousedown", startDrawing);
  canvasEl.addEventListener("mousemove", draw); //鼠标按下
  canvasEl.addEventListener("mouseup", stopDrawing); //鼠标抬起
  canvasEl.addEventListener("mouseout", stopDrawing);
});

document.addEventListener("click", (e) => {
  if (inputText.value) {
    isInput.value = false;
    showTextInput.value = false;
    if (inputText.value) {
      updateTextOnCanvas();
    }
    inputText.value = "";
  }
});

function startDrawing(e) {
  if (drawingTool.value === "text") {
    if (isInput.value) {
      return;
    }
    isInput.value = true;
    textPosition.value = { x: e.offsetX, y: e.offsetY };
    showTextInput.value = true;
    nextTick(() => {
      textInput.value.style.left = `${e.offsetX}px`;
      textInput.value.style.top = `${e.offsetY}px`;
      textInput.value.focus();
      setTimeout(() => {
        textInput.value.focus();
      }, 200);
    });
  } else {
    isDrawing.value = true;
    startX = e.offsetX;
    startY = e.offsetY;
    if (drawingTool.value !== "pencil" && drawingTool.value !== "eraser") {
      // 对于非铅笔和橡皮擦工具，我们在这里不立即绘制
      return;
    }
    ctx.value.beginPath();
    ctx.value.moveTo(e.offsetX, e.offsetY);
  }
}

// 绘图
function draw(e) {
  if (!isDrawing.value) return;
  showTool.value = false;

  let currentX = e.offsetX;
  let currentY = e.offsetY;

  if (drawingTool.value === "pencil" || drawingTool.value === "eraser") {
    if (drawingTool.value === "pencil") {
      cursorStyle.value = "crosshair";
      ctx.value.lineTo(currentX, currentY);
      ctx.value.strokeStyle = currentColor.value;
      ctx.value.lineWidth = penSize.value;
      ctx.value.lineCap = "round";
      ctx.value.lineJoin = "round";
      ctx.value.stroke();
    } else if (drawingTool.value === "eraser") {
      cursorStyle.value = "pointer";
      const eraserWidth = eraserSize.value * 2;
      const eraserHeight = eraserSize.value * 2;
      ctx.value.clearRect(
        currentX - eraserWidth / 2,
        currentY - eraserHeight / 2,
        eraserWidth,
        eraserHeight
      );
    }
  } else {
    // 清除画布并重新绘制历史路径，然后绘制形状预览
    ctx.value.clearRect(0, 0, canvas.value.width, canvas.value.height);
    drawHistory.value.forEach((imageData) => {
      ctx.value.putImageData(imageData, 0, 0);
    });
    drawShapePreview(currentX, currentY);
  }
}

function drawShapePreview(currentX, currentY) {
  ctx.value.beginPath();
  ctx.value.strokeStyle = currentColor.value;
  ctx.value.lineWidth = penSize.value;

  switch (drawingTool.value) {
    case "line":
      ctx.value.moveTo(startX, startY);
      ctx.value.lineTo(currentX, currentY);
      break;
    case "circle":
      let radius = Math.sqrt(
        Math.pow(startX - currentX, 2) + Math.pow(startY - currentY, 2)
      );
      ctx.value.arc(startX, startY, radius, 0, 2 * Math.PI);
      break;
    case "square":
      //const width = currentX - startX;
      //const height = currentY - startY;
      //ctx.value.rect(startX, startY, width, height);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      const cornerRadius = 10; // 设置圆角的半径
      if (width && height) {
        ctx.value.moveTo(startX + cornerRadius, startY);
        ctx.value.arcTo(startX + width, startY, startX + width, startY + height, cornerRadius);
        ctx.value.arcTo(startX + width, startY + height, startX, startY + height, cornerRadius);
        ctx.value.arcTo(startX, startY + height, startX, startY, cornerRadius);
        ctx.value.arcTo(startX, startY, startX + width, startY, cornerRadius);
        ctx.value.closePath();
      }
      break;
    case "arrow":
      drawArrow(ctx.value, startX, startY, currentX, currentY);
      break;
  }
  ctx.value.stroke();
  ctx.value.closePath();
}

// 停止绘图
function stopDrawing(e) {
  showTool.value = true;

  if (drawingTool.value === "pencil" || drawingTool.value === "eraser") {
    if (isDrawing.value) {
      isDrawing.value = false;
    } else {
      return;
    }
    ctx.value.closePath();
    drawHistory.value.push(
      ctx.value.getImageData(0, 0, canvas.value.width, canvas.value.height)
    );
  } else if (
    ["line", "circle", "square", "arrow"].includes(drawingTool.value)
  ) {
    if (isDrawing.value) {
      isDrawing.value = false;
    } else {
      return;
    }
    ctx.value.beginPath();
    ctx.value.strokeStyle = currentColor.value;
    ctx.value.lineWidth = penSize.value;

    let currentX = e.offsetX;
    let currentY = e.offsetY;
    switch (drawingTool.value) {
      case "line":
        ctx.value.moveTo(startX, startY);
        ctx.value.lineTo(currentX, currentY);
        break;
      case "circle":
        let radius = Math.sqrt(
          Math.pow(startX - currentX, 2) + Math.pow(startY - currentY, 2)
        );
        ctx.value.arc(startX, startY, radius, 0, 2 * Math.PI);
        break;
      case "square":
        // const width = currentX - startX;
        // const height = currentY - startY;
        // ctx.value.rect(startX, startY, width, height);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);
        const cornerRadius = 10; // 设置圆角的半径
        if (width && height) {
          ctx.value.moveTo(startX + cornerRadius, startY);
          ctx.value.arcTo(startX + width, startY, startX + width, startY + height, cornerRadius);
          ctx.value.arcTo(startX + width, startY + height, startX, startY + height, cornerRadius);
          ctx.value.arcTo(startX, startY + height, startX, startY, cornerRadius);
          ctx.value.arcTo(startX, startY, startX + width, startY, cornerRadius);
          ctx.value.closePath();
        }
        break;
      case "arrow":
        // 简化的箭头绘制逻辑
        drawArrow(ctx.value, startX, startY, currentX, currentY);
        break;
    }
    ctx.value.stroke();
    ctx.value.closePath();
    drawHistory.value.push(
      ctx.value.getImageData(0, 0, canvas.value.width, canvas.value.height)
    );
  }
}

function drawArrow(context, fromx, fromy, tox, toy) {
  var headlen = 10; // 箭头头部的长度
  var dx = tox - fromx;
  var dy = toy - fromy;
  var angle = Math.atan2(dy, dx);
  context.moveTo(fromx, fromy);
  context.lineTo(tox, toy);
  context.lineTo(
    tox - headlen * Math.cos(angle - Math.PI / 6),
    toy - headlen * Math.sin(angle - Math.PI / 6)
  );
  context.moveTo(tox, toy);
  context.lineTo(
    tox - headlen * Math.cos(angle + Math.PI / 6),
    toy - headlen * Math.sin(angle + Math.PI / 6)
  );
}

// 选择工具
function setTool(tool) {
  drawingTool.value = tool;
  if (tool === "text") {
    showTextInput.value = true;
    nextTick(() => {
      textInput.value.style.left = `${textPosition.value.x}px`;
      textInput.value.style.top = `${textPosition.value.y}px`;
    });
  } else {
    showTextInput.value = false;
  }
}

function updateTextOnCanvas() {
  ctx.value.clearRect(0, 0, canvas.value.width, canvas.value.height);
  redrawCanvas(); // 重新绘制历史图形，确保文本之上没有其他图形
  ctx.value.font = "16px Arial";
  ctx.value.fillStyle = currentColor.value;

  // 添加一个垂直位置的偏移量，这里以字体的大小为参考，通常字体大小的一半可以作为偏移量
  const baselineOffset = 16; // 根据16px字体大小计算，可以根据需要调整

  ctx.value.fillText(
    inputText.value,
    textPosition.value.x,
    textPosition.value.y + baselineOffset
  );
  drawHistory.value.push(
    ctx.value.getImageData(0, 0, canvas.value.width, canvas.value.height)
  );
}

// 颜色
const changeColor = (val) => {
  currentColor.value = val;
};

const handlePenSizeChange = (val) => {
  penSize.value = val;
};

const handlePenSizeChange2 = (val) => {
  eraserSize.value = val;
};

// 撤销操作
function undo() {
  if (drawHistory.value.length > 0) {
    const lastImageData = drawHistory.value.pop();
    undoStack.value.push(lastImageData);
    redrawCanvas();
  } else {
    ElMessage.warning("无法继续撤销");
  }
}

// 重做操作
function redo() {
  if (undoStack.value.length > 0) {
    const nextImageData = undoStack.value.pop();
    drawHistory.value.push(nextImageData);
    redrawCanvas();
  } else {
    ElMessage.warning("无法继续重做");
  }
}

// 清空画布
function clearCanvas() {
  ctx.value.clearRect(0, 0, canvas.value.width, canvas.value.height);
  drawHistory.value = [];
  undoStack.value = [];
  redoStack.value = [];
}

// 重新绘制画布
function redrawCanvas() {
  ctx.value.clearRect(0, 0, canvas.value.width, canvas.value.height);
  drawHistory.value.forEach((imageData) => {
    ctx.value.putImageData(imageData, 0, 0);
  });
}

const saveCanvas = () => {
  nextTick(() => {
    let node = document.getElementById("canvasDOM");
    domtoimage
      .toBlob(node)
      .then((blob) => {
        try {
          const item = new ClipboardItem({ "image/png": blob });
          navigator.clipboard
            .write([item])
            .then(() => {
              console.log("图片已复制到剪贴板");
              ElMessage.success("图片已复制到剪贴板");
            })
            .catch((error) => {
              console.error("复制到剪贴板失败", error);
            });
        } catch (error) {
          console.error("剪贴板操作失败", error);
        }
      })
      .catch((error) => {
        console.error("生成图片失败", error);
      });
  });
};
</script>
<style scoped>
.canvas {
  width: 100%;
  height: 750px;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
  position: relative;
}

.Head-tool {
  width: 240px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-around;
  position: absolute;
  top: 18px;
  right: 390px;
  border-radius: 10px 10px;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
  background: #fbfdff;
}

.Right-tool {
  width: 150px;
  /* height: 300px; */
  /* background: yellow; */
  background: #fbfdff;
  position: absolute;
  top: 166px;
  right: 14px;
  border-radius: 10px 10px;
  display: flex;
  flex-direction: column;
  /* justify-content: space-between; */
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
  align-items: center;
}

.button-size {
  width: 20px !important;
  height: 20px !important;
}

.button-form {
  width: 20px !important;
  height: 20px !important;
  border: none !important;
  margin-left: 5px !important;
}

input {
  z-index:999;
  position: absolute;
  left: 0;
  top: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  border: none;
  outline: none;
  font-size: 16px;
  font-family: Arial;
}
</style>