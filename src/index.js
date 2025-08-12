import { defaultPrompts, defaultCharacters } from "./defauts.js";
import { language } from "./language.js";
import StateManager from "./stateManager.js";
import UIRenderer from "./uiRenderer.js";
import EventHandler from "./eventHandler.js";
import ApiClient from "./apiClient.js";
import { applyFontScale, scrollToBottom, createIcons, generateUniqueId, resizeImage, dataURLtoBlob, showInfoModal, showConfirmationModal, closeModal, handleDetailsToggle } from "./utils.js";

// --- APP INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    window.personaApp = new PersonaChatApp();
    window.personaApp.init();
});

class PersonaChatApp {
    constructor() {
        this.stateManager = new StateManager(defaultPrompts);
        this.uiRenderer = new UIRenderer(this.stateManager);
        this.eventHandler = new EventHandler(this);
        this.apiClient = new ApiClient(this.stateManager.getState().settings.apiKey, this.stateManager.getState().settings.model);

        this.messagesEndRef = null;
        this.proactiveInterval = null;
    }

    init() {
        applyFontScale(this.stateManager.getState().settings.fontScale);
        this.addKeyboardListeners();
        this.render();
        this.eventHandler.addEventListeners();
        const state = this.stateManager.getState();
        const initialChatId = state.characters.length > 0 ? state.characters[0].id : null;
        if (state.characters.length > 0 && !state.selectedChatId) {
            this.setState({ selectedChatId: initialChatId });
        } else {
            this.render();
        }
        this.proactiveInterval = setInterval(() => this.checkAndSendProactiveMessages(), 60000);

        if (state.settings.randomFirstMessageEnabled) {
            this.scheduleMultipleRandomChats();
        }
    }

    setState(newState) {
        const oldState = { ...this.stateManager.getState() };
        this.stateManager.setState(newState);
        const currentState = this.stateManager.getState();

        this.updateUI(oldState, currentState);

        // Save to local storage if state changes
        if (JSON.stringify(oldState.settings) !== JSON.stringify(currentState.settings)) {
            this.stateManager.saveSettings();
            if (oldState.settings.fontScale !== currentState.settings.fontScale) {
                applyFontScale(currentState.settings.fontScale);
            }
            this.apiClient.apiKey = currentState.settings.apiKey;
            this.apiClient.model = currentState.settings.model;
        }
        if (JSON.stringify(oldState.characters) !== JSON.stringify(currentState.characters)) {
            this.stateManager.saveCharacters();
        }
        if (JSON.stringify(oldState.messages) !== JSON.stringify(currentState.messages)) {
            this.stateManager.saveMessages();
        }
        if (JSON.stringify(oldState.unreadCounts) !== JSON.stringify(currentState.unreadCounts)) {
            this.stateManager.saveUnreadCounts();
        }
    }

    updateUI(oldState, newState) {
        if (oldState.sidebarCollapsed !== newState.sidebarCollapsed ||
            oldState.searchQuery !== newState.searchQuery ||
            JSON.stringify(oldState.characters) !== JSON.stringify(newState.characters) ||
            oldState.selectedChatId !== newState.selectedChatId ||
            JSON.stringify(oldState.unreadCounts) !== JSON.stringify(newState.unreadCounts) ||
            JSON.stringify(oldState.messages) !== JSON.stringify(newState.messages)
        ) {
            this.uiRenderer.renderSidebar();
        }

        if (oldState.selectedChatId !== newState.selectedChatId ||
            oldState.editingMessageId !== newState.editingMessageId ||
            JSON.stringify(oldState.messages) !== JSON.stringify(newState.messages) ||
            oldState.typingCharacterId !== newState.typingCharacterId ||
            oldState.isWaitingForResponse !== newState.isWaitingForResponse ||
            oldState.sidebarCollapsed !== newState.sidebarCollapsed ||
            oldState.showInputOptions !== newState.showInputOptions ||
            oldState.imageToSend !== newState.imageToSend
        ) {
            this.uiRenderer.renderMainChat();
        }

        if (oldState.showSettingsModal !== newState.showSettingsModal ||
            oldState.showCharacterModal !== newState.showCharacterModal ||
            oldState.showPromptModal !== newState.showPromptModal ||
            oldState.modal.isOpen !== newState.modal.isOpen ||
            (newState.showSettingsModal && JSON.stringify(oldState.settings) !== JSON.stringify(newState.settings)) ||
            (newState.showCharacterModal && JSON.stringify(oldState.editingCharacter) !== JSON.stringify(newState.editingCharacter)) ||
            (newState.showPromptModal && JSON.stringify(oldState.settings.prompts) !== JSON.stringify(newState.settings.prompts))
        ) {
            this.uiRenderer.renderModals();
        }

        createIcons();
        scrollToBottom(this.messagesEndRef);
    }

