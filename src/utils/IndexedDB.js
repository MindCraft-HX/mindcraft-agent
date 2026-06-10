import { openDB } from "idb";

const dbPromise = openDB("file-database", 3, {
  upgrade(db) {
    if (!db.objectStoreNames.contains("uploaded-files-store")) {
      db.createObjectStore("uploaded-files-store");
    }
  },
});

//添加
export async function addData(files) {
  const db = await openDB("file-database", 3, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("uploaded-files-store")) {
        db.createObjectStore("uploaded-files-store");
      }
    },
  });
  const dataToStore = JSON.parse(JSON.stringify(files));

  // 存储更新后的数组
  await db.put("uploaded-files-store", dataToStore, "files");
  console.log("数据已添加");
}

// 获取数据
export async function getData() {
  const db = await openDB("file-database", 3);
  const data = await db.get("uploaded-files-store", "files");
  // console.log("获取的数据:", data);
  return data;
}

// 根据ID删除文件
export async function deleteFileById(id) {
  const db = await dbPromise;
  const tx = db.transaction("uploaded-files-store", "readwrite");
  const store = tx.objectStore("uploaded-files-store");
  const data = await store.get("files");
  if (Array.isArray(data)) {
    const newData = data.filter((item) => item.id !== id);
    store.put(newData, "files");
  }
  await tx.done;
}
