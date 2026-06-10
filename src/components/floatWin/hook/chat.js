import api from "@/utils/request";
import {cancelRequest} from '@/utils/request';

export function useSend() {
  const sendMessage = async (messageInfo = {}, cb) => {
    console.log(messageInfo)
    if(!messageInfo.model) {
      return null
    }
    if(messageInfo.func_type === "translate" && !messageInfo.target_language) {
      return null
    }
    let formData = new FormData();
    formData.append("model", messageInfo.model)
    formData.append("func_type", messageInfo.func_type)
    formData.append("selected_text", messageInfo.selected_text)
    formData.append("target_language", messageInfo.target_language)
    formData.append("user_query", messageInfo.user_query)
    if(messageInfo.screenshot) {
      formData.append("screenshot", base64ToArrayBuffer(messageInfo.screenshot), 'screenshot.png')
    }

    await api.post("/v1/agent/spotup_window/", formData, {
      responseType: "stream",
      // headers: { 'Accept': "text/json", "Content-Type": "multipart/form-data" },
      // context: getContext(this),
      onDownloadProgress: (progressEvent) => {
        const chunk = progressEvent.event.currentTarget.response
        const data = chunk.split(/\n\n/g).map(i => i.split("data:")[1]).filter(i => i)
        cb(data)
      }
    })
  }
  const abortRequest = () => {
    cancelRequest();
  }
  return {
    sendMessage,
    abortRequest
  }
}

import { addRoom } from "@/api/application/flowWin"
export function useAddRoom() {
  const temporaryChatAddRoom = async (roomInfo = {}) => {
    let formData = new FormData();
    formData.append("room_name", roomInfo.room_name)
    formData.append("llm_model", roomInfo.llm_model)
    formData.append("selected_text", roomInfo.selected_text)
    formData.append("assistant", roomInfo.assistant)
    if(roomInfo.screenshot) {
      formData.append("screenshot", base64ToArrayBuffer(roomInfo.screenshot), 'screenshot.png')
    }
    return await addRoom(formData)
  }
  return {
    temporaryChatAddRoom
  }
}

/**
 * 将Base64编码的字符串转换为ArrayBuffer
 * @param {string} base64 - Base64编码的字符串
 * @returns {ArrayBuffer} - 转换后的ArrayBuffer
 */
function base64ToArrayBuffer(base64) {
  console.log({'base64ToArrayBuffer': base64})
  // 移除Base64字符串中的URL前缀（如果有）
  base64 = base64.replace(/^data:image\/\w+;base64,/, "");

  // 将Base64字符串转换为二进制字符串
  const binaryString = atob(base64);
  
  // 创建一个长度为二进制字符串长度的ArrayBuffer
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  
  // 将每个字符的ASCII码值存入Uint8Array
  for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
  }
  
  console.log({'bytes': bytes})
  // 返回ArrayBuffer
  return new Blob([bytes], { type: 'image/png' });
}