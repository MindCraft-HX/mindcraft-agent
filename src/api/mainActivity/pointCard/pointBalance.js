import api from "@/utils/request";

// Echarts
export const getEcharts = (id)=>{
    return api.get(`/llm/inquire_points/day?lately_day=${id}`);
}