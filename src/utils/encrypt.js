import CryptoJS from "crypto-js";
import md5 from "js-md5";
import joint from "./prj";

var defaultKey = "khqkzj9ej73b41t6";    /* Do Not Modified it!!! */

function enAesEcb(str, keyStr) {
    keyStr = keyStr ? keyStr : defaultKey;
    var key = CryptoJS.enc.Utf8.parse(keyStr);
    var src = CryptoJS.enc.Utf8.parse(str);
    var ret = CryptoJS.AES.encrypt(src, key, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
    });
    return ret.toString();
}

function deAesEcb(str, keyStr) {
    keyStr = keyStr ? keyStr : defaultKey;
    var key = CryptoJS.enc.Utf8.parse(keyStr);
    var ret = CryptoJS.AES.decrypt(str, key, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7
    });
    return ret.toString(CryptoJS.enc.Utf8);
}

var encrypt = {
    enBinBase64: async (str) => {
        return await joint.BufferConvert(str, 'binary', 'base64');
    },
    deBinBase64: async (str) => {
        return await joint.BufferConvert(str, 'base64', 'binary');
    },
    /**
     * Encode the string from utf8 to base64
     * @param {string} str The utf8 string which be want to be encoded
     * @returns encode result base64 string
     */
    enUtf8Base64: async (str) => {
        return await joint.BufferConvert(str, 'utf8', 'base64');
    },
    /**
     * Decode the string from base64 to utf8
     * @param {string} str The string which be want to be decoded
     * @returns decode result utf8 string
     */
    DeUtf8Base64: async (str) => {
        return await joint.BufferConvert(str, 'base64', 'utf8');
    },
    md5: (str) => {
        return md5(str);
    },
    /**
     * Get the encode data from the json
     * @param {object} obj Json object
     * @returns
     */
    enJson: (obj) => {
        var str = JSON.stringify(obj);
        return enAesEcb(str.toString('utf8')).toString('utf8');
    },
    /**
     * Get the decode json from string
     * @param {string} str The string to decode must be UTF8 encoded
     * @returns The json object
     */
    deJson: (str) => {
        var ret = deAesEcb(str);
        return JSON.parse(ret.toString('utf8'));
    },
    /**
     * Encrypt a file which encoding is utf8
     * @param {string} filePath The path to the file
     * @param {*} data the object to encode
     */
    enFileUtf8: async (filePath, data) => {
		await joint.writeFileSync(filePath, encrypt.enJson(data));
    },
    /**
     * Decrypt a file which encoding is utf8
     * @param {string} filePath The path to the file
     * @returns the data object
     */
    deFileUtf8: async (filePath) => {
		var data = await joint.readFileSync(filePath, {encoding: 'utf8'});
		return encrypt.deJson(data);
    },
}

export default encrypt