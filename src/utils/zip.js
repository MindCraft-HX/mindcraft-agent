
// 压缩文件的函数
const compressFile = async (sourcePath, targetPath) => {
  try {
    await compressing.zip.compressDir(sourcePath, targetPath, { zipFileNameEncoding: 'gbk' });
    console.log('compress success');
  } catch (err) {
    console.error('compress fail', err);
  }
};

// 解压缩文件的函数
const uncompressFile = async (sourcePath, targetPath) => {
  try {
    await window.electronAPI.unCompressZipFile(sourcePath, targetPath, 'gbk');
    console.log('uncompress success');
  } catch (err) {
    console.error('uncompress fail', err);
  }
};

export default uncompressFile;
