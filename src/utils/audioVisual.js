export default class AudioVisual {
    constructor(options) {
        this.container = options.container || document.body
        this.width = window.getComputedStyle(this.container).width.replace('px', '')
        this.height = window.getComputedStyle(this.container).height.replace('px', '')
        this.globalAngle = 0;
        this.canvas = null
        this.ctx = null

        this.ac = new AudioContext()
        this.analyser = this.ac.createAnalyser()
        this.analyser.fftSize = options.fftSize || 256
        this.analyser.connect(this.ac.destination)

        this.sourceDuration = 0
        this.startTime = 0
        this.loading = false
        this.mediaRecorder = null
        this.recordedChunks = []
        this.audioBlob = null
        this.isRecord = false

        this.defaultSetting = {
            centerX: 0.5,
            centerY: 0.7,
            lineWidth: 6,
            lineSpacing: 2,
            lineColor: '#409EFF',
            lineColorO: 1,
            shadowColor: '#fff',
            shadowColorO: 1,
            shadowBlur: 2,
            isRound: true,
            style: '',
            fftSize: 256,
            isCreateAudio: false,//  是否需要初始化Audio  
        }

        this.opt = Object.assign({}, this.defaultSetting, options)

        this.initCanvas()
        this.resizeCavnas()
        if (this.opt.isCreateAudio) {
            this.initAudio()
        }
    }

    colorToRGB(color) {
        if (color.length !== 7 && !color.startsWith('#')) return [0, 0, 0]
        let rgb = []
        color = color.replace('#', '')
        for (let i = 0; i < 3; i++) {
            rgb.push(parseInt(color.substring(i * 2, i * 2 + 2), 16))
        }
        return rgb
    }
    initCanvas() {
        this.canvas = document.createElement('canvas')
        this.canvas.width = this.width
        this.canvas.height = this.height
        this.ctx = this.canvas.getContext('2d')
        this.container.appendChild(this.canvas)
        console.log(this.container)
    }

    resizeCavnas() {
        const { canvas } = this
        this.cw = canvas.width = canvas.clientWidth
        this.ch = canvas.height = canvas.clientHeight
    }

    //  初始化录音
    initAudio() {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                // 初始化 MediaRecorder
                this.mediaRecorder = new MediaRecorder(stream);
                // 将麦克风流连接到 Web Audio API
                this.source = this.ac.createMediaStreamSource(stream);
                this.source.connect(this.analyser);
                this.analyser.connect(this.ac.destination);
                // 确保 AudioContext 处于运行状态
                if (this.ac.state !== 'running') {
                    this.ac.resume().then(() => {
                        console.log('AudioContext resumed.');
                    }).catch(err => {
                        console.error('Failed to resume AudioContext:', err);
                    });
                }

                // 当录制片段生成时，将其存储到 recordedChunks 中
                this.mediaRecorder.ondataavailable = event => {
                    console.log(event.data, 'event.data')
                    if (event.data.size > 0) {
                        this.recordedChunks.push(event.data);
                        this.audioBlob = new Blob(this.recordedChunks, { type: "audio/wav" });
                    }
                };
                // 当录制完成时，合并所有片段并生成 Blob
                this.mediaRecorder.onstop = () => {
                };
            })
            .catch(err => console.error("Error accessing microphone:", err));
    }
    start() {
        if (!this.mediaRecorder) {
            console.log('找不到mediaRecorder')
            return
        }
        if (this.mediaRecorder.state === 'inactive') {
            this.recordedChunks = []; // 清空已录制的片段
            // this.mediaRecorder.start();
            this.isRecord = true
            //    // 延迟绘制波形
            setTimeout(() => {
                this.refreshUI();
            }, 100); // 延迟 100 毫秒
            console.log("Recording started...");
        } else {
            console.log("Recording is already ", this.mediaRecorder.state);
        }
    }

    stop() {
        if (!this.mediaRecorder) {
            console.log('找不到mediaRecorder')
            return
        }
        this.isRecord = false
        this.mediaRecorder.stop();
    }

    visualizeAudio(recordedChunks, type) {
        //  手动传入音频数据进行绘制
        if (recordedChunks.length == 0) return
        this.audioBlob = new Blob(this.recordedChunks, { type: type });
        this.audioBlob.arrayBuffer().then(arrayBuffer => {
            if (!arrayBuffer) return
            this.ac.decodeAudioData(arrayBuffer, audioBuffer => {
                if (!audioBuffer) {
                    console.error('Failed to decode audio data.');
                    return;
                }
                this.source = this.ac.createBufferSource();
                this.source.buffer = audioBuffer;
                this.source.connect(this.analyser);
                this.analyser.connect(this.ac.destination);
                this.sourceDuration = audioBuffer.duration * 1000;
                this.source.start();
                this.source.onended = () => {
                    this.onended && this.onended()
                }
                this.startTime = performance.now()
                // 延迟绘制波形
                setTimeout(() => {
                    this.refreshUI();
                }, 100); // 延迟 100 毫秒
            })
        })
    }
    /****
     * 下采样音频数据
     * @param {*} buffer 音频数据
     * @param {*} outRate 输出采样率
     * @param {*} factor  调整波形高度因子,
     */
    // downSampleAudio(buffer, outRate = this.opt.fftSize, factor = 4) {
    //     console.log(buffer, outRate, factor)
    //     let newBuffer = new Array(outRate).fill(0)
    //     let size =Math.floor(buffer.length / outRate)
    //     let count = 1
    //     for (let i = 0; i < outRate; i++) {
    //         for (let j = ((count - 1) * size); j < (count * size) && j < buffer.length; j++) {
    //             console.log(buffer[j],'buffer[j]')
    //             newBuffer[i] += buffer[j]
    //         }
    //         count++
    //         newBuffer[i] = Math.floor(newBuffer[i] / (size * factor))
    //     }
    //     console.log(newBuffer, 'newBuffer')
    //     return newBuffer
    // }
    downSampleAudio(buffer, outRate = this.opt.fftSize, factor = 0.5) {
        const newBuffer = new Float32Array(outRate);
        const step = buffer.length / outRate;

        // 两阶段处理：先低通滤波后采样
        const filtered = this.preProcess(buffer, step);

        for (let i = 0; i < outRate; i++) {
            const startIdx = Math.floor(i * step);
            const endIdx = Math.floor((i + 1) * step);

            // 阶段1：能量积分
            let energy = 0;
            for (let j = startIdx; j < endIdx && j < filtered.length; j++) {
                energy += filtered[j] ** 2; // 平方量累计
            }

            // 阶段2：归一化处理
            newBuffer[i] = Math.sqrt(energy / (endIdx - startIdx)) * factor || 0;
        }

        return this.postProcess(newBuffer); // 后处理增强连续性
    }

    // 预处理：简易抗锯齿滤波
    preProcess(buffer, step) {
        const cutoffFreq = 1 / (2 * step); // Nyquist定理
        return this.movingAverage(buffer, Math.round(1 / cutoffFreq));
    }

    // 后处理：三次样条平滑
    postProcess(buffer) {
        return buffer.map((v, i) => {
            const prev = buffer[Math.max(i - 1, 0)];
            const next = buffer[Math.min(i + 1, buffer.length - 1)];
            return (prev + 2 * v + next) / 4;
        });
    }

    // 移动平均滤波器
    movingAverage(arr, windowSize = 3) {
        return arr.map((_, i) => {
            const start = Math.max(0, i - Math.floor(windowSize / 2));
            const end = Math.min(arr.length, i + Math.ceil(windowSize / 2));
            return arr.slice(start, end).reduce((a, b) => a + b, 0) / (end - start);
        });
    }
    /**
     *  获取实时buffer数据
     * **/
    getBuffer() {
        const { analyser } = this
        let bufferLen = analyser.frequencyBinCount
        let buffer = new Uint8Array(bufferLen)

        // // 获取时间域数据（波形图）
        // analyser.getByteTimeDomainData(buffer);
        // 获取频域数据（频谱图）
        analyser.getByteFrequencyData(buffer)
        return buffer
    }
    /***
     * 绘制平行频谱图
     * @param {*} buffer 音频数据
     * */
    draw(buffer) {
        const { ctx, cw, ch } = this
        const { lineColor, lineColorO, shadowColor, shadowColorO, shadowBlur, lineWidth, lineSpacing, isRound } = this.opt

        let cx = this.cw * this.opt.centerX
        let cy = this.ch * this.opt.centerY
        let sp = (lineWidth + lineSpacing) / 2
        ctx.clearRect(0, 0, cw, ch)
        ctx.beginPath()
        ctx.lineWidth = lineWidth
        ctx.shadowBlur = shadowBlur
        ctx.strokeStyle = `rgba(${this.colorToRGB(lineColor).join(',')}, ${lineColorO})`
        ctx.shadowColor = `rgba(${this.colorToRGB(shadowColor).join(',')}, ${shadowColorO})`
        if (isRound) {
            ctx.lineCap = "round"
        } else {
            ctx.lineCap = "butt"
        }
        for (let i = 0; i < buffer.length; i++) {
            let h = buffer[i] + 1
            let xl = cx - i * (lineWidth + lineSpacing) - sp
            let xr = cx + i * (lineWidth + lineSpacing) + sp
            let y1 = cy - h / 2
            let y2 = cy + h / 2
            ctx.moveTo(xl, y1)
            ctx.lineTo(xl, y2)
            ctx.moveTo(xr, y1)
            ctx.lineTo(xr, y2)
        }

        ctx.stroke()
        ctx.closePath()
    }

    /***
     * 绘制原型频谱图
     * @param {*} buffer 音频数据
     * ***/
    drawCircle(buffer) {
        let bufferLen = buffer.length
        const { ctx, cw, ch } = this;
        const { lineColor, lineColorO, shadowColor, shadowColorO, shadowBlur, lineWidth, isRound } = this.opt;
        let cx = cw / 2; // 圆心 x 坐标
        let cy = ch / 2; // 圆心 y 坐标
        let radius = Math.min(cx, cy) * 0.8; // 圆环的最大半径
        let angleStep = (2 * Math.PI) / bufferLen; // 每个数据点的角度间隔
        // 清除画布
        ctx.clearRect(0, 0, cw, ch);
        // 开始绘制路径
        ctx.lineWidth = lineWidth;
        ctx.shadowBlur = shadowBlur;
        ctx.strokeStyle = `rgba(${this.colorToRGB(lineColor).join(',')}, ${lineColorO})`;
        ctx.shadowColor = `rgba(${this.colorToRGB(shadowColor).join(',')}, ${shadowColorO})`;
        if (isRound) {
            ctx.lineCap = "round"; // 设置线条端点为圆角
        } else {
            ctx.lineCap = "butt"; // 设置线条端点为平直
        }
        for (let i = 0; i < bufferLen; i++) {
            let angle = i * angleStep + this.globalAngle; // 当前数据点对应的角度（添加全局旋转偏移）
            let height = buffer[i] / 100 * radius * 0.1; // 根据音频数据调整线段长度
            // + buffer[bufferLen - i - 1] / 100 * radius * 0.1
            // 计算当前点的坐标
            let x1 = cx + Math.cos(angle) * (radius - height);
            let y1 = cy + Math.sin(angle) * (radius - height);
            let x2 = cx + Math.cos(angle) * (radius + height);
            let y2 = cy + Math.sin(angle) * (radius + height);
            // 绘制线段
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        this.globalAngle += Math.PI / 1800; // 添加旋转效果
    }

    //  实时录音绘制波形
    refreshUI() {
        if (!this.isRecord) return
        let buffer = this.getBuffer()
        this.draw(buffer)
        requestAnimationFrame(this.refreshUI.bind(this))
    }


    // 给定的录音文件，绘制波形
    refreshRecordUI() {
        const currentTime = performance.now(); // 获取当前时间
        const elapsedTime = currentTime - this.startTime; // 计算已过去的时间
        if (elapsedTime >= this.sourceDuration) return
        this.draw3()
        requestAnimationFrame(this.refreshRecordUI.bind(this))
    }

}