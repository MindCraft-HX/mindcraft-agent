import { createStore } from 'vuex';
import createPersistedState from "vuex-persistedstate";

const store = createStore({
  state() {
    return {
      librarySwitch: 'Off',
      promptSwitch: 'Off',
      fileSwitch:"Off",
      selectedLibrary: null,
      selectedPrompt: null,
      selectedFile:null,
      settingsInitialized: true,
      topK: 8,
    };
  },
  mutations: {
    setLibrarySwitch(state, value) {
      state.librarySwitch = value;
    },
    setPromptSwitch(state, value) {
      state.promptSwitch = value;
    },
    setFileSwitch(state, value){
       state.fileSwitch = value;
    },
    setSelectedLibrary(state, value) {
      state.selectedLibrary = value;
    },
    setSelectedPrompt(state, value) {
      state.selectedPrompt = value;
    },
    setSelectedFile(state, value){
      state.selectedFile = value;
    },
    setSettingsInitialized(state, value) {
      state.settingsInitialized = value;
    },
    setTopK(state, value) {
      state.topK = value;
    }
  },
  plugins: [createPersistedState()], // 使用vuex-persistedstate插件
});

export default store;
