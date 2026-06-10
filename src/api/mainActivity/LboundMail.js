import api from "@/utils/request";

/** 站内信
 * //llm/alert/?ordering=-id
 */
export const getLboundMail = (ordering) => {
    return api.get(`/llm/alert/?alert_is_read=${ordering}`);
}

/** 修改状态
 * //llm/alert/118/
 */
export const putAlert = (id,data)=>{
    return api.put(`/llm/alert/${id}/`,data);
}