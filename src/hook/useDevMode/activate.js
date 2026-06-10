import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'

export function useActivate() {
    // step1:库文件生成路径 - shift双击
    const stepOne = ref(false)
    const activateStepOne = (e) => {
        if (e.type === 'dblclick' && e.shiftKey) {
            stepOne.value = true
            return
        }
        initStep()
    }

    // step2: 字库型号 - shift双击
    const stepTwo = ref(false)
    const activateStepTwo = (e) => {
        if (stepOne.value) {
            if (e.type === 'dblclick' && e.shiftKey) {
                stepTwo.value = true
                return
            }
        }
        initStep()
    }

    // step3: 编译环境 - 不按shift点击10次
    const stepThree = ref(0)
    const activateStepThree = (e) => {
        if (stepTwo.value) {
            if (!e.shiftKey) {
                stepThree.value++
                return
            }
        }
        initStep()
    }

    // step4: 本地编译器 - 不按shift点击2次
    const stepFour = ref(0)
    const activateStepFour = (e) => {
        if (stepThree.value >= 10) {
            if (!e.shiftKey) {
                stepFour.value++
                return
            }
        }
        initStep()
    }

    // step5: 自动库Lib助手 - shift双击（最终解锁）
    const stepFive = ref(false)
    const activateStepFive = (e) => {
        if (stepFour.value >= 20) {
            if (e.type === 'dblclick' && e.shiftKey) {
                stepFive.value = true
                sessionStorage.setItem('devMode', '1')
                ElMessage.success('解锁成功')
                return
            }
        }
        initStep()
    }

    const initStep = () => {
        stepOne.value = false
        stepTwo.value = false
        stepThree.value = 0
        stepFour.value = 0
        stepFive.value = false
    }

    return {
        initStep,
        activateStepOne,
        activateStepTwo,
        activateStepThree,
        activateStepFour,
        activateStepFive, 
        activate: computed(() => {
            return (
                stepOne.value && stepTwo.value && stepThree.value >= 10 && stepFour.value >= 20 && stepFive.value
            ) || sessionStorage.getItem('devMode') === '1'
        })
    }
}