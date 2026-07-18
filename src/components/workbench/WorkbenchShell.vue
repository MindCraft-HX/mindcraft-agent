<template>
  <div class="workbench-shell">
    <div class="workbench-groups">
      <section
        v-for="group in groups"
        :key="group.id"
        class="workbench-group"
        :style="{ flex: `${group.size} 1 0%` }"
        @dragover.prevent
        @drop="moveDroppedItem($event, group.id)"
      >
        <div class="workbench-tabs" role="tablist">
          <button
            v-for="itemId in group.itemIds"
            :key="itemId"
            class="workbench-tab"
            :class="{ active: group.activeItemId === itemId }"
            type="button"
            draggable="true"
            role="tab"
            @click="activate(itemId)"
            @dragstart="startDrag($event, itemId)"
          >{{ itemTitle(itemId) }}</button>
          <button
            v-if="false"
            class="workbench-split"
            type="button"
            title="Split editor"
            @click="splitItem(group.activeItemId)"
          >↗</button>
          <button
            v-if="false"
            class="workbench-merge"
            type="button"
            title="Merge panes"
            @click="store.mergeSecondary()"
          >↔</button>
        </div>
        <div class="workbench-surface" :id="surfaceId(group.id)">
          <div
            v-for="itemId in mountedItemIds"
            v-show="isActive(itemId)"
            :key="itemId"
            class="workbench-item-host"
          >
            <CodeHub v-if="itemId === 'agent:codehub'" ref="agentRef" />
            <ChatView v-else-if="itemId === 'chat:simple'" ref="chatRef" />
            <MdViewer v-else-if="itemId === 'document:home'" ref="documentRef" />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CodeHub, ChatView } from '@mindcraft/agent'
import MdViewer from '@/components/mdViewer/index.vue'
import { useWorkbenchStore } from '@/workbench/useWorkbenchStore.js'

const route = useRoute()
const router = useRouter()
const agentRef = ref(null)
const chatRef = ref(null)
const documentRef = ref(null)
const draggedItemId = ref('')
const { store, snapshot } = useWorkbenchStore({
  loadLayout: () => window.electronAPI?.loadWorkbenchLayout?.(),
  saveLayout: payload => window.electronAPI?.saveWorkbenchLayout?.(payload),
})

const groups = computed(() => snapshot.value.layout.groups)
// Agent is resident from boot; Chat and DocumentHome become resident only
// after their descriptor first appears, then remain mounted until app close.
const mountedItems = ref(new Set(['agent:codehub']))
const mountedItemIds = computed(() => [...mountedItems.value]
  .filter(itemId => Boolean(snapshot.value.layout.items[itemId])))

function surfaceId(groupId) { return `workbench-surface-${groupId}` }
function isActive(itemId) {
  const group = groups.value.find(candidate => candidate.itemIds.includes(itemId))
  return Boolean(group && group.id === snapshot.value.layout.activeGroupId && group.activeItemId === itemId)
}
function itemTitle(itemId) {
  if (itemId === 'agent:codehub') return 'Agent'
  if (itemId === 'chat:simple') return 'Chat'
  if (itemId === 'document:home') return 'Documents'
  return itemId
}
function itemForRoute() {
  if (route.name === 'chat') return 'chat:simple'
  if (route.name === 'mdViewer') return 'document:home'
  return 'agent:codehub'
}
function itemDescriptor(itemId) {
  return itemId === 'agent:codehub'
    ? { type: 'agent', singleton: true }
    : itemId === 'chat:simple'
      ? { type: 'chat', singleton: true }
      : { type: 'document-home', singleton: true }
}
function pathForItem(itemId) {
  return itemId === 'chat:simple' ? '/main/chat' : itemId === 'document:home' ? '/main/mdViewer' : '/main/codeHub'
}

async function registerMountedAdapters() {
  await nextTick()
  if (agentRef.value?.createWorkbenchAdapter) store.registerAdapter('agent:codehub', agentRef.value.createWorkbenchAdapter())
  if (chatRef.value?.createWorkbenchAdapter) store.registerAdapter('chat:simple', chatRef.value.createWorkbenchAdapter())
  if (documentRef.value?.createWorkbenchAdapter) store.registerAdapter('document:home', documentRef.value.createWorkbenchAdapter())
}
async function openRouteItem() {
  const itemId = itemForRoute()
  if (!snapshot.value.layout.items[itemId]) {
    await store.open(itemId, itemDescriptor(itemId))
    mountedItems.value = new Set([...mountedItems.value, itemId])
    await registerMountedAdapters()
  }
  await store.activate(itemId, { route: route.path, query: route.query })
}
async function activate(itemId) {
  if (!snapshot.value.layout.items[itemId]) {
    await store.open(itemId, itemDescriptor(itemId))
    mountedItems.value = new Set([...mountedItems.value, itemId])
    await registerMountedAdapters()
  }
  await store.activate(itemId)
  const path = pathForItem(itemId)
  if (route.path !== path) await router.push(path)
}
function startDrag(event, itemId) {
  draggedItemId.value = itemId
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', itemId)
}
function moveDroppedItem(event, groupId) {
  const itemId = draggedItemId.value || event.dataTransfer?.getData('text/plain')
  draggedItemId.value = ''
  if (itemId) store.move(itemId, groupId)
}
onMounted(async () => {
  await store.hydrate()
  mountedItems.value = new Set([...mountedItems.value, ...Object.keys(snapshot.value.layout.items)])
  await registerMountedAdapters()
  await openRouteItem()
})
watch(() => route.name, () => { void openRouteItem() })
</script>

<style scoped>
.workbench-shell { display: flex; height: 100%; min-height: 0; background: var(--cc-bg, #111827); }
.workbench-groups { display: flex; flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
.workbench-group { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
.workbench-tabs { display: flex; align-items: center; min-height: 34px; overflow-x: auto; border-bottom: 1px solid var(--cc-border, #2a2a2a); background: var(--cc-bg-secondary, #161b22); }
.workbench-tab { height: 34px; max-width: 180px; padding: 0 12px; border: 0; border-right: 1px solid var(--cc-border, #2a2a2a); border-bottom: 2px solid transparent; background: transparent; color: var(--cc-text-dim, #8b949e); cursor: pointer; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.workbench-tab:hover { color: var(--cc-text, #e5e7eb); background: var(--cc-bg-hover, rgba(255,255,255,.05)); }
.workbench-tab.active { color: var(--cc-text, #e5e7eb); border-bottom-color: var(--cc-primary, #60a5fa); background: var(--cc-bg, #111827); }
.workbench-surface { display: flex; flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
.workbench-item-host { display: flex; flex: 1; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
</style>
