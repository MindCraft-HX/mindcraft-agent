import api from "@/utils/request";

// 获取房间
export const RoomList = ()=>{
    return api.get("llm/get_room_list/")
};
// 获取房间
export const RoomListPaging = (data)=>{
    return api.get(`llm/room_list/?size=${data.size}&page=${data.page}`)
};
// 新增房间
export const AddRoom = (data)=>{
    return api.post("llm/add_room/",data)
};
// 重命名房间名
export const ModifyRoom = (id,data)=>{
   return api.post(`llm/modify_room/${id}/`,data)
};
//删除房间
export const RemoveRoom = (id)=>{
    return api.delete(`llm/delete_room/${id}/`)
};
//新增房间 缓存默认数据
export const DefaultCache = (id,data)=>{
   return api.post(`/llm/update_room_attributes/${id}/`,data)
}
// 房间名生成
export const postCreateRoomName = (data)=>{
   return api.post(`/v1/agent/create_room_name/`,data)
}