    render() {
        this.uiRenderer.renderSidebar();
        this.uiRenderer.renderMainChat();
        this.uiRenderer.renderModals();
        createIcons();
        scrollToBottom(this.messagesEndRef);
    }

    // --- CHAT LOGIC ---
    async handleSendMessage(message, type = "text") {
        const state = this.stateManager.getState();
        if (state.isWaitingForResponse && type === "text") return;

        const selectedChat = state.characters.find(c => c.id === state.selectedChatId);
        if (!selectedChat) return;

        const newMessage = {
            id: generateUniqueId(),
            sender: state.settings.userName || "You",
            content: message,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            isMe: true,
            type: type,
            imageUrl: type === "image" ? state.imageToSend.dataUrl : null,
            imageId: type === "image" ? state.imageToSend.id : null,
        };

        const updatedMessages = { ...state.messages };
        updatedMessages[selectedChat.id] = [...(updatedMessages[selectedChat.id] || []), newMessage];

        this.setState({
            messages: updatedMessages,
            isWaitingForResponse: true,
            imageToSend: null,
        });

        document.getElementById("new-message-input").value = "";
        document.getElementById("new-message-input").style.height = "48px";

        try {
            this.setState({ typingCharacterId: selectedChat.id });
            const apiResponse = await this.callGeminiAPI(selectedChat, newMessage);
            const botMessage = {
                id: generateUniqueId(),
                sender: selectedChat.name,
                content: apiResponse,
                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                isMe: false,
                type: "text",
            };
            updatedMessages[selectedChat.id] = [...(updatedMessages[selectedChat.id] || []), botMessage];
            this.setState({ messages: updatedMessages, isWaitingForResponse: false, typingCharacterId: null });
        } catch (error) {
            console.error("Error sending message:", error);
            const errorMessage = {
                id: generateUniqueId(),
                sender: "System",
                content: `메시지 전송 실패: ${error.message}`,
                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                isMe: false,
                isError: true,
            };
            updatedMessages[selectedChat.id] = [...(updatedMessages[selectedChat.id] || []), errorMessage];
            this.setState({ messages: updatedMessages, isWaitingForResponse: false, typingCharacterId: null });
            showInfoModal(language.modal.apiError.title, language.modal.apiError.message + error.message);
        }
    }

    async callGeminiAPI(character, newMessage) {
        const state = this.stateManager.getState();
        const messages = state.messages[character.id] || [];

        const contents = messages.map(msg => ({
            role: msg.isMe ? "user" : "model",
            parts: [{ text: msg.content }],
        }));

        // Add image part if available in the last message
        let imageToSend = null;
        if (newMessage.type === "image" && newMessage.imageUrl) {
            imageToSend = { dataUrl: newMessage.imageUrl, mimeType: "image/jpeg" }; // Assuming jpeg for now
        }

        try {
            const response = await this.apiClient.callGeminiAPI(contents, character, state.settings.userName, imageToSend);
            return response;
        } catch (error) {
            throw error;
        }
    }

    handleDeleteMessage(messageId) {
        showConfirmationModal(
            language.modal.deleteMessageConfirm.title,
            language.modal.deleteMessageConfirm.message,
            () => {
                const state = this.stateManager.getState();
                const updatedMessages = { ...state.messages };
                updatedMessages[state.selectedChatId] = updatedMessages[state.selectedChatId].filter(msg => msg.id !== messageId);
                this.setState({ messages: updatedMessages });
            }
        );
    }

    handleEditMessage(messageId) {
        this.setState({ editingMessageId: messageId });
    }

