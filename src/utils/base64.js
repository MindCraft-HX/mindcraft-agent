import { isoContours } from 'marching-squares'; // ES6 模块化
/**
 * 获取图片的格式
*/
export function getImageType(file) {
  //  获取后缀
  let res = ''
  if (file.startsWith('file://') || file.startsWith('http')) {
    res = file.split('.').pop();
  } else if (file.startsWith('data:image/')) {
    res = file.split(';')[0].split('/')[1];
  } else {
    res = 'png';
  }
  if (res === 'jpg') {
    res = 'jpeg'
  }
  return res;
}
/**
 *把图片转成base64
 * 
*/
export function getBase64FromImage(image) {
  return new Promise((resolve, reject) => {
    let type = getImageType(image.src)
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    ctx.drawImage(image, 0, 0);
    const res = canvas.toDataURL(`image/${type}`)
    return resolve(res);
  })
}
/***
 * 把 canvas的涂鸦转成黑白图片，涂鸦区为白色，没有涂鸦为黑色
 * */
export function generateMask(canvas, targetWidth = canvas.width, targetHeight = canvas.height, dataType = 'base64') {
  //  异步处理防止阻塞
  return new Promise((resolve, reject) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data; // 包含 RGBA 的 Uint8Array
    // 2. 遍历每个像素（每4个元素表示一个像素的RGBA）
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3]; // Alpha通道（透明度）
      if (alpha > 20) {
        // 涂鸦区域（有透明度）：设置为白色
        data[i] = 255;     // R
        data[i + 1] = 255; // G
        data[i + 2] = 255; // B
        data[i + 3] = 255; // A（不透明）
      } else {
        // 背景区域：设置为黑色
        data[i] = 0;       // R
        data[i + 1] = 0;   // G
        data[i + 2] = 0;   // B
        data[i + 3] = 255; // A（不透明）
      }
    }
    // 创建临时Canvas保存处理后的图像数据（原尺寸）
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(imageData, 0, 0);
    // 创建目标Canvas进行缩放
    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = targetWidth;
    scaledCanvas.height = targetHeight;
    const scaledCtx = scaledCanvas.getContext('2d');

    // 将临时Canvas的内容缩放到目标Canvas
    scaledCtx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height, 0, 0, targetWidth, targetHeight);
    if (dataType === 'base64') {
      // 导出为 Base64格式
      const base64 = scaledCanvas.toDataURL('image/png');
      resolve(base64)
    } else if (dataType === 'imageData') {
      //  导出ImageData格式
      let data = scaledCtx.getImageData(0, 0, targetWidth, targetHeight)
      resolve(data)
    }

  });
}

/**
 * base64通过marching-squares算法得到轮廓数据
 * ***/
export function base64ToFabricPaths(base64, callback) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = base64;

  img.onload = () => {
    // 创建临时 Canvas 处理像素
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    // 获取像素数据
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const borderImageData = addImageBorder(imageData.data, imageData.width, imageData.height);
    const grid = imageDataToGrid(borderImageData.data, borderImageData.width, borderImageData.height);
    const paths = isoContours(grid, [255]); // marching-squares算法计算出轮廓数据
    callback(paths, borderImageData.width, borderImageData.height);
  };
}

/**
 * 给图片添加黑边，为了处理边界问题，添加边界后，始终是白色（255）在轮廓内。
 * */
function addImageBorder(pixelData, width, height) {
  const borderedWidth = width + 2;
  const borderedHeight = height + 2;
  const newData = new Uint8ClampedArray(borderedWidth * borderedHeight * 4);

  // 填充白色边框
  newData.fill(0); // RGBA全设为0（黑色）
  // 复制原数据到中心
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = ((y + 1) * borderedWidth + (x + 1)) * 4;
      newData.set(pixelData.slice(srcIdx, srcIdx + 4), dstIdx);
    }
  }
  return { data: newData, width: borderedWidth, height: borderedHeight };
}
/**
 * 将 Uint8ClampedArray 转换为二维数组
 * */
function imageDataToGrid(imageData, width, height) {
  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // 取 R 通道作为灰度值（可根据需求调整）
      row.push(imageData[idx]);
    }
    grid.push(row);
  }
  return grid;
}

/**
 * 使用原图和黑白遮罩生成透明背景的抠图（白色保留，黑色透明）
 * @param {HTMLImageElement} originalImage 原图
 * @param {ImageData} maskData 遮罩图数据
 * @returns {Promise<string>} 返回Base64格式的PNG图片
 */
export function createMaskedImage(originalImage, maskData) {
  return new Promise((resolve, reject) => {
    // 创建画布
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    // 设置画布尺寸与原图一致
    canvas.width = originalImage.naturalWidth;
    canvas.height = originalImage.naturalHeight;
    // 绘制原图
    ctx.drawImage(originalImage, 0, 0);
    // 获取原图像素数据
    const originalData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const originalPixels = originalData.data;
    // 获取遮罩像素数据
    const maskPixels = maskData.data;
    // 混合处理
    for (let i = 0; i < originalPixels.length; i += 4) {
      // 从遮罩中获取灰度值（R=G=B，取R通道）
      //  如果为黑色，则将透明度设置为0
      let r = maskPixels[i];
      let g = maskPixels[i + 1];
      let b = maskPixels[i + 2];
      if (r === 0 && g === 0 && b === 0) {
        originalPixels[i + 3] = 0;
      } else {
        // 从遮罩中获取灰度值（R=G=B，取R通道）
        const maskValue = maskPixels[i]; // 0（黑）到255（白）
        // 根据遮罩值调整原图的透明度
        originalPixels[i + 3] = maskValue; // 直接使用灰度值作为alpha通道
      }
    }
    // 将处理后的数据写回画布
    ctx.putImageData(originalData, 0, 0);
    // 转换为透明PNG（png才支持透明度）
    resolve(canvas.toDataURL(`image/png`));
  });
}
/**
 * 压缩图片
 * **/ 
export function compressImg(file, quality) {
  var qualitys = 0.52
  if (parseInt((file.size / 1024).toFixed(2)) < 1024) {
    qualitys = 0.85
  }
  if (5 * 1024 < parseInt((file.size / 1024).toFixed(2))) {
    qualitys = 0.92
  }
  if (quality) {
    qualitys = quality
  }
  if (file[0]) {
    return Promise.all(Array.from(file).map(e => this.compressImg(e,
      qualitys))) // 如果是 file 数组返回 Promise 数组
  } else {
    return new Promise((resolve) => {
      if ((file.size / 1024).toFixed(2) < 300) {
        resolve({
          file: file
        })
      } else {
        const reader = new FileReader() // 创建 FileReader
        reader.onload = ({
          target: {
            result: src
          }
        }) => {
          const image = new Image() // 创建 img 元素
          image.onload = async() => {
            const canvas = document.createElement('canvas') // 创建 canvas 元素
            const context = canvas.getContext('2d')
            var targetWidth = image.width
            var targetHeight = image.height
            var originWidth = image.width
            var originHeight = image.height
            if (1 * 1024 <= parseInt((file.size / 1024).toFixed(2)) && parseInt((file.size / 1024).toFixed(2)) <= 10 * 1024) {
              var maxWidth = 2540
              var maxHeight = 1080
              targetWidth = originWidth
              targetHeight = originHeight
              // 图片尺寸超过的限制
              if (originWidth > maxWidth || originHeight > maxHeight) {
                if (originWidth / originHeight > maxWidth / maxHeight) {
                  // 更宽，按照宽度限定尺寸
                  targetWidth = maxWidth
                  targetHeight = Math.round(maxWidth * (originHeight / originWidth))
                } else {
                  targetHeight = maxHeight
                  targetWidth = Math.round(maxHeight * (originWidth / originHeight))
                }
              }
            }
            if (10 * 1024 <= parseInt((file.size / 1024).toFixed(2)) ) {
              maxWidth = 1920
              maxHeight = 1080
              targetWidth = originWidth
              targetHeight = originHeight
              // 图片尺寸超过的限制
              if (originWidth > maxWidth || originHeight > maxHeight) {
                if (originWidth / originHeight > maxWidth / maxHeight) {
                  // 更宽，按照宽度限定尺寸
                  targetWidth = maxWidth
                  targetHeight = Math.round(maxWidth * (originHeight / originWidth))
                } else {
                  targetHeight = maxHeight
                  targetWidth = Math.round(maxHeight * (originWidth / originHeight))
                }
              }
            }
            canvas.width = targetWidth
            canvas.height = targetHeight
            context.clearRect(0, 0, targetWidth, targetHeight)
            context.drawImage(image, 0, 0, targetWidth, targetHeight) // 绘制 canvas
            const canvasURL = canvas.toDataURL('image/png', qualitys)
            const buffer = atob(canvasURL.split(',')[1])
            let length = buffer.length
            const bufferArray = new Uint8Array(new ArrayBuffer(length))
            while (length--) {
              bufferArray[length] = buffer.charCodeAt(length)
            }
            const miniFile = new File([bufferArray], file.name, {
              type: 'image/png'
            })
            resolve({
              file: miniFile,
              origin: file,
              beforeSrc: src,
              afterSrc: canvasURL,
              beforeMB: Number((file.size / 1024/1024).toFixed(2)),
              afterMB: Number((miniFile.size / 1024 /1024).toFixed(2))
            })
          }
          image.src = src
        }
        reader.readAsDataURL(file)
      }
    })
  }
}