export function isString(arg) {
    return Object.prototype.toString.call(arg) == "[object String]";
}
export function isNumber(arg) {
    return (
        Object.prototype.toString.call(arg) == "[object Number]" &&
        /[\d\.]+/.test(String(arg))
    );
}
export function isUndefined(arg) {
    return arg === void 0;
}
export function isBoolean(arg) {
    return Object.prototype.toString.call(arg) === "[object Boolean]";
}
export function isFunction(arg) {
    if (!arg) {
        return false;
    }
    var type = Object.prototype.toString.call(arg);
    return type == "[object Function]" || type == "[object AsyncFunction]";
}
export function isArray(arg) {
    if (Array.isArray && isFunction(isArray)) {
        return Array.isArray(arg);
    }
    return Object.prototype.toString.call(arg) === "[object Array]";
}
export function isObject(arg) {
    if (arg == null) {
        return false;
    } else {
        return Object.prototype.toString.call(arg) == "[object Object]";
    }
}

// 反序列化字符串数组
export function string2Arr(text) {
	if(text && isString(text) && /^\[.*\]$/.test(text)) {
		return JSON.parse(text)
	}
	return []
}

/**
 *  @desc 格式化时间
 * @params { string } sec = 当前时间 - 时间戳, 单位s
 * @params { number } type = 0 - 格式化类型, 0 显示全年月日, 用.分隔, 1 显示全年月日, 用 - 分隔, 2 显示 昨天今天, 用-分隔, 3 显示月日,用.分隔 
 * @params { number } showTime = 0 - 是否显示时分, 1 显示， 0 不显示
 * @params { number } showSecond = 0 - 是否显示秒, 1 显示， 0 不显示
 */
export function formatDate (sec = (+new Date() + '').slice(0, -3), type = 1, showTime = 1, showSecond = 1) {
	let date = new Date(+(sec + '000'));
	let year = date.getFullYear();
	let month = date.getMonth() + 1;
	let day = date.getDate();
	let hour = date.getHours();
	let min = date.getMinutes();
	let second = date.getSeconds();
	let today = new Date();
	let yesterday = new Date(+new Date() - 86400000);
	let dateStr = '';
	let separator = '.';
	if (type == 1 || type == 3) {
		separator = '-';
	}
	if (date.toDateString() == today.toDateString() && type == 2) {
		dateStr += '今天'
	} else if (date.toDateString() == yesterday.toDateString() && type == 2) {
		dateStr += '昨天'
	} else {
		if (month <= 9) {
			month = '0' + month;
		}
		if (day <= 9) {
			day = '0' + day;
		}
		if (type == 2) {
			if (year != today.getFullYear()) {
				dateStr += year + separator;
			}
		} else if(type == 3){

		} else {
			dateStr += year + separator;
		}
		dateStr += month + separator + day + ' '
	}
	if (showTime) {
		if (hour <= 9) {
			hour = '0' + hour;
		}
		if (min <= 9) {
			min = '0' + min;
		}
		if (second <= 9) {
			second = '0' + second;
		}
		dateStr += hour + ':' + min;
		if (showSecond) {
			dateStr += ':' + second;
		}
	}
	return dateStr;
}

// 判断文件类型
export function fileType(str) {
	const videoRegex = /(\mp4|\avi|\mkv)$/i
	const imgRegex = /(\jpg|\jpeg|\png|\gif|\webp)$/i;
	if(videoRegex.test(str)) return "video"
	if(imgRegex.test(str)) return "img"
	return false
}

export function uuid32() {
    var s = [];
    var hexDigits = "0123456789abcdef";
    for (var i = 0; i < 32; i++) {
        s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
    }
    s[14] = "4"; // bits 12-15 of the time_hi_and_version field to 0010
    s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1); // bits 6-7 of the clock_seq_hi_and_reserved to 01
    s[8] = s[13] = s[18] = s[23];
    var uuid = s.join("");
    return uuid;
}