    handleSaveEditedMessage(messageId) {
        const state = this.stateManager.getState();
        const textarea = document.querySelector(`.edit-message-textarea[data-id="${messageId}"]`);
        if (textarea) {
            const updatedMessages = { ...state.messages };
            const messageIndex = updatedMessages[state.selectedChatId].findIndex(msg => msg.id === messageId);
            if (messageIndex !== -1) {
                updatedMessages[state.selectedChatId][messageIndex].content = textarea.value;
                this.setState({ messages: updatedMessages, editingMessageId: null });
            }
        }
    }

    async handleRerollMessage(messageId) {
        const state = this.stateManager.getState();
        const messages = state.messages[state.selectedChatId];
        const messageIndex = messages.findIndex(msg => msg.id === messageId);

        if (messageIndex === -1) return;

        const lastUserMessageIndex = messages.slice(0, messageIndex).reverse().findIndex(msg => msg.isMe);
        if (lastUserMessageIndex === -1) return;

        const actualUserMessageIndex = messageIndex - (lastUserMessageIndex + 1);
        const userMessage = messages[actualUserMessageIndex];

        showConfirmationModal(
            language.modal.rerollMessageConfirm.title,
            language.modal.rerollMessageConfirm.message,
            async () => {
                const updatedMessages = { ...state.messages };
                updatedMessages[state.selectedChatId] = updatedMessages[state.selectedChatId].slice(0, actualUserMessageIndex + 1);
                this.setState({ messages: updatedMessages, isWaitingForResponse: true });

                try {
                    const selectedChat = state.characters.find(c => c.id === state.selectedChatId);
                    this.setState({ typingCharacterId: selectedChat.id });
                    const apiResponse = await this.callGeminiAPI(selectedChat, userMessage);
                    const botMessage = {
                        id: generateUniqueId(),
                        sender: selectedChat.name,
                        content: apiResponse,
                        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                        isMe: false,
                        type: "text",
                    };
                    updatedMessages[state.selectedChatId] = [...(updatedMessages[state.selectedChatId] || []), botMessage];
                    this.setState({ messages: updatedMessages, isWaitingForResponse: false, typingCharacterId: null });
                } catch (error) {
                    console.error("Error rerolling message:", error);
                    const errorMessage = {
                        id: generateUniqueId(),
                        sender: "System",
                        content: `메시지 다시 생성 실패: ${error.message}`,
                        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                        isMe: false,
                        isError: true,
                    };
                    updatedMessages[state.selectedChatId] = [...(updatedMessages[state.selectedChatId] || []), errorMessage];
                    this.setState({ messages: updatedMessages, isWaitingForResponse: false, typingCharacterId: null });
                    showInfoModal(language.modal.apiError.title, language.modal.apiError.message + error.message);
                }
            }
        );
    }

    // --- CHARACTER MANAGEMENT ---
    openNewCharacterModal() {
        this.setState({ showCharacterModal: true, editingCharacter: {} });
    }

    openEditCharacterModal(character) {
        this.setState({ showCharacterModal: true, editingCharacter: { ...character } });
    }

    closeCharacterModal() {
        this.setState({ showCharacterModal: false, editingCharacter: null });
    }

    handleSaveCharacter() {
        const state = this.stateManager.getState();
        const characterName = document.getElementById("character-name").value;
        const characterDescription = document.getElementById("character-description").value;
        const memories = Array.from(document.querySelectorAll(".memory-input")).map(input => input.value).filter(m => m.trim() !== "");
        const media = state.editingCharacter?.media || []; // Preserve existing media

        if (!characterName.trim()) {
            showInfoModal(language.modal.validationError.title, language.modal.validationError.message);
            return;
        }

        let updatedCharacters = [...state.characters];
        if (state.editingCharacter && state.editingCharacter.id) {
            // Editing existing character
            updatedCharacters = updatedCharacters.map(char =>
                char.id === state.editingCharacter.id
                    ? { ...char, name: characterName, description: characterDescription, memories: memories, media: media }
                    : char
            );
        } else {
            // Adding new character
            const newCharacter = {
                id: generateUniqueId(),
                name: characterName,
                description: characterDescription,
                avatar: state.editingCharacter?.avatar || null,
                memories: memories,
                media: media,
                prompts: { main: defaultPrompts.main, profile_creation: defaultPrompts.profile_creation },
            };
            updatedCharacters.push(newCharacter);
        }

        this.setState({ characters: updatedCharacters, showCharacterModal: false, editingCharacter: null });
    }

    handleDeleteCharacter(characterId) {
        showConfirmationModal(
            language.modal.deleteCharacterConfirm.title,
            language.modal.deleteCharacterConfirm.message,
            () => {
                const state = this.stateManager.getState();
                const updatedCharacters = state.characters.filter(char => char.id !== characterId);
                const updatedMessages = { ...state.messages };
                delete updatedMessages[characterId];
                const updatedUnreadCounts = { ...state.unreadCounts };
                delete updatedUnreadCounts[characterId];

                let newSelectedChatId = state.selectedChatId;
                if (newSelectedChatId === characterId) {
                    newSelectedChatId = updatedCharacters.length > 0 ? updatedCharacters[0].id : null;
                }

                this.setState({
                    characters: updatedCharacters,
                    messages: updatedMessages,
                    unreadCounts: updatedUnreadCounts,
                    selectedChatId: newSelectedChatId,
                });
            }
        );
    }

    async handleAvatarChange(event, isCard = false) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const resizedDataUrl = await resizeImage(file, 200, 200);
            const state = this.stateManager.getState();
            const updatedEditingCharacter = { ...state.editingCharacter, avatar: resizedDataUrl };
            this.setState({ editingCharacter: updatedEditingCharacter });

            if (isCard) {
                // If it's a card, also add it to media
                const newMedia = [...(updatedEditingCharacter.media || []), {
                    id: generateUniqueId(),
                    name: file.name,
                    dataUrl: resizedDataUrl,
                    mimeType: file.type
                }];
                this.setState({ editingCharacter: { ...updatedEditingCharacter, media: newMedia } });
            }
        } catch (error) {
            console.error("Error processing image:", error);
            showInfoModal(language.modal.imageProcessError.title, language.modal.imageProcessError.message);
        }
    }

    async handleImageFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const resizedDataUrl = await resizeImage(file, 800, 600); // Max 800x600 for chat images
            this.setState({
                imageToSend: {
                    id: generateUniqueId(),
                    dataUrl: resizedDataUrl,
                    mimeType: file.type,
                },
                showInputOptions: false,
            });
        } catch (error) {
            console.error("Error processing image:", error);
            showInfoModal(language.modal.imageProcessError.title, language.modal.imageProcessError.message);
        }
    }

    handleSaveCharacterToImage() {
        const state = this.stateManager.getState();
        const character = state.editingCharacter;
        if (!character || !character.name) {
            showInfoModal(language.modal.saveCardError.title, language.modal.saveCardError.message);
            return;
        }

        const cardData = {
            name: character.name,
            description: character.description,
            avatar: character.avatar,
            memories: character.memories,
            media: character.media,
            prompts: character.prompts,
        };

        const blob = new Blob([JSON.stringify(cardData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${character.name.replace(/\s/g, "_")}_card.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showInfoModal(language.modal.saveCardSuccess.title, language.modal.saveCardSuccess.message);
    }

    handleLoadCharacterFromImage(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const cardData = JSON.parse(e.target.result);
                // Basic validation
                if (cardData.name && cardData.description) {
                    this.setState({ editingCharacter: cardData });
                    showInfoModal(language.modal.loadCardSuccess.title, language.modal.loadCardSuccess.message);
                } else {
                    throw new Error("Invalid card data");
                }
            } catch (error) {
                console.error("Error loading card:", error);
                showInfoModal(language.modal.loadCardError.title, language.modal.loadCardError.message);
            }
        };
        reader.readAsText(file);
    }

    addMemoryField() {
        const state = this.stateManager.getState();
        const updatedEditingCharacter = { ...state.editingCharacter };
        updatedEditingCharacter.memories = [...(updatedEditingCharacter.memories || []), ""];
        this.setState({ editingCharacter: updatedEditingCharacter });
    }

    // --- SETTINGS MANAGEMENT ---
    handleSaveSettings() {
        const state = this.stateManager.getState();
        const apiKey = document.getElementById("settings-api-key").value;
        const userName = document.getElementById("settings-user-name").value;
        const userDescription = document.getElementById("settings-user-description").value;
        const proactiveChatEnabled = document.getElementById("settings-proactive-chat-enabled").checked;
        const randomFirstMessageEnabled = document.getElementById("settings-random-first-message-enabled").checked;
        const randomCharacterCount = parseInt(document.getElementById("settings-random-character-count").value);
        const randomMessageFrequencyMin = parseInt(document.getElementById("settings-random-message-frequency-min").value);
        const randomMessageFrequencyMax = parseInt(document.getElementById("settings-random-message-frequency-max").value);
        const fontScale = parseFloat(document.getElementById("settings-font-scale").value);

        this.setState({
            settings: {
                ...state.settings,
                apiKey,
                userName,
                userDescription,
                proactiveChatEnabled,
                randomFirstMessageEnabled,
                randomCharacterCount,
                randomMessageFrequencyMin,
                randomMessageFrequencyMax,
                fontScale,
            },
            showSettingsModal: false,
        });
        showInfoModal(language.modal.settingsSaved.title, language.modal.settingsSaved.message);
    }

    handleModelSelect(model) {
        const state = this.stateManager.getState();
        this.setState({ settings: { ...state.settings, model: model } });
    }

    handleSavePrompts() {
        const state = this.stateManager.getState();
        const mainPrompt = document.getElementById("prompt-main-main").value;
        const profileCreationPrompt = document.getElementById("prompt-profile_creation-profile_creation").value;

        this.setState({
            settings: {
                ...state.settings,
                prompts: {
                    main: mainPrompt,
                    profile_creation: profileCreationPrompt,
                },
            },
            showPromptModal: false,
        });
        showInfoModal(language.modal.promptsSaved.title, language.modal.promptsSaved.message);
    }

    // --- PROACTIVE CHAT ---
    checkAndSendProactiveMessages() {
        const state = this.stateManager.getState();
        if (!state.settings.proactiveChatEnabled) return;

        const now = Date.now();
        state.characters.forEach(async (char) => {
            const lastMessageTime = state.messages[char.id]?.slice(-1)[0]?.timestamp || 0;
            const timeElapsed = (now - lastMessageTime) / (1000 * 60); // minutes

            const minFreq = state.settings.randomMessageFrequencyMin;
            const maxFreq = state.settings.randomMessageFrequencyMax;

            if (timeElapsed > minFreq && timeElapsed < maxFreq) {
                // Randomly decide to send a message
                if (Math.random() < 0.1) { // 10% chance to send a proactive message
                    const prompt = `Generate a short, natural, and engaging proactive message from ${char.name} to ${state.settings.userName}. The message should be a casual greeting or a simple question to start a conversation.`;
                    try {
                        const apiResponse = await this.apiClient.callGeminiAPI([{ role: "user", parts: [{ text: prompt }] }], char, state.settings.userName);
                        const botMessage = {
                            id: generateUniqueId(),
                            sender: char.name,
                            content: apiResponse,
                            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                            isMe: false,
                            type: "text",
                            timestamp: Date.now(),
                        };
                        const updatedMessages = { ...state.messages };
                        updatedMessages[char.id] = [...(updatedMessages[char.id] || []), botMessage];
                        const updatedUnreadCounts = { ...state.unreadCounts };
                        updatedUnreadCounts[char.id] = (updatedUnreadCounts[char.id] || 0) + 1;
                        this.setState({ messages: updatedMessages, unreadCounts: updatedUnreadCounts });
                    } catch (error) {
                        console.error("Error sending proactive message:", error);
                    }
                }
            }
        });
    }

    scheduleMultipleRandomChats() {
        const state = this.stateManager.getState();
        const charactersToChat = this.getRandomCharacters(state.settings.randomCharacterCount);

        charactersToChat.forEach(char => {
            const delay = Math.random() * (state.settings.randomMessageFrequencyMax - state.settings.randomMessageFrequencyMin) + state.settings.randomMessageFrequencyMin;
            setTimeout(async () => {
                const prompt = `Generate a short, natural, and engaging first message from ${char.name} to ${state.settings.userName}. The message should be a casual greeting or a simple question to start a conversation.`;
                try {
                    const apiResponse = await this.apiClient.callGeminiAPI([{ role: "user", parts: [{ text: prompt }] }], char, state.settings.userName);
                    const botMessage = {
                        id: generateUniqueId(),
                        sender: char.name,
                        content: apiResponse,
                        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                        isMe: false,
                        type: "text",
                        timestamp: Date.now(),
                    };
                    const updatedMessages = { ...state.messages };
                    updatedMessages[char.id] = [...(updatedMessages[char.id] || []), botMessage];
                    const updatedUnreadCounts = { ...state.unreadCounts };
                    updatedUnreadCounts[char.id] = (updatedUnreadCounts[char.id] || 0) + 1;
                    this.setState({ messages: updatedMessages, unreadCounts: updatedUnreadCounts });
                } catch (error) {
                    console.error("Error sending random first message:", error);
                }
            }, delay * 1000 * 60);
        });
    }

    getRandomCharacters(count) {
        const state = this.stateManager.getState();
        const shuffled = [...state.characters].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    }

    // --- DATA MANAGEMENT ---
    handleBackup() {
        const state = this.stateManager.getState();
        const data = {
            settings: state.settings,
            characters: state.characters,
            messages: state.messages,
            unreadCounts: state.unreadCounts,
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "arisu_talk_backup.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showInfoModal(language.modal.backupSuccess.title, language.modal.backupSuccess.message);
    }

    handleRestore(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const restoredData = JSON.parse(e.target.result);
                showConfirmationModal(
                    language.modal.restoreConfirm.title,
                    language.modal.restoreConfirm.message,
                    () => {
                        this.setState({
                            settings: restoredData.settings || this.stateManager.getState().settings,
                            characters: restoredData.characters || this.stateManager.getState().characters,
                            messages: restoredData.messages || this.stateManager.getState().messages,
                            unreadCounts: restoredData.unreadCounts || this.stateManager.getState().unreadCounts,
                            selectedChatId: null, // Reset selected chat after restore
                        });
                        showInfoModal(language.modal.restoreSuccess.title, language.modal.restoreSuccess.message);
                    }
                );
            } catch (error) {
                console.error("Error restoring data:", error);
                showInfoModal(language.modal.restoreError.title, language.modal.restoreError.message);
            }
        };
        reader.readAsText(file);
    }

    handleBackupPrompts() {
        const state = this.stateManager.getState();
        const promptsData = state.settings.prompts;
        const blob = new Blob([JSON.stringify(promptsData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "arisu_talk_prompts_backup.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showInfoModal(language.modal.backupPromptsSuccess.title, language.modal.backupPromptsSuccess.message);
    }

    handleRestorePrompts(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const restoredPrompts = JSON.parse(e.target.result);
                showConfirmationModal(
                    language.modal.restorePromptsConfirm.title,
                    language.modal.restorePromptsConfirm.message,
                    () => {
                        const state = this.stateManager.getState();
                        this.setState({
                            settings: { ...state.settings, prompts: restoredPrompts },
                        });
                        showInfoModal(language.modal.restorePromptsSuccess.title, language.modal.restorePromptsSuccess.message);
                    }
                );
            } catch (error) {
                console.error("Error restoring prompts:", error);
                showInfoModal(language.modal.restorePromptsError.title, language.modal.restorePromptsError.message);
            }
        };
        reader.readAsText(file);
    }

    // --- KEYBOARD LISTENERS ---
    addKeyboardListeners() {
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                const state = this.stateManager.getState();
                if (state.showSettingsModal) this.setState({ showSettingsModal: false });
                if (state.showCharacterModal) this.setState({ showCharacterModal: false });
                if (state.showPromptModal) this.setState({ showPromptModal: false });
                if (state.modal.isOpen) closeModal();
            }
        });
    }

    // --- UTILITY FUNCTIONS (Moved to utils.js or handled by other modules) ---
    toggleSidebar() {
        const state = this.stateManager.getState();
        this.setState({ sidebarCollapsed: !state.sidebarCollapsed });
    }

    selectChat(chatId) {
        const state = this.stateManager.getState();
        const newUnreadCounts = { ...state.unreadCounts };
        if (newUnreadCounts[chatId]) {
            delete newUnreadCounts[chatId];
        }
        this.setState({
            selectedChatId: chatId,
            editingMessageId: null,
            unreadCounts: newUnreadCounts,
            sidebarCollapsed: window.innerWidth < 768 ? true : state.sidebarCollapsed
        });
    }
}


