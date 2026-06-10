import api from "@/utils/request";

export const getPointsList = (record_type,model,page,size,min_create,max_create)=>{
    return api.get(`/llm/inquire_points/?record_type=${record_type}&model=${model}&page=${page}&size=${size}&min_create=${min_create}&max_create=${max_create}&ordering=-created_at`);
}   