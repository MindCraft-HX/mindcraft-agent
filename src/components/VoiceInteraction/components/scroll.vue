<template>
  <div class="scroll-box">
    <div class="arrow left-arrow" :class="{ 'disabled': disabledLeft }" @click="handleScrollLeft">
      <span class="icon mindcraft-flow-win-iconfont icon-mindcraft-zuo"></span>
    </div>
    <div class="scroll_wrapper" ref="scrollRef" :style="{ '--width': width }">
      <slot>默认内容</slot>
    </div>
    <div class="arrow right-arrow" :class="{ 'disabled': disabledRight }" @click="handleScrollRight">
      <span class="icon mindcraft-flow-win-iconfont icon-mindcraft-you"></span>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, useSlots, watch } from "vue";

const props = defineProps({
  width: {
    type: String,
    default: '100%'
  }
});

const scrollRef = ref(null);
const slots = useSlots();
const defaultSlot = slots.default;
const disabledLeft = ref(true);
const disabledRight = ref(false);
const childrenWidth = ref(100);
const scrollLeft = ref(0);

onMounted(() => {
  if (scrollRef.value) {
    scrollRef.value.addEventListener('scroll', (event) => {
      scrollLeft.value = scrollRef.value.scrollLeft;
    });
    updateArrowState();
  }
});

const handleScrollRight = () => {
  if (scrollRef.value) {
    scrollRef.value.scrollLeft += childrenWidth.value;
    updateArrowState();
  }
};

const handleScrollLeft = () => {
  if (scrollRef.value) {
    scrollRef.value.scrollLeft -= childrenWidth.value;
    updateArrowState();
  }
};

const updateArrowState = () => {
  if (scrollRef.value) {
    disabledLeft.value = scrollRef.value.scrollLeft <= 0;
    disabledRight.value = scrollRef.value.scrollLeft >= scrollRef.value.scrollWidth - scrollRef.value.clientWidth;
  }
};
watch(() => scrollLeft.value, () => {
  updateArrowState();
});
</script>

<style lang="scss" scoped>
@import url('@/components/VoiceInteraction/index.scss');
.scroll-box {
  display: flex;
  align-items: center;
  margin: 20px;

  .mindcraft-flow-win-iconfont {
    font-size: 26px;
  }

  .arrow {
    &.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    cursor: pointer;
  }

  .scroll_wrapper {
    width: var(--width);
    overflow-x: scroll;
    margin: 10px;
    display: flex;
    flex-wrap: nowrap;
    gap: 10px;
    padding: 10px 0;
    transition: all 0.3s ease;
  }

  .scroll_wrapper ::v-slotted(*) {
    flex-shrink: 0;
  }
}
</style>