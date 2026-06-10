import encrypt from "./encrypt";

const keys = {
    /** 编译工程的系统, 临时文件夹 */
    tempBuildingProjectPath: 'tempBuildLibProjectPath',
    verCodeTime: 'verCodeTime',
};
/**
 * 数据加密保存到本地
 */
const storage = {
    getKeys() {
        return keys;
    },
    save(key, object) {
        window.localStorage.setItem(key, encrypt.enJson(object));
    },
    load(key) {
        var str = window.localStorage.getItem(key);

        if (str) {
            return encrypt.deJson(str);
        }
        return null;
    },
}

export default storage;