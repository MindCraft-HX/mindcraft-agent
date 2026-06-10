import api from "@/utils/request";

// 更新用户数据
export const getUserProfile = ()=>{
    return api.get("/llm/get_user_profile/?url_version=1.1/");
};
//获取用户信息
export const getUserProfileNew = () => {
  return api.get(`/llm/user_profile/`);
};
// 上传头像
export const postUploadAvatar = (data)=>{
    return api.post(`/llm/upload_avatar/`,data,{})
}
// 绑定微信
export const postLlmBindWeb = (data)=>{
   return api.post(`/llm/bing_web/`,data)
}
// 修改用户信息
export const postModifyUserProfile = (data)=>{
   return api.post(`/llm/modify_user_profile/`,data)
}