import api from "@/utils/request";

/** 用户权限
 * /llm/get_permission
 */
export const  getPermission = (headers)=>{
    return api.get(`/llm/get_permission/`,{ headers: {} })
}

/** 所有模型
 * /llm/model_list/
 */
export const  getModel_list = ()=>{
    return api.get(`/llm/model_list/`)
}
/**
 * 所以模型NEW
 * /llm/model_list_new/
 */

export const  getModel_list_new = ()=>{
    return api.get(`/llm/model_list/`)
}



/** 保存房间属性
 *  /llm/update_room_attributes/${id}/
 */
export const postRoomAttribute = (id,data)=>{
    return api.post(`/llm/update_room_attributes/${id}/`,data)
 }


/**保存文件
 * /llm/upload_processor/
 * 
 */

export const postUploadProcessor = (data)=>{
    return api.post(`/llm/upload_processor/`,data)
}


/** 语音识别
 *  /api/v1/asr/
 */
export const postAsr = (data)=>{
    return api.post(`/v1/asr/`,data)
}

/** 终止流式输出
 * {{host}}/llm/chat/stop/
 */

export const postStop = (stop_redis_key)=>{
    return api.post(`/llm/chat/stop/`,{stop_redis_key})
}