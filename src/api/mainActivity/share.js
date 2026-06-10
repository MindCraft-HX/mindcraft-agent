import api from "@/utils/request";

// 创建分享(分享码)
export const postShareObject = (data)=>{
    return api.post("/share/object/", data)
};

// 获取激活用户
export const getShareUserCode = (data)=>{
    return api.get(`/share/user_code/?size=${data.size}&page=${data.page}`)
};