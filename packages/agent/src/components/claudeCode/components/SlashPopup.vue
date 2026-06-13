<template>
  <div class="slash-popup">
    <!-- Model 分组 -->
    <div v-if="showModelGroup" class="slash-group">
      <div class="slash-group-label">Model</div>
      <div class="slash-model-row" @mousedown.prevent="$emit('openModelPicker')">
        <span class="slash-model-title">Switch model...</span>
        <span class="slash-model-value">{{ modelName }}</span>
      </div>
      <div class="slash-model-row">
        <span class="slash-model-title">Effort <span class="slash-effort-badge">({{ effortLabels[effortLevel] || 'Medium' }})</span></span>
        <div class="slash-effort-toggle">
          <button
            v-for="lv in effortLevels" :key="lv"
            class="slash-effort-dot" :class="{ active: effortLevel === lv }"
            @mousedown.prevent="$emit('setEffortLevel', lv)"
          ></button>
        </div>
      </div>
      <div class="slash-model-row" @mousedown.prevent="$emit('toggleThinking')">
        <span class="slash-model-title">Thinking</span>
        <div class="slash-toggle" :class="{ on: thinkingEnabled }">
          <div class="slash-toggle-knob"></div>
        </div>
      </div>
    </div>
    <!-- Commands 分组 -->
    <div class="slash-group">
      <div v-if="showModelGroup" class="slash-group-label">Commands</div>
      <div v-for="(s, i) in suggestions" :key="s.cmd"
        class="slash-item" :class="{ active: i === activeIdx }"
        @mousedown.prevent="$emit('applySlash', s)">
        <span class="slash-cmd">{{ s.cmd }}</span>
        <span class="slash-desc">{{ s.desc }}</span>
      </div>
    </div>
    <div v-if="loadingRemote" class="slash-loading-bar">
      <span class="slash-loading-dot"></span>
      <span class="slash-loading-text">{{ $t('agent.loadingSlash') }}</span>
    </div>
  </div>
</template>

<script setup>
const effortLevels = ['low', 'medium', 'high', 'max']
const effortLabels = { low: 'Low', medium: 'Medium', high: 'High', max: 'Max' }

defineProps({
  showModelGroup: { type: Boolean, default: false },
  modelName: { type: String, default: '' },
  effortLevel: { type: String, default: 'medium' },
  thinkingEnabled: { type: Boolean, default: false },
  suggestions: { type: Array, default: () => [] },
  activeIdx: { type: Number, default: -1 },
  loadingRemote: { type: Boolean, default: false },
})

defineEmits([
  'openModelPicker',
  'setEffortLevel',
  'toggleThinking',
  'applySlash',
])
</script>

<style scoped>
.slash-popup {
  position: absolute; bottom: 100%; left: 10px; right: 10px; margin-bottom: 4px;
  background: var(--cc-bg-tertiary); border: 1px solid var(--cc-border-strong); border-radius: 7px;
  max-height: min(48vh, 320px);
  overflow-y: auto;
  overflow-x: hidden;
  z-index: 50; box-shadow: 0 4px 16px var(--cc-shadow);
}
.slash-item {
  display: flex; align-items: center; gap: 10px; padding: 7px 12px;
  cursor: pointer; transition: background 0.1s;
}
.slash-item:hover, .slash-item.active { background: var(--cc-border); }
.slash-cmd { font-size: 12px; color: var(--cc-primary); font-family: Consolas, monospace; min-width: 80px; }
.slash-desc { font-size: 11px; color: var(--cc-text-dim); }
.slash-group { padding: 4px 0; }
.slash-group + .slash-group { border-top: 1px solid var(--cc-border); }
.slash-group-label {
  font-size: 11px; color: var(--cc-text-dim); padding: 4px 12px 2px; font-weight: 500;
  user-select: none;
}
.slash-model-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 12px; cursor: pointer; transition: background 0.1s;
}
.slash-model-row:hover { background: var(--cc-border); }
.slash-model-title { font-size: 12px; color: var(--cc-text); }
.slash-effort-badge { color: var(--cc-text-muted); font-weight: 400; }
.slash-model-value { font-size: 11px; color: var(--cc-text-muted); font-family: Consolas, monospace; }
.slash-effort-toggle {
  display: flex; align-items: center; gap: 0;
  background: var(--cc-border-strong); border-radius: 10px; padding: 3px 4px;
}
.slash-effort-dot {
  width: 14px; height: 14px; border-radius: 50%; border: none;
  background: var(--cc-icon-muted); cursor: pointer; transition: background 0.15s;
  margin: 0 2px;
}
.slash-effort-dot.active { background: var(--cc-primary); }
.slash-effort-dot:hover:not(.active) { background: var(--cc-text-dim); }
.slash-toggle {
  width: 32px; height: 18px; border-radius: 9px;
  background: var(--cc-toggle-off); position: relative; cursor: pointer;
  transition: background 0.2s;
}
.slash-toggle.on { background: var(--cc-primary); }
.slash-toggle-knob {
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--cc-toggle-knob); position: absolute; top: 2px; left: 2px;
  transition: transform 0.2s;
}
.slash-toggle.on .slash-toggle-knob { transform: translateX(14px); }
.slash-loading-bar {
  display: flex; align-items: center; gap: 7px;
  padding: 6px 12px; border-top: 1px solid var(--cc-border);
}
.slash-loading-text { font-size: 11px; color: var(--cc-text-dim); }
.slash-loading-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--cc-primary);
  animation: slash-pulse 1s ease-in-out infinite;
  flex-shrink: 0;
}
@keyframes slash-pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.1); }
}
</style>
