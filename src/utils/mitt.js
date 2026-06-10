import mitt from 'mitt'

const mittInstance = mitt()

export function useMitt() {
  return mittInstance
}


// 使用函数方式

// mitt.on('fetchLibraryList',()=>{
//   fetchLibraryList()  这个是函数
// });

// 调用
// mitt.emit('fetchLibraryList')


// 使用 传递ref的话
// mitt.emit('xxxx自定义名字'，xxxx数据)
// mitt.on('xxxx自定义名字',(数据)=>{ console.log(data) })
