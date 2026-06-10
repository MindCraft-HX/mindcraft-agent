export function useFileType() {
  const mediaType = async(mediaPath) => {
    let mimeType = '';
    await fetch(mediaPath)
    .then(response => {
      mimeType = response.headers.get('Content-Type');
    })
    .catch(error => {
      console.error('获取文件 MIME 类型失败:', error);
    });
    console.log('MIME 类型:', mimeType);
    return mimeType
  }
  const isImage = (mediaPath) => {
    const imageRegex = /\.(png|jpg|jpeg|gif|webp|bmp|svg|image)$/i;
    return imageRegex.test(mediaPath.replace(/\?.*$/, ''));
  }
  const isVideo = (mediaPath) => {
    const videoRegex = /\.(mp4|webm|ogg|avi|mov|mkv)$/i;
    return videoRegex.test(mediaPath.replace(/\?.*$/, ''));
  }
  return {
    mediaType,
    isImage,
    isVideo
  }
}