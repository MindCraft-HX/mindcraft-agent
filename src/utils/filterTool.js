// 去除mermaid
export function extractMermaidCode(text) {
  const startMarker = '```mermaid';
  const endMarker = '```';
  const startIndex = text.indexOf(startMarker);
  const endIndex = text.indexOf(endMarker, startIndex + startMarker.length);
  
  if (startIndex === -1 || endIndex === -1) {
      return null; // 未找到`mermaid`代码段
  }

  const mermaidCode = text.substring(startIndex + startMarker.length, endIndex).trim();
  return mermaidCode;
};

// export function extractJsMindCode(text) {
//   const startMarker = '```json';
//   const endMarker = '```';
//   const startIndex = text.indexOf(startMarker);
//   const endIndex = text.indexOf(endMarker, startIndex + startMarker.length);

//   if (startIndex === -1 || endIndex === -1) {
//       return null;
//   }

//   const mermaidCode = text.substring(startIndex + startMarker.length, endIndex).trim();
//   return mermaidCode;
// };
export function extractJsMindCode(text) {
const startMarker = '```json';
const endMarker = '```';
const startIndex = text.indexOf(startMarker);
const endIndex = text.indexOf(endMarker, startIndex + startMarker.length);

if (startIndex !== -1 && endIndex !== -1) {
  // 如果找到了标记，提取标记之间的内容
  return text.substring(startIndex + startMarker.length, endIndex).trim();
} else {
  // 如果没有找到标记，假设整个文本就是 JSON 数据
  return text.trim();
}
};

export function extractEChartsCode(text) {
  const startMarker = '```json';
  const endMarker = '```';
  const startIndex = text.indexOf(startMarker);
  const endIndex = text.indexOf(endMarker, startIndex + startMarker.length);

  if (startIndex !== -1 && endIndex !== -1) {
    // 如果找到了标记，提取标记之间的内容
    return text.substring(startIndex + startMarker.length, endIndex).trim();
  } else {
    // 如果没有找到标记，假设整个文本就是 JSON 数据
    return text.trim();
  }
};


export function extractMarkdownCode(text) {
const startMarker = '```markdown';
const endMarker = '```';
const startIndex = text.indexOf(startMarker);
const endIndex = text.indexOf(endMarker, startIndex + startMarker.length);

if (startIndex === -1 || endIndex === -1) {
    return null; // 未找到`mermaid`代码段
}

const mermaidCode = text.substring(startIndex + startMarker.length, endIndex).trim();
return mermaidCode;
};


//显示什么流程图
export const chartTypeForMessage = (messageContent) => {
  if (messageContent.includes('```mermaid\ngraph TD')) {
    return '流程图';
  } else if (messageContent.includes('```mermaid\nsequenceDiagram')) {
    return '时序图';
  } else if(messageContent.includes('```mermaid\ngantt')) {
    return '甘特图';
  }else if(messageContent.includes('```mermaid\gantt')) {
    return '甘特图';
  }else if(messageContent.includes('```mermaid\classDiagram')){
    return '类图';
  }else if(messageContent.includes('```mermaid\gitGraph')){
    return 'Git图';
  }else if(messageContent.includes('```mermaid\erDiagram')){
    return '实体关系图';
  }else if(messageContent.includes('```mermaid\journey')){
    return '用户旅程图';
  }else if(messageContent.includes('```mermaid\quadrantChart')){
    return '象限图';
  }else if(messageContent.includes('```mermaid\pietitleNETFLIX')){
    return 'XY图表';
  }else if(messageContent.includes('```mermaid\ngraph LR')){
    return '流程图';
  }else{
    return '图表';
  };
};


// export function extractJsMindCode(text) {
//   const startMarker = '```json';
//   const endMarker = '```';
//   const startIndex = text.indexOf(startMarker);
//   const endIndex = text.indexOf(endMarker, startIndex + startMarker.length);

//   if (startIndex !== -1 && endIndex !== -1) {
//     // 如果找到了标记，提取标记之间的内容
//     return text.substring(startIndex + startMarker.length, endIndex).trim();
//   } else {
//     // 如果没有找到标记，假设整个文本就是 JSON 数据
//     return text.trim();
//   }
// };



export function extractMarkmapLibCode(text) {
  const startMarker = '```json';
  const endMarker = '```';
  const startIndex = text.indexOf(startMarker);
  const endIndex = text.indexOf(endMarker, startIndex + startMarker.length);

  if (startIndex !== -1 && endIndex !== -1) {
    // 如果找到了标记，提取标记之间的内容
    return text.substring(startIndex + startMarker.length, endIndex).trim();
  } else {
    // 如果没有找到标记，假设整个文本就是 JSON 数据
    return text.trim();
  }
};


/*处理聊天格式************************************************************************************************************* */

export function getStraightAnswerContent(content) {
let result = '';
let inTag = false;
const lines = content?.split('\n') || "";
for (let line of lines) {
  if (line.includes('<straightAnswer>') || line.includes('<webSearch>') || line.includes('<generatePicture>') || line.includes('<recognitionPicture>') || line.includes('<generateChart>')) {
    inTag = true;
    line = line.replace('<straightAnswer>', '').replace('<webSearch>', '').replace('<generatePicture>', '').replace('<recognitionPicture>', '').replace('<generateChart>', '');
  } else if (line.includes('</straightAnswer>') || line.includes('</webSearch>') || line.includes('</generatePicture>') || line.includes('</recognitionPicture>') || line.includes('</generateChart>')) {
    inTag = false;
    line = line.replace('</straightAnswer>', '').replace('</webSearch>', '').replace('</generatePicture>', '').replace('</recognitionPicture>', '').replace('</generateChart>', '');
  } else if (inTag) {
    result += line + '\n';
  }
}
return result.trim();
}
export function getPlainContent(content) {
let result = '';
let inInitialRecoveryTag = false;
let inSpecialTag = false;
const lines = content?.split('\n') || "";
for (let line of lines) {
  if (line.includes('<InitialRecovery>')) {
    inInitialRecoveryTag = true;
  }
  if (line.includes('</InitialRecovery>')) {
    inInitialRecoveryTag = false;
    continue;
  }
  line = line.replaceAll('<think>', '<details><summary class="open-think">思考过程（点击展开）</summary><div class="think-value">')
  line = line.replaceAll('</think>', '</div></details>')
  if (line.includes('<straightAnswer>') || line.includes('<webSearch>') || line.includes('<generatePicture>') || line.includes('<recognitionPicture>') || line.includes('<generateChart>')) {
    inSpecialTag = true;
  }
  if (line.includes('</straightAnswer>') || line.includes('</webSearch>') || line.includes('</generatePicture>') || line.includes('</recognitionPicture>') || line.includes('</generateChart>')) {
    inSpecialTag = false;
    continue;
  }
  if (!inInitialRecoveryTag && !inSpecialTag) {
    result += line + '\n';
  }
}
return result.trim();
}