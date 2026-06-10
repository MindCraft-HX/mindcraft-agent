import api from "@/utils/request";

//获取知识库信息 列表
export const getLibraryList = ( size, page,index_name,ordering) => {
    return api.get(
        `llm/get_library_list/?size=${size}&page=${page}&index_name=${index_name}&ordering=${ordering}`
    );
};
//关注回显 用户信息
export const getUserProfile = () => {
    return api.get("/llm/get_user_profile/");
};
//关注或取消关注
export const postFollowLibrary = (id) => {
    return api.post(`/llm/follow_library/${id}/`);
};

//获取知识库列表 我的
export const myLibraryList = () => {
    return api.get(`/llm/get_library_list_by_user/`);
};
//编辑知识库
export const modifyLibraryList = (id, data) => {
    return api.post(`llm/modify_library/${id}/`, data);
};
//查询知识库
export const getLibraryById = (id) => {
    return api.get(`llm/library_detail/${id}/`);
};
//删除知识库
export const RemoveLibraryList = (id) => {
    return api.delete(`llm/delete_library/${id}/`);
};
//创建知识库
export const addCreateLibrary = (data) => {
    return api.post("llm/create_library/", data, {
        headers: {
            "Content-Type": "multipart/form-data",
        },
    });
};
