import api from "@/utils/request";

export const getPointsRecordList = (data)=>{
    return api.post('/llm/points_record/',data)
};