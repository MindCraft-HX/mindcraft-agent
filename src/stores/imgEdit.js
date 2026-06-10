import { defineStore } from "pinia";
export const useImgEditStore = defineStore("imgEdit", {
  state: () => {
    return {
      showEditorTool: false, //是否显示编辑工具栏
      showDrawTool: false, // 是否显示画图工具栏
      curEditorTool: '', // 当前编辑工具 erase|cut|paint|hd|
      curDrawTool: '', //  当前画笔 brush（画笔） | select（快速选中）| eraser（橡皮擦）
      curDrawSize: 20, // 当前笔刷大笑
      hasPaint: false,// 是否有涂鸦
      isDirtyEdit: false, // 是否触发过编辑
      onCutImgFlag: false, // 触发裁剪标识符
      onSaveImgFlag: false, // 触发保存图片标识符
      onReGenerateImgFlag: false,// 触发重新生成图片标识符
      onEraseImgFlag: false, // 触发消除标识符
      onRepaintImgFlag: false,// 触发局部重绘标识符
      repaintData: { // 局部重绘数据
        prompt: '',
        scale: 7
      },
      onHdImgFlag: false,// 触发高清标识符
      onImgToImgFlag: false,// 触发图片生成标识符
      imgToImgData: {}, // 图生图数据
      loadingMaxStep: 0.1,//进度条单步最大增量默认增量0.1
      mediaPath: '', // 当前图片
      disabledDrawTool: false, // 是否禁用画图工具栏
      newAddTimes:[],// 新增图片列表
    }
  }
});
