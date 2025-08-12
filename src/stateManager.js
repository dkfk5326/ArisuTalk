import { defaultCharacters } from "./defauts.js";

class StateManager {
    constructor(defaultPrompts) {
        this.defaultPrompts = defaultPrompts;
        const loadedSettings = this.loadFromLocalStorage("personaChat_settings_v16", {});
        this.state = {
            settings: {
                apiKey: "",


                model: "gemini-2.5-flash",
                userName: "",
                userDescription: "",
                proactiveChatEnabled: false,
                randomFirstMessageEnabled: false,
                randomCharacterCount: 3,
                randomMessageFrequencyMin: 10,
                randomMessageFrequencyMax: 120,
                fontScale: 1.0,
                ...loadedSettings,
                prompts: {
                    main: { ...this.defaultPrompts.main, ...(loadedSettings.prompts?.main || {}) },
                    profile_creation: loadedSettings.prompts?.profile_creation || this.defaultPrompts.profile_creation
                }
            },
            characters: this.loadFromLocalStorage("personaChat_characters_v16", defaultCharacters),
            messages: this.loadFromLocalStorage("personaChat_messages_v16", {}),
            unreadCounts: this.loadFromLocalStorage("personaChat_unreadCounts_v16", {}),
            selectedChatId: null,
            isWaitingForResponse: false,
            typingCharacterId: null,
            sidebarCollapsed: window.innerWidth < 768,
            showSettingsModal: false,
            showCharacterModal: false,
            showPromptModal: false,
            editingCharacter: null,
            editingMessageId: null,
            searchQuery: "",
            modal: { isOpen: false, title: "", message: "", onConfirm: null },
            showInputOptions: false,
            imageToSend: null,
        };
    }

    loadFromLocalStorage(key, defaultValue) {
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.warn(`Error reading localStorage key "${key}":`, error);
            return defaultValue;
        }
    }

    saveToLocalStorage(key, value) {
        try {
            const stringifiedValue = JSON.stringify(value);
            window.localStorage.setItem(key, stringifiedValue);
        } catch (error) {
            console.error(`Error saving to localStorage key "${key}":`, error);
            if (error.name === "QuotaExceededError") {
                // this.showInfoModal(language.modal.noSpaceError.title, language.modal.noSpaceError.message);
            } else {
                // this.showInfoModal(language.modal.localStorageSaveError.title, language.modal.localStorageSaveError.message);
            }
        }
    }

    setState(newState) {
        const oldState = { ...this.state };
        this.state = { ...this.state, ...newState };

        // UI 업데이트 로직은 PersonaChatApp에서 처리하도록 위임
        // if (JSON.stringify(oldState.settings) !== JSON.stringify(this.state.settings)) {
        //     this.saveToLocalStorage("personaChat_settings_v16", this.state.settings);
        // }
        // if (JSON.stringify(oldState.characters) !== JSON.stringify(this.state.characters)) {
        //     this.saveToLocalStorage("personaChat_characters_v16", this.state.characters);
        // }
        // if (JSON.stringify(oldState.messages) !== JSON.stringify(this.state.messages)) {
        //     this.saveToLocalStorage("personaChat_messages_v16", this.state.messages);
        // }
        // if (JSON.stringify(oldState.unreadCounts) !== JSON.stringify(this.state.unreadCounts)) {
        //     this.saveToLocalStorage("personaChat_unreadCounts_v16", this.state.unreadCounts);
        // }
    }

    getState() {
        return this.state;
    }

    // 상태 저장 로직을 외부에서 호출할 수 있도록 추가
    saveSettings() {
        this.saveToLocalStorage("personaChat_settings_v16", this.state.settings);
    }

    saveCharacters() {
        this.saveToLocalStorage("personaChat_characters_v16", this.state.characters);
    }

    saveMessages() {
        this.saveToLocalStorage("personaChat_messages_v16", this.state.messages);
    }

    saveUnreadCounts() {
        this.saveToLocalStorage("personaChat_unreadCounts_v16", this.state.unreadCounts);
    }
}

export default StateManager;


