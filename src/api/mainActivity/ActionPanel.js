import api from "@/utils/request";

//收藏List
export const getFavoriteMessages = ()=>{
    return api.get(`/llm/get_favorite_messages_by_owner/`);
};
//修改收藏List
export const putFavoriteMessages = (id,data)=>{
    return api.put(`/llm/update_favorite_message/${id}`,data);
};
//删除收藏List
export const removeFavoriteMessages = (id)=>{
    return api.delete(`/llm/delete_favorite_message/${id}`);
};
//把收藏的添加到预设指令
export const addInstructionPrompt= (data)=>{
    return api.post(`llm/create_instruction_prompt/`,data)
};