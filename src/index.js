import { language } from "./language.js";
import { defaultPrompts, defaultCharacters } from "./defauts.js";
import { sleep, formatDateSeparator, findMessageGroup } from "./utils.js";
import { showInfoModal, showConfirmModal, closeModal } from "./modalManager.js";
import { toBase64, resizeImage, encodeTextInImage, decodeTextFromImage, handleSaveCharacterToImage, loadCharacterFromImage } from "./imageUtils.js";

// --- APP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    window.personaApp = new PersonaChatApp();
    window.personaApp.init();
});

class PersonaChatApp {
    constructor() {
        // --- DEFAULT PROMPTS ---
        this.defaultPrompts = defaultPrompts;

        // --- STATE MANAGEMENT ---
        const loadedSettings = this.loadFromLocalStorage('personaChat_settings_v16', {});
        this.state = {
            settings: {
                apiKey: '',
                model: 'gemini-2.5-flash',
                userName: '',
                userDescription: '',
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
            characters: this.loadFromLocalStorage('personaChat_characters_v16', defaultCharacters),
            messages: this.loadFromLocalStorage('personaChat_messages_v16', {}),
            unreadCounts: this.loadFromLocalStorage('personaChat_unreadCounts_v16', {}),
            selectedChatId: null,
            isWaitingForResponse: false,
            typingCharacterId: null,
            sidebarCollapsed: window.innerWidth < 768,
            showSettingsModal: false,
            showCharacterModal: false,
            showPromptModal: false,
            editingCharacter: null,
            editingMessageId: null,
            searchQuery: '',
            modal: { isOpen: false, title: '', message: '', onConfirm: null },
            showInputOptions: false,
            imageToSend: null,
        };
        this.messagesEndRef = null;
        this.proactiveInterval = null;
        this.animatedMessageIds = new Set();
    }

    // --- CORE METHODS ---
    init() {
        this.applyFontScale();
        this.addKeyboardListeners();
        this.render();
        this.addEventListeners();
        const initialChatId = this.state.characters.length > 0 ? this.state.characters[0].id : null;
        if (this.state.characters.length > 0 && !this.state.selectedChatId) {
            this.setState({ selectedChatId: initialChatId });
        } else {
            this.render();
        }
        this.proactiveInterval = setInterval(() => this.checkAndSendProactiveMessages(), 60000);

        if (this.state.settings.randomFirstMessageEnabled) {
            this.scheduleMultipleRandomChats();
        }
    }

    setState(newState) {
        const oldState = { ...this.state };
        this.state = { ...this.state, ...newState };

        this.updateUI(oldState, this.state);

        if (JSON.stringify(oldState.settings) !== JSON.stringify(this.state.settings)) {
            this.saveToLocalStorage('personaChat_settings_v16', this.state.settings);
            if (oldState.settings.fontScale !== newState.settings.fontScale) {
                this.applyFontScale();
            }
        }
        if (JSON.stringify(oldState.characters) !== JSON.stringify(this.state.characters)) {
            this.saveToLocalStorage('personaChat_characters_v16', this.state.characters);
        }
        if (JSON.stringify(oldState.messages) !== JSON.stringify(this.state.messages)) {
            this.saveToLocalStorage('personaChat_messages_v16', this.state.messages);
        }
        if (JSON.stringify(oldState.unreadCounts) !== JSON.stringify(this.state.unreadCounts)) {
            this.saveToLocalStorage('personaChat_unreadCounts_v16', this.state.unreadCounts);
        }
    }

    applyFontScale() {
        document.documentElement.style.setProperty('--font-scale', this.state.settings.fontScale);
    }

    // --- UI UPDATE LOGIC ---
    updateUI(oldState, newState) {
        if (oldState.sidebarCollapsed !== newState.sidebarCollapsed ||
            oldState.searchQuery !== newState.searchQuery ||
            JSON.stringify(oldState.characters) !== JSON.stringify(newState.characters) ||
            oldState.selectedChatId !== newState.selectedChatId ||
            JSON.stringify(oldState.unreadCounts) !== JSON.stringify(newState.unreadCounts) ||
            JSON.stringify(oldState.messages) !== JSON.stringify(newState.messages)
        ) {
            this.renderSidebar();
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
            this.renderMainChat();
        }

        if (oldState.showSettingsModal !== newState.showSettingsModal ||
            oldState.showCharacterModal !== newState.showCharacterModal ||
            oldState.showPromptModal !== newState.showPromptModal ||
            oldState.modal.isOpen !== newState.modal.isOpen ||
            (newState.showSettingsModal && JSON.stringify(oldState.settings) !== JSON.stringify(newState.settings)) ||
            (newState.showCharacterModal && JSON.stringify(oldState.editingCharacter) !== JSON.stringify(newState.editingCharacter)) ||
            (newState.showPromptModal && JSON.stringify(oldState.settings.prompts) !== JSON.stringify(newState.settings.prompts)) // Add this check
        ) {
            this.renderModals();
        }

        lucide.createIcons();
        this.scrollToBottom();
    }


    // --- LOCAL STORAGE HELPERS ---
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
            if (error.name === 'QuotaExceededError') {
                showInfoModal(this.setState.bind(this), language.modal.noSpaceError.title, language.modal.noSpaceError.message);
            } else {
                showInfoModal(this.setState.bind(this), language.modal.localStorageSaveError.title, language.modal.localStorageSaveError.message);
            }
        }
    }

    // --- EVENT LISTENERS ---
    addEventListeners() {
        const appElement = document.getElementById('app');

        const toggleSidebar = () => this.setState({ sidebarCollapsed: !this.state.sidebarCollapsed });

        appElement.addEventListener('click', (e) => {
            if (e.target.closest('#desktop-sidebar-toggle') || e.target.closest('#mobile-sidebar-toggle')) toggleSidebar();
            if (e.target.closest('#sidebar-backdrop')) this.setState({ sidebarCollapsed: true });

            if (e.target.closest('#open-settings-modal')) this.setState({ showSettingsModal: true });
            if (e.target.closest('#close-settings-modal')) this.setState({ showSettingsModal: false });
            if (e.target.closest('#save-settings')) this.handleSaveSettings();

            if (e.target.closest('#open-prompt-modal')) this.setState({ showPromptModal: true });
            if (e.target.closest('#close-prompt-modal')) this.setState({ showPromptModal: false });
            if (e.target.closest('#save-prompts')) this.handleSavePrompts();


            if (e.target.closest('#open-new-character-modal')) this.openNewCharacterModal();
            if (e.target.closest('#close-character-modal')) this.closeCharacterModal();
            if (e.target.closest('#save-character')) this.handleSaveCharacter();

            if (e.target.tagName === 'SUMMARY') {
                this.handleDetailsToggle(e);
            }

            const chatItem = e.target.closest('.character-item');
            if (chatItem) {
                const chatId = parseFloat(chatItem.dataset.id); // FIX: Use parseFloat for potentially float IDs
                const newUnreadCounts = { ...this.state.unreadCounts };
                if (newUnreadCounts[chatId]) {
                    delete newUnreadCounts[chatId];
                }
                this.setState({
                    selectedChatId: chatId,
                    editingMessageId: null,
                    unreadCounts: newUnreadCounts,
                    sidebarCollapsed: window.innerWidth < 768 ? true : this.state.sidebarCollapsed
                });
            }

            const editCharButton = e.target.closest('.edit-character-btn');
            if (editCharButton) {
                e.stopPropagation();
                const character = this.state.characters.find(c => c.id === parseFloat(editCharButton.dataset.id)); // FIX: Use parseFloat
                this.openEditCharacterModal(character);
            }
            const deleteCharButton = e.target.closest('.delete-character-btn');
            if (deleteCharButton) {
                e.stopPropagation();
                this.handleDeleteCharacter(parseFloat(deleteCharButton.dataset.id)); // FIX: Use parseFloat
            }

            if (e.target.closest('#open-input-options-btn')) {
                this.setState({ showInputOptions: !this.state.showInputOptions });
            }
            if (e.target.closest('#open-image-upload')) {
                document.getElementById('image-upload-input').click();
            }
            if (e.target.closest('#cancel-image-preview')) {
                this.setState({ imageToSend: null });
            }

            if (e.target.closest('#modal-cancel')) closeModal(this.setState.bind(this));
            if (e.target.closest('#modal-confirm')) {
                if (this.state.modal.onConfirm) this.state.modal.onConfirm();
                closeModal(this.setState.bind(this));
            }
            if (e.target.closest('#select-avatar-btn')) document.getElementById('avatar-input').click();
            if (e.target.closest('#load-card-btn')) document.getElementById('card-input').click();
            if (e.target.closest('#save-card-btn')) handleSaveCharacterToImage(this.setState.bind(this), this.state.editingCharacter, language, encodeTextInImage);


            const deleteMsgButton = e.target.closest('.delete-msg-btn');
            if (deleteMsgButton) this.handleDeleteMessage(parseFloat(deleteMsgButton.dataset.id));

            const editMsgButton = e.target.closest('.edit-msg-btn');
            if (editMsgButton) this.handleEditMessage(parseFloat(editMsgButton.dataset.id));

            const rerollMsgButton = e.target.closest('.reroll-msg-btn');
            if (rerollMsgButton) this.handleRerollMessage(parseFloat(rerollMsgButton.dataset.id));

            const saveEditButton = e.target.closest('.save-edit-btn');
            if (saveEditButton) this.handleSaveEditedMessage(parseFloat(saveEditButton.dataset.id));

            const cancelEditButton = e.target.closest('.cancel-edit-btn');
            if (cancelEditButton) this.setState({ editingMessageId: null });

            if (e.target.closest('#add-memory-btn')) this.addMemoryField();
            const deleteMemoryBtn = e.target.closest('.delete-memory-btn');
            if (deleteMemoryBtn) {
                deleteMemoryBtn.closest('.memory-item').remove();
            }

            if (e.target.closest('#backup-data-btn')) this.handleBackup();
            if (e.target.closest('#restore-data-btn')) document.getElementById('restore-file-input').click();
            if (e.target.closest('#backup-prompts-btn')) this.handleBackupPrompts();
            if (e.target.closest('#restore-prompts-btn')) document.getElementById('restore-prompts-input').click();
        });

        appElement.addEventListener('input', (e) => {
            if (e.target.id === 'search-input') {
                this.setState({ searchQuery: e.target.value });
            }
            if (e.target.id === 'new-message-input') {
                const message = e.target.value;
                e.target.style.height = 'auto';
                e.target.style.height = (e.target.scrollHeight) + 'px';

                const sendButton = document.getElementById('send-message-btn');
                if (sendButton) {
                    const hasText = message.trim() !== '';
                    const hasImage = !!this.state.imageToSend;
                    sendButton.disabled = (!hasText && !hasImage) || this.state.isWaitingForResponse;
                }
            }
            if (e.target.id === 'settings-font-scale') {
                this.setState({ settings: { ...this.state.settings, fontScale: parseFloat(e.target.value) } });
            }
            if (e.target.id === 'settings-random-character-count') {
                const count = e.target.value;
                const label = document.getElementById('random-character-count-label');
                if (label) label.textContent = `${count}명`;
            }
        });

        appElement.addEventListener('change', (e) => {
            if (e.target.id === 'image-upload-input') {
                this.handleImageFileSelect(e);
            }
            if (e.target.id === 'avatar-input') {
                this.handleAvatarChange(e, false);
            }
            if (e.target.id === 'card-input') {
                this.handleAvatarChange(e, true);
            }
            if (e.target.id === 'settings-random-first-message-toggle') {
                const optionsDiv = document.getElementById('random-chat-options');
                if (optionsDiv) optionsDiv.style.display = e.target.checked ? 'block' : 'none';
            }
            if (e.target.id === 'restore-file-input') this.handleRestore(e);
            if (e.target.id === 'restore-prompts-input') this.handleRestorePrompts(e);
        });

        appElement.addEventListener('keypress', (e) => {
            if (e.target.id === 'new-message-input' && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const sendButton = document.getElementById('send-message-btn');
                if (sendButton && !sendButton.disabled) sendButton.click();
            }
            if (e.target.classList.contains('edit-message-textarea') && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSaveEditedMessage(parseFloat(e.target.dataset.id));
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.input-area-container')) {
                this.setState({ showInputOptions: false });
            }
        });
    }

    // --- RENDER METHODS ---
    render() {
        this.renderSidebar();
        this.renderMainChat();
        this.renderModals();
        lucide.createIcons();
        this.scrollToBottom();
    }

    renderSidebar() {
        const sidebar = document.getElementById('sidebar');
        const sidebarContent = document.getElementById('sidebar-content');
        const backdrop = document.getElementById('sidebar-backdrop');
        const desktopToggle = document.getElementById('desktop-sidebar-toggle');

        if (this.state.sidebarCollapsed) {
            sidebar.classList.add('-translate-x-full', 'md:w-0');
            sidebar.classList.remove('translate-x-0', 'md:w-80');
            backdrop.classList.add('hidden');
            if (desktopToggle) desktopToggle.innerHTML = `<i data-lucide="chevron-right" class="w-5 h-5 text-gray-300"></i>`;
        } else {
            sidebar.classList.remove('-translate-x-full', 'md:w-0');
            sidebar.classList.add('translate-x-0', 'md:w-80');
            backdrop.classList.remove('hidden');
            if (desktopToggle) desktopToggle.innerHTML = `<i data-lucide="chevron-left" class="w-5 h-5 text-gray-300"></i>`;
        }

        const filteredCharacters = this.state.characters.filter(char =>
            char.name.toLowerCase().includes(this.state.searchQuery.toLowerCase())
        );

        sidebarContent.innerHTML = `
                <header class="p-4 md:p-6 border-b border-gray-800">
                    <div class="flex items-center justify-between mb-4 md:mb-6">
                        <div>
                            <h1 class="text-xl md:text-2xl font-bold text-white mb-1">ArisuTalk</h1>
                            <p class="text-xs md:text-sm text-gray-400">상대를 초대/대화 하세요</p>
                        </div>
                        <button id="open-settings-modal" class="p-2 md:p-2.5 rounded-full bg-gray-800 hover:bg-gray-700 transition-all duration-200">
                            <i data-lucide="settings" class="w-5 h-5 text-gray-300"></i>
                        </button>
                    </div>
                    <div class="relative">
                        <i data-lucide="bot" class="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 w-4 h-4"></i>
                        <input id="search-input" type="text" placeholder="검색하기..." value="${this.state.searchQuery}" class="w-full pl-11 pr-4 py-2 md:py-3 bg-gray-800 text-white rounded-xl border-0 focus:ring-2 focus:ring-blue-500/30 focus:bg-gray-750 transition-all duration-200 text-sm placeholder-gray-500" />
                    </div>
                </header>
                <div class="flex-1 overflow-y-auto">
                    <div class="p-4">
                        <button id="open-new-character-modal" class="w-full flex items-center justify-center py-3 md:py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all duration-200 font-medium shadow-lg text-sm">
                            <i data-lucide="plus" class="w-4 h-4 mr-2"></i>
                            초대하기
                        </button>
                    </div>
                    <div class="space-y-1 px-3 pb-4">
                        ${filteredCharacters.map(char => this.renderCharacterItem(char)).join('')}
                    </div>
                </div>
            `;
    }

    renderCharacterItem(char) {
        const lastMessage = (this.state.messages[char.id] || []).slice(-1)[0];
        const isSelected = this.state.selectedChatId === char.id;
        const unreadCount = this.state.unreadCounts[char.id] || 0;

        let lastMessageContent = language.chat.startNewChat;
        if (lastMessage) {
            if (lastMessage.type === 'image') {
                lastMessageContent = language.chat.imageSent;
            } else {
                lastMessageContent = lastMessage.content;
            }
        }

        return `
                <div data-id="${char.id}" class="character-item group p-3 md:p-4 rounded-xl cursor-pointer transition-all duration-200 relative ${isSelected ? 'bg-gray-800 border border-gray-700' : 'hover:bg-gray-800/50'}">
                    <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex space-x-1">
                        <button data-id="${char.id}" class="edit-character-btn p-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 hover:text-white transition-colors"><i data-lucide="edit-3" class="w-3 h-3 pointer-events-none"></i></button>
                        <button data-id="${char.id}" class="delete-character-btn p-1 bg-gray-700 hover:bg-red-600 rounded text-gray-300 hover:text-white transition-colors"><i data-lucide="trash-2" class="w-3 h-3 pointer-events-none"></i></button>
                    </div>
                    <div class="flex items-center space-x-3 md:space-x-4 pointer-events-none">
                        ${this.renderAvatar(char, 'md')}
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center justify-between mb-1">
                                <h3 class="font-semibold text-white text-sm truncate">${char.name}</h3>
                                <div class="flex items-center gap-2">
                                    ${unreadCount > 0 ? `<span class="bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full leading-none">${unreadCount}</span>` : ''}
                                    <span class="text-xs text-gray-500 shrink-0">${lastMessage?.time || ''}</span>
                                </div>
                            </div>
                            <p class="text-xs md:text-sm truncate ${lastMessage?.isError ? 'text-red-400' : 'text-gray-400'}">${lastMessageContent}</p>
                        </div>
                    </div>
                </div>
            `;
    }

    renderAvatar(character, size = 'md') {
        const sizeClasses = {
            sm: 'w-10 h-10 text-sm',
            md: 'w-12 h-12 text-base',
            lg: 'w-16 h-16 text-lg',
        }[size];

        if (character?.avatar && character.avatar.startsWith('data:image')) {
            return `<img src="${character.avatar}" alt="${character.name}" class="${sizeClasses} rounded-full object-cover">`;
        }
        const initial = character?.name?.[0] || `<i data-lucide="bot"></i>`;
        return `
                <div class="${sizeClasses} bg-gradient-to-br from-gray-600 to-gray-700 rounded-full flex items-center justify-center text-white font-medium">
                    ${initial}
                </div>
            `;
    }

    renderMainChat() {
        const mainChat = document.getElementById('main-chat');
        const selectedChat = this.state.characters.find(c => c.id === this.state.selectedChatId);

        if (selectedChat) {
            mainChat.innerHTML = `
                    <header class="p-4 bg-gray-900/80 border-b border-gray-800 glass-effect flex items-center justify-between z-10">
                        <div class="flex items-center space-x-2 md:space-x-4">
                            <button id="mobile-sidebar-toggle" class="p-2 -ml-2 rounded-full hover:bg-gray-700 md:hidden">
                                <i data-lucide="menu" class="h-5 w-5 text-gray-300"></i>
                            </button>
                            ${this.renderAvatar(selectedChat, 'sm')}
                            <div>
                                <h2 class="font-semibold text-white text-base md:text-lg">${selectedChat.name}</h2>
                                <p class="text-xs md:text-sm text-gray-400 flex items-center"><i data-lucide="users" class="w-3 h-3 mr-1.5"></i>대화를 나눠보세요</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-1 md:space-x-2">
                            <button class="p-2 rounded-full bg-gray-800 hover:bg-gray-700"><i data-lucide="phone" class="w-4 h-4 text-gray-300"></i></button>
                            <button class="p-2 rounded-full bg-gray-800 hover:bg-gray-700"><i data-lucide="video" class="w-4 h-4 text-gray-300"></i></button>
                            <button class="p-2 rounded-full bg-gray-800 hover:bg-gray-700"><i data-lucide="more-horizontal" class="w-4 h-4 text-gray-300"></i></button>
                        </div>
                    </header>

                    <div id="messages-container" class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                        ${this.renderMessages()}
                        <div id="messages-end-ref"></div>
                    </div>

                    <div class="p-4 bg-gray-900 border-t border-gray-800">
                        ${this.renderInputArea()}
                    </div>
                `;
        } else {
            mainChat.innerHTML = `
                    <div class="flex-1 flex items-center justify-center text-center p-4">
                        <button id="mobile-sidebar-toggle" class="absolute top-4 left-4 p-2 rounded-full hover:bg-gray-700 md:hidden">
                            <i data-lucide="menu" class="h-5 w-5 text-gray-300"></i>
                        </button>
                        <div>
                            <div class="w-20 h-20 bg-gradient-to-br from-gray-600 to-gray-700 rounded-full flex items-center justify-center mx-auto mb-6"><i data-lucide="bot" class="w-10 h-10 text-white"></i></div>
                            <h3 class="text-xl md:text-2xl font-semibold text-white mb-3">상대를 선택하세요</h3>
                            <p class="text-sm md:text-base text-gray-400 leading-relaxed">사이드 바에서 상대를 선택하여 메시지를 보내세요<br/>혹은 새로운 상대를 초대하세요</p>
                        </div>
                    </div>
                `;
        }
    }

    renderInputArea() {
        const { showInputOptions, isWaitingForResponse, imageToSend } = this.state;
        const hasImage = !!imageToSend;

        let imagePreviewHtml = '';
        if (hasImage) {
            imagePreviewHtml = `
                <div class="p-2 border-b border-gray-700 mb-2">
                    <div class="relative w-20 h-20">
                        <img src="${imageToSend.dataUrl}" class="w-full h-full object-cover rounded-lg">
                        <button id="cancel-image-preview" class="absolute -top-2 -right-2 p-1 bg-gray-900 rounded-full text-white hover:bg-red-500 transition-colors">
                            <i data-lucide="x" class="w-4 h-4 pointer-events-none"></i>
                        </button>
                    </div>
                </div>
                `;
        }

        return `
                <div class="input-area-container relative">
                    ${imagePreviewHtml}
                    ${showInputOptions ? `
                        <div class="absolute bottom-full left-0 mb-2 w-48 bg-gray-700 rounded-xl shadow-lg p-2 animate-fadeIn">
                            <button id="open-image-upload" class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left rounded-lg hover:bg-gray-600">
                                <i data-lucide="image" class="w-4 h-4"></i> 사진 업로드
                            </button>
                        </div>
                    ` : ''}
                    <div class="flex items-end space-x-3">
                        ${!hasImage ? `
                        <button id="open-input-options-btn" class="p-3 bg-gray-800 hover:bg-gray-700 text-white rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 h-[48px]" ${isWaitingForResponse ? 'disabled' : ''}>
                           <i data-lucide="plus" class="w-5 h-5"></i>
                        </button>
                        ` : ''}
                        <div class="flex-1 relative">
                            <textarea id="new-message-input" placeholder="${hasImage ? '캡션 추가...' : '메시지를 입력하세요...'}" class="w-full pl-4 pr-12 py-3 bg-gray-800 text-white rounded-2xl border border-gray-700 resize-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all duration-200 text-sm placeholder-gray-500" rows="1" style="min-height: 48px; max-height: 120px;" ${isWaitingForResponse ? 'disabled' : ''}></textarea>
                            <button id="send-message-btn" 
                                onclick="window.personaApp.handleSendMessage(document.getElementById('new-message-input').value, '${hasImage ? 'image' : 'text'}')" 
                                class="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                                ${isWaitingForResponse || !hasImage ? 'disabled' : ''}>
                                <i data-lucide="send" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
    }

    renderMessages() {
        const messages = this.state.messages[this.state.selectedChatId] || [];
        let html = '';
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            const prevMsg = messages[i - 1];

            const showDateSeparator = (() => {
                if (!prevMsg) return true;
                const prevDate = new Date(prevMsg.id);
                const currentDate = new Date(msg.id);
                return prevDate.getFullYear() !== currentDate.getFullYear() ||
                    prevDate.getMonth() !== currentDate.getMonth() ||
                    prevDate.getDate() !== currentDate.getDate();
            })();

            if (showDateSeparator) {
                html += `<div class="flex justify-center my-4"><div class="flex items-center text-xs text-gray-300 bg-gray-800/80 backdrop-blur-sm px-4 py-1.5 rounded-full shadow-md"><i data-lucide="calendar" class="w-3 h-3.5 mr-2 text-gray-400"></i>${formatDateSeparator(new Date(msg.id))}</div></div>`;
            }

            const groupInfo = findMessageGroup(messages, i);
            const isLastInGroup = i === groupInfo.endIndex;

            if (this.state.editingMessageId === groupInfo.lastMessageId) {
                let editContentHtml = '';
                if (msg.type === 'image') {
                    editContentHtml = `
                            <img src="${msg.imageUrl}" class="max-w-xs max-h-80 rounded-lg object-cover mb-2 cursor-pointer" onclick="window.open('${msg.imageUrl}')">
                            <textarea data-id="${groupInfo.lastMessageId}" class="edit-message-textarea w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-blue-500/50 text-sm" rows="2">${msg.content}</textarea>
                        `;
                } else {
                    const combinedContent = messages.slice(groupInfo.startIndex, groupInfo.endIndex + 1).map(m => m.content).join('\n');
                    editContentHtml = `<textarea data-id="${groupInfo.lastMessageId}" class="edit-message-textarea w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-blue-500/50 text-sm" rows="3">${combinedContent}</textarea>`;
                }

                html += `
                        <div class="flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}">
                            ${editContentHtml}
                            <div class="flex items-center space-x-2 mt-2">
                                <button data-id="${groupInfo.lastMessageId}" class="cancel-edit-btn text-xs text-gray-400 hover:text-white">취소</button>
                                <button data-id="${groupInfo.lastMessageId}" class="save-edit-btn text-xs text-blue-400 hover:text-blue-300">저장</button>
                            </div>
                        </div>
                    `;
                i = groupInfo.endIndex;
                continue;
            }

            const selectedChat = this.state.characters.find(c => c.id === this.state.selectedChatId);
            const showSenderInfo = !msg.isMe && i === groupInfo.startIndex;

            const hasAnimated = this.animatedMessageIds.has(msg.id);
            const needsAnimation = !hasAnimated;
            if (needsAnimation) {
                this.animatedMessageIds.add(msg.id);
            }

            const lastUserMessage = [...messages].reverse().find(m => m.isMe);
            const showUnread = msg.isMe && lastUserMessage && msg.id === lastUserMessage.id && this.state.isWaitingForResponse && !this.state.typingCharacterId;

            let messageBodyHtml = '';
            if (msg.type === 'sticker') { // Fallback for old sticker data
                messageBodyHtml = `<div class="px-4 py-2 rounded-2xl text-sm md:text-base leading-relaxed bg-gray-700 text-gray-400 italic">[삭제된 스티커: ${msg.stickerName || msg.content}]</div>`;
            } else if (msg.type === 'image') {
                const character = this.state.characters.find(c => c.id === this.state.selectedChatId);
                const imageData = character?.media?.find(m => m.id === msg.imageId);
                const imageUrl = imageData ? imageData.dataUrl : imagePlaceholder;

                const imageTag = `<img src="${imageUrl}" class="max-w-xs max-h-80 rounded-lg object-cover cursor-pointer" onclick="window.open('${imageUrl}')">`;
                const captionTag = msg.content ? `<div class="mt-2 px-4 py-2 rounded-2xl text-sm md:text-base leading-relaxed inline-block ${msg.isMe ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-100'}"><div class="break-words">${msg.content}</div></div>` : '';
                messageBodyHtml = `<div class="flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}">${imageTag}${captionTag}</div>`;
            } else {
                messageBodyHtml = `<div class="px-4 py-2 rounded-2xl text-sm md:text-base leading-relaxed ${msg.isMe ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-100'}"><div class="break-words">${msg.content}</div></div>`;
            }

            let actionButtonsHtml = '';
            if (isLastInGroup) {
                const canEdit = msg.isMe && (msg.type === 'text' || (msg.type === 'image' && msg.content));
                const isLastMessageOverall = i === messages.length - 1;
                const canReroll = !msg.isMe && (msg.type === 'text' || msg.type === 'image') && isLastMessageOverall && !this.state.isWaitingForResponse;
                actionButtonsHtml = `
                    <div class="flex items-center gap-2 mt-1.5 h-5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${msg.isMe ? 'justify-end' : ''}">
                        ${canEdit ? `<button data-id="${msg.id}" class="edit-msg-btn text-gray-500 hover:text-white"><i data-lucide="edit-3" class="w-3 h-3 pointer-events-none"></i></button>` : ''}
                        <button data-id="${msg.id}" class="delete-msg-btn text-gray-500 hover:text-white"><i data-lucide="trash-2" class="w-3 h-3 pointer-events-none"></i></button>
                        ${canReroll ? `<button data-id="${msg.id}" class="reroll-msg-btn text-gray-500 hover:text-white"><i data-lucide="refresh-cw" class="w-3 h-3 pointer-events-none"></i></button>` : ''}
                    </div>
                    `;
            }


            html += `
                    <div class="group flex w-full items-start gap-3 ${needsAnimation ? 'animate-slideUp' : ''} ${msg.isMe ? 'flex-row-reverse' : ''}">
                        ${!msg.isMe ? `<div class="shrink-0 w-10 h-10 mt-1">${showSenderInfo ? this.renderAvatar(selectedChat, 'sm') : ''}</div>` : ''}
                        <div class="flex flex-col max-w-[85%] sm:max-w-[75%] ${msg.isMe ? 'items-end' : 'items-start'}">
                            ${showSenderInfo ? `<p class="text-sm text-gray-400 mb-1">${msg.sender}</p>` : ''}
                            <div class="flex items-end gap-2 ${msg.isMe ? 'flex-row-reverse' : ''}">
                                ${showUnread ? `<span class="text-xs text-yellow-400 self-end mb-0.5">1</span>` : ''}
                                <div class="message-content-wrapper">
                                    ${messageBodyHtml}
                                </div>
                                ${isLastInGroup ? `<p class="text-xs text-gray-500 shrink-0 self-end">${msg.time}</p>` : ''}
                            </div>
                            <!-- Action Buttons -->
                            ${actionButtonsHtml}
                        </div>
                    </div>
                `;
        }

        if (this.state.typingCharacterId === this.state.selectedChatId) {
            const selectedChat = this.state.characters.find(c => c.id === this.state.selectedChatId);
            const typingIndicatorId = `typing-${Date.now()}`;
            if (!this.animatedMessageIds.has(typingIndicatorId)) {
                html += `
                        <div id="${typingIndicatorId}" class="flex items-start gap-3 animate-slideUp">
                            <div class="shrink-0 w-10 h-10 mt-1">${this.renderAvatar(selectedChat, 'sm')}</div>
                            <div class="px-4 py-3 rounded-2xl bg-gray-700">
                                <div class="flex items-center space-x-1">
                                    <span class="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style="animation-delay: 0s"></span>
                                    <span class="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style="animation-delay: 0.2s"></span>
                                    <span class="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style="animation-delay: 0.4s"></span>
                                </div>
                            </div>
                        </div>
                    `;
                this.animatedMessageIds.add(typingIndicatorId);
            }
        }

        return html;
    }

    renderModals() {
        const container = document.getElementById('modal-container');
        let html = '';
        if (this.state.showSettingsModal) html += this.renderSettingsModal();
        if (this.state.showCharacterModal) html += this.renderCharacterModal();
        if (this.state.showPromptModal) html += this.renderPromptModal();
        if (this.state.modal.isOpen) html += this.renderConfirmationModal();
        container.innerHTML = html;
    }

    renderSettingsModal() {
        const { settings } = this.state;
        return `
                <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div class="bg-gray-800 rounded-2xl w-full max-w-md mx-4 flex flex-col" style="max-height: 90vh;">
                        <div class="flex items-center justify-between p-6 border-b border-gray-700 shrink-0">
                            <h3 class="text-lg font-semibold text-white">설정</h3>
                            <button id="close-settings-modal" class="p-1 hover:bg-gray-700 rounded-full"><i data-lucide="x" class="w-5 h-5"></i></button>
                        </div>
                        <div class="p-6 space-y-2 overflow-y-auto">
                            <!-- AI 설정 -->
                            <details class="group border-b border-gray-700 pb-2">
                                <summary class="flex items-center justify-between cursor-pointer list-none py-2">
                                    <span class="text-base font-medium text-gray-200">AI 설정</span>
                                    <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180"></i>
                                </summary>
                                <div class="content-wrapper">
                                    <div class="content-inner pt-4 space-y-4">
                                        <div>
                                            <label class="flex items-center text-sm font-medium text-gray-300 mb-2"><i data-lucide="key" class="w-4 h-4 mr-2"></i>API 키</label>
                                            <input id="settings-api-key" type="password" placeholder="Gemini API 키를 입력하세요" value="${settings.apiKey}" class="w-full px-4 py-3 bg-gray-700 text-white rounded-xl border-0 focus:ring-2 focus:ring-blue-500/50 transition-all duration-200 text-sm" />
                                        </div>
                                        <div>
                                            <label class="flex items-center text-sm font-medium text-gray-300 mb-2"><i data-lucide="bot" class="w-4 h-4 mr-2"></i>AI 모델</label>
                                            <div class="flex space-x-2">
                                                <button onclick="window.personaApp.handleModelSelect('gemini-2.5-flash')" class="flex-1 py-2 px-4 rounded-lg transition-colors text-sm ${settings.model === 'gemini-2.5-flash' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}">Flash 2.5</button>
                                                <button onclick="window.personaApp.handleModelSelect('gemini-2.5-pro')" class="flex-1 py-2 px-4 rounded-lg transition-colors text-sm ${settings.model === 'gemini-2.5-pro' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}">Pro 2.5</button>
                                            </div>
                                        </div>
                                        <div>
                                            <button id="open-prompt-modal" class="w-full mt-2 py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                                                <i data-lucide="file-pen-line" class="w-4 h-4"></i> 프롬프트 수정
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </details>
                            <!-- 배율 -->
                            <details class="group border-b border-gray-700 pb-2">
                                <summary class="flex items-center justify-between cursor-pointer list-none py-2">
                                    <span class="text-base font-medium text-gray-200">배율</span>
                                    <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180"></i>
                                </summary>
                                <div class="content-wrapper">
                                    <div class="content-inner pt-4 space-y-4">
                                        <div>
                                            <label class="flex items-center text-sm font-medium text-gray-300 mb-2"><i data-lucide="type" class="w-4 h-4 mr-2"></i>UI 크기</label>
                                            <input id="settings-font-scale" type="range" min="0.8" max="1.4" step="0.1" value="${settings.fontScale}" class="w-full">
                                            <div class="flex justify-between text-xs text-gray-400 mt-1"><span>작게</span><span>크게</span></div>
                                        </div>
                                    </div>
                                </div>
                            </details>
                            <!-- 페르소나 -->
                            <details class="group border-b border-gray-700 pb-2">
                                <summary class="flex items-center justify-between cursor-pointer list-none py-2">
                                    <span class="text-base font-medium text-gray-200">당신의 페르소나</span>
                                    <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180"></i>
                                </summary>
                                <div class="content-wrapper">
                                    <div class="content-inner pt-4 space-y-4">
                                        <div>
                                            <label class="flex items-center text-sm font-medium text-gray-300 mb-2"><i data-lucide="user" class="w-4 h-4 mr-2"></i>당신을 어떻게 불러야 할까요?</label>
                                            <input id="settings-user-name" type="text" placeholder="이름, 혹은 별명을 적어주세요" value="${settings.userName}" class="w-full px-4 py-3 bg-gray-700 text-white rounded-xl border-0 focus:ring-2 focus:ring-blue-500/50 transition-all duration-200 text-sm" />
                                        </div>
                                        <div>
                                            <label class="flex items-center text-sm font-medium text-gray-300 mb-2"><i data-lucide="brain-circuit" class="w-4 h-4 mr-2"></i>당신은 어떤 사람인가요?</label>
                                            <textarea id="settings-user-desc" placeholder="어떤 사람인지 알려주세요" class="w-full px-4 py-3 bg-gray-700 text-white rounded-xl border-0 focus:ring-2 focus:ring-blue-500/50 transition-all duration-200 text-sm" rows="3">${settings.userDescription}</textarea>
                                        </div>
                                    </div>
                                </div>
                            </details>
                             <!-- 선톡 설정 -->
                            <details class="group border-b border-gray-700 pb-2">
                                <summary class="flex items-center justify-between cursor-pointer list-none py-2">
                                    <span class="text-base font-medium text-gray-200">선톡 설정</span>
                                    <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180"></i>
                                </summary>
                                <div class="content-wrapper">
                                    <div class="content-inner pt-4 space-y-4">
                                        <div class="py-2">
                                            <label class="flex items-center justify-between text-sm font-medium text-gray-300 cursor-pointer">
                                                <span class="flex items-center"><i data-lucide="message-square-plus" class="w-4 h-4 mr-2"></i>연락처 내 선톡 활성화</span>
                                                <div class="relative inline-block w-10 align-middle select-none">
                                                    <input type="checkbox" name="toggle" id="settings-proactive-toggle" ${settings.proactiveChatEnabled ? 'checked' : ''} class="absolute opacity-0 w-0 h-0 peer"/>
                                                    <label for="settings-proactive-toggle" class="block overflow-hidden h-6 rounded-full bg-gray-600 cursor-pointer peer-checked:bg-blue-600"></label>
                                                    <span class="absolute left-0.5 top-0.5 block w-5 h-5 rounded-full bg-white transition-transform duration-200 ease-in-out peer-checked:translate-x-4"></span>
                                                </div>
                                            </label>
                                        </div>
                                        <div class="py-2 border-t border-gray-700 mt-2 pt-2">
                                            <label class="flex items-center justify-between text-sm font-medium text-gray-300 cursor-pointer">
                                                <span class="flex items-center"><i data-lucide="shuffle" class="w-4 h-4 mr-2"></i>랜덤 선톡 활성화</span>
                                                <div class="relative inline-block w-10 align-middle select-none">
                                                    <input type="checkbox" name="toggle" id="settings-random-first-message-toggle" ${settings.randomFirstMessageEnabled ? 'checked' : ''} class="absolute opacity-0 w-0 h-0 peer"/>
                                                    <label for="settings-random-first-message-toggle" class="block overflow-hidden h-6 rounded-full bg-gray-600 cursor-pointer peer-checked:bg-blue-600"></label>
                                                    <span class="absolute left-0.5 top-0.5 block w-5 h-5 rounded-full bg-white transition-transform duration-200 ease-in-out peer-checked:translate-x-4"></span>
                                                </div>
                                            </label>
                                            <div id="random-chat-options" class="mt-4 space-y-4" style="display: ${settings.randomFirstMessageEnabled ? 'block' : 'none'}">
                                                <div>
                                                    <label class="flex items-center justify-between text-sm font-medium text-gray-300 mb-2">
                                                        <span>생성할 인원 수</span>
                                                        <span id="random-character-count-label" class="text-blue-400 font-semibold">${settings.randomCharacterCount}명</span>
                                                    </label>
                                                    <input id="settings-random-character-count" type="range" min="1" max="5" step="1" value="${settings.randomCharacterCount}" class="w-full">
                                                </div>
                                                <div>
                                                    <label class="text-sm font-medium text-gray-300 mb-2 block">선톡 시간 간격 (분 단위)</label>
                                                    <div class="flex items-center gap-2">
                                                        <input id="settings-random-frequency-min" type="number" min="1" class="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border-0 focus:ring-2 focus:ring-blue-500/50 text-sm" placeholder="최소" value="${settings.randomMessageFrequencyMin}">
                                                        <span class="text-gray-400">-</span>
                                                        <input id="settings-random-frequency-max" type="number" min="1" class="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border-0 focus:ring-2 focus:ring-blue-500/50 text-sm" placeholder="최대" value="${settings.randomMessageFrequencyMax}">
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </details>
                            <!-- 데이터 관리 -->
                            <details class="group">
                                <summary class="flex items-center justify-between cursor-pointer list-none py-2">
                                    <span class="text-base font-medium text-gray-200">데이터 관리</span>
                                    <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180"></i>
                                </summary>
                                <div class="content-wrapper">
                                    <div class="content-inner pt-4 space-y-2">
                                        <button id="backup-data-btn" class="w-full py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                                            <i data-lucide="download" class="w-4 h-4"></i> 백업하기
                                        </button>
                                        <button id="restore-data-btn" class="w-full py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                                            <i data-lucide="upload" class="w-4 h-4"></i> 불러오기
                                        </button>
                                    </div>
                                </div>
                            </details>
                        </div>
                        <div class="p-6 mt-auto border-t border-gray-700 shrink-0 flex justify-end space-x-3">
                            <button id="close-settings-modal" class="flex-1 py-2.5 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">취소</button>
                            <button id="save-settings" class="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">저장</button>
                        </div>
                    </div>
                </div>
            `;
    }

    renderPromptModal() {
        const { prompts } = this.state.settings;
        const mainPromptSections = {
            '# 시스템 규칙 (System Rules)': { key: 'system_rules', content: prompts.main.system_rules },
            '# AI 역할 및 목표 (Role and Objective)': { key: 'role_and_objective', content: prompts.main.role_and_objective },
            '## 메모리 생성 (Memory Generation)': { key: 'memory_generation', content: prompts.main.memory_generation },
            '## 캐릭터 연기 (Character Acting)': { key: 'character_acting', content: prompts.main.character_acting },
            '## 메시지 작성 스타일 (Message Writing Style)': { key: 'message_writing', content: prompts.main.message_writing },
            '## 언어 (Language)': { key: 'language', content: prompts.main.language },
            '## 추가 지시사항 (Additional Instructions)': { key: 'additional_instructions', content: prompts.main.additional_instructions },
        };

        return `
                <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div class="bg-gray-800 rounded-2xl w-full max-w-2xl mx-4 flex flex-col" style="max-height: 90vh;">
                        <div class="flex items-center justify-between p-6 border-b border-gray-700 shrink-0">
                            <h3 class="text-lg font-semibold text-white">프롬프트 수정</h3>
                            <button id="close-prompt-modal" class="p-1 hover:bg-gray-700 rounded-full"><i data-lucide="x" class="w-5 h-5"></i></button>
                        </div>
                        <div class="p-6 space-y-4 overflow-y-auto">
                            <h4 class="text-base font-semibold text-blue-300 border-b border-blue-300/20 pb-2">메인 채팅 프롬프트</h4>
                            ${Object.entries(mainPromptSections).map(([title, data]) => `
                                <details class="group bg-gray-900/50 rounded-lg">
                                    <summary class="flex items-center justify-between cursor-pointer list-none p-4">
                                        <span class="text-base font-medium text-gray-200">${title}</span>
                                        <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180"></i>
                                    </summary>
                                    <div class="content-wrapper">
                                        <div class="content-inner p-4 border-t border-gray-700">
                                            <textarea id="prompt-main-${data.key}" class="w-full h-64 p-3 bg-gray-700 text-white rounded-lg text-sm font-mono">${data.content}</textarea>
                                        </div>
                                    </div>
                                </details>
                            `).join('')}
                            
                            <h4 class="text-base font-semibold text-blue-300 border-b border-blue-300/20 pb-2 mt-6">랜덤 선톡 캐릭터 생성 프롬프트</h4>
                            <details class="group bg-gray-900/50 rounded-lg">
                                <summary class="flex items-center justify-between cursor-pointer list-none p-4">
                                    <span class="text-base font-medium text-gray-200"># 캐릭터 생성 규칙 (Profile Creation Rules)</span>
                                    <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180"></i>
                                </summary>
                                <div class="content-wrapper">
                                    <div class="content-inner p-4 border-t border-gray-700">
                                        <textarea id="prompt-profile_creation" class="w-full h-64 p-3 bg-gray-700 text-white rounded-lg text-sm font-mono">${prompts.profile_creation}</textarea>
                                    </div>
                                </div>
                            </details>
                        </div>
                        <div class="p-6 mt-auto border-t border-gray-700 shrink-0 flex flex-wrap justify-end gap-3">
                            <button id="backup-prompts-btn" class="py-2 px-4 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors text-sm flex items-center gap-2">
                                <i data-lucide="download" class="w-4 h-4"></i> 프롬프트 백업
                            </button>
                            <button id="restore-prompts-btn" class="py-2 px-4 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors text-sm flex items-center gap-2">
                                <i data-lucide="upload" class="w-4 h-4"></i> 프롬프트 불러오기
                            </button>
                            <div class="flex-grow"></div> <!-- Spacer -->
                            <button id="close-prompt-modal" class="py-2.5 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">취소</button>
                            <button id="save-prompts" class="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">저장</button>
                        </div>
                    </div>
                </div>
            `;
    }

    renderCharacterModal() {
        const { editingCharacter } = this.state;
        const isNew = !editingCharacter || !editingCharacter.id;
        const char = {
            name: editingCharacter?.name || '',
            prompt: editingCharacter?.prompt || '',
            avatar: editingCharacter?.avatar || null,
            responseTime: editingCharacter?.responseTime ?? 5,
            thinkingTime: editingCharacter?.thinkingTime ?? 5,
            reactivity: editingCharacter?.reactivity ?? 5,
            tone: editingCharacter?.tone ?? 5,
            memories: editingCharacter?.memories || [],
            proactiveEnabled: editingCharacter?.proactiveEnabled !== false,
        };

        return `
                <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div class="bg-gray-800 rounded-2xl w-full max-w-md mx-auto my-auto flex flex-col" style="max-height: 90vh;">
                        <div class="flex items-center justify-between p-6 border-b border-gray-700 shrink-0">
                            <h3 class="text-xl font-semibold text-white">${isNew ? '연락처 추가' : '연락처 수정'}</h3>
                            <button id="close-character-modal" class="p-1 hover:bg-gray-700 rounded-full"><i data-lucide="x" class="w-5 h-5"></i></button>
                        </div>
                        <div class="p-6 space-y-6 overflow-y-auto">
                            <div class="flex items-center space-x-4">
                                <div id="avatar-preview" class="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden shrink-0">
                                    ${char.avatar ? `<img src="${char.avatar}" alt="Avatar Preview" class="w-full h-full object-cover">` : `<i data-lucide="image" class="w-8 h-8 text-gray-400"></i>`}
                                </div>
                                <div class="flex flex-col gap-2">
                                    <button id="select-avatar-btn" class="py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                                        <i data-lucide="image" class="w-4 h-4"></i> 프로필 이미지
                                    </button>
                                    <button id="load-card-btn" class="py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                                        <i data-lucide="upload" class="w-4 h-4"></i> 연락처 불러오기
                                    </button>
                                    <button id="save-card-btn" class="py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                                        <i data-lucide="download" class="w-4 h-4"></i> 연락처 공유하기
                                    </button>
                                </div>
                                <input type="file" accept="image/png,image/jpeg" id="avatar-input" class="hidden" />
                                <input type="file" accept="image/png" id="card-input" class="hidden" />
                            </div>
                            <div>
                                <label class="text-sm font-medium text-gray-300 mb-2 block">이름</label>
                                <input id="character-name" type="text" placeholder="이름을 입력하세요" value="${char.name}" class="w-full px-4 py-3 bg-gray-700 text-white rounded-xl border-0 focus:ring-2 focus:ring-blue-500/50 text-sm" />
                            </div>
                            <div>
                                <label class="text-sm font-medium text-gray-300 mb-2 block">인물 정보</label>
                                <textarea id="character-prompt" placeholder="특징, 배경, 관계, 기억 등을 자유롭게 서술해주세요." class="w-full px-4 py-3 bg-gray-700 text-white rounded-xl border-0 focus:ring-2 focus:ring-blue-500/50 text-sm" rows="6">${char.prompt}</textarea>
                            </div>
                            
                            ${this.state.settings.proactiveChatEnabled ? `
                            <div class="border-t border-gray-700 pt-4">
                                <label class="flex items-center justify-between text-sm font-medium text-gray-300 cursor-pointer">
                                    <span class="flex items-center"><i data-lucide="message-square-plus" class="w-4 h-4 mr-2"></i>개별 선톡 허용</span>
                                    <div class="relative inline-block w-10 align-middle select-none">
                                        <input type="checkbox" name="toggle" id="character-proactive-toggle" ${char.proactiveEnabled ? 'checked' : ''} class="absolute opacity-0 w-0 h-0 peer"/>
                                        <label for="character-proactive-toggle" class="block overflow-hidden h-6 rounded-full bg-gray-600 cursor-pointer peer-checked:bg-blue-600"></label>
                                        <span class="absolute left-0.5 top-0.5 block w-5 h-5 rounded-full bg-white transition-transform duration-200 ease-in-out peer-checked:translate-x-4"></span>
                                    </div>
                                </label>
                            </div>` : ''}

                            <!-- 추가 설정 -->
                            <details class="group border-t border-gray-700 pt-4">
                                <summary class="flex items-center justify-between cursor-pointer list-none">
                                    <span class="text-base font-medium text-gray-200">추가 설정</span>
                                    <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180"></i>
                                </summary>
                                <div class="content-wrapper">
                                    <div class="content-inner pt-6 space-y-6">
                                        
                                        <!-- Memory Section -->
                                        <details class="group border-t border-gray-700 pt-2">
                                            <summary class="flex items-center justify-between cursor-pointer list-none py-2">
                                               <h4 class="text-sm font-medium text-gray-300">메모리</h4>
                                               <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180"></i>
                                            </summary>
                                            <div class="content-wrapper">
                                                <div class="content-inner pt-4 space-y-2">
                                                    <div id="memory-container" class="space-y-2">
                                                        ${char.memories.map((mem, index) => this.renderMemoryInput(mem, index)).join('')}
                                                    </div>
                                                    <button id="add-memory-btn" class="mt-3 text-sm text-blue-400 hover:text-blue-300 flex items-center gap-2">
                                                        <i data-lucide="plus-circle" class="w-4 h-4"></i> 메모리 추가
                                                    </button>
                                                </div>
                                            </div>
                                        </details>

                                        <!-- Sliders Section -->
                                        <details class="group border-t border-gray-700 pt-2">
                                            <summary class="flex items-center justify-between cursor-pointer list-none py-2">
                                               <h4 class="text-sm font-medium text-gray-300">메시지 응답성</h4>
                                               <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180"></i>
                                            </summary>
                                            <div class="content-wrapper">
                                                <div class="content-inner pt-4 space-y-4">
                                                    ${this.renderSlider('responseTime', language.characterModalSlider.responseTime.description, language.characterModalSlider.responseTime.low, language.characterModalSlider.responseTime.high, char.responseTime)}
                                                    ${this.renderSlider('thinkingTime', language.characterModalSlider.thinkingTime.description, language.characterModalSlider.thinkingTime.low, language.characterModalSlider.thinkingTime.high, char.thinkingTime)}
                                                    ${this.renderSlider('reactivity', language.characterModalSlider.reactivity.description, language.characterModalSlider.reactivity.low, language.characterModalSlider.reactivity.high, char.reactivity)}
                                                    ${this.renderSlider('tone', language.characterModalSlider.thinkingTime.description, language.characterModalSlider.thinkingTime.low, language.characterModalSlider.thinkingTime.high, char.tone)}
                                                </div>
                                            </div>
                                        </details>
                                    </div>
                                </div>
                            </details>
                        </div>
                        <div class="p-6 mt-auto border-t border-gray-700 shrink-0 flex justify-end space-x-3">
                            <button id="close-character-modal" class="flex-1 py-2.5 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">취소</button>
                            <button id="save-character" class="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">저장</button>
                        </div>
                    </div>
                </div>
            `;
    }

    renderSlider(id, description, left, right, value) {
        return `
                <div>
                    <p class="text-sm font-medium text-gray-300 mb-2">${description}</p>
                    <input id="character-${id}" type="range" min="1" max="10" value="${value}" class="w-full">
                    <div class="flex justify-between text-xs text-gray-400 mt-1">
                        <span>${left}</span>
                        <span>${right}</span>
                    </div>
                </div>
            `;
    }

    renderMemoryInput(memoryText = '', index) {
        return `
                <div class="memory-item flex items-center gap-2">
                    <input type="text" class="memory-input flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border-0 focus:ring-2 focus:ring-blue-500/50 text-sm" value="${memoryText}" placeholder="기억할 내용을 입력하세요...">
                    <button class="delete-memory-btn p-2 text-gray-400 hover:text-red-400">
                        <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
                    </button>
                </div>
            `;
    }

    addMemoryField() {
        const container = document.getElementById('memory-container');
        if (container) {
            container.insertAdjacentHTML('beforeend', this.renderMemoryInput());
            lucide.createIcons();
        }
    }

    renderConfirmationModal() {
        const { title, message, onConfirm } = this.state.modal;
        return `
                <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div class="bg-gray-800 rounded-2xl p-6 w-full max-w-sm mx-4 text-center">
                        <div class="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center mx-auto mb-4">
                            <i data-lucide="alert-triangle" class="w-6 h-6 ${onConfirm ? 'text-red-400' : 'text-blue-400'}"></i>
                        </div>
                        <h3 class="text-lg font-semibold text-white mb-2">${title}</h3>
                        <p class="text-sm text-gray-300 mb-6 whitespace-pre-wrap">${message}</p>
                        <div class="flex justify-stretch space-x-3">
                            <button id="modal-cancel" class="flex-1 py-2.5 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
                                ${onConfirm ? language.confirm.cancel : language.confirm.confirm}
                            </button>
                            ${onConfirm ? `<button id="modal-confirm" class="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">확인</button>` : ''}
                        </div>
                    </div>
                </div>
            `;
    }

    // --- HANDLERS & LOGIC ---
    scrollToBottom() {
        const messagesEnd = document.getElementById('messages-end-ref');
        if (messagesEnd) {
            messagesEnd.scrollIntoView();
        }
    }

    

    handleModelSelect(model) {
        this.setState({ settings: { ...this.state.settings, model } });
    }

    handleSaveSettings() {
        const apiKey = document.getElementById('settings-api-key').value.trim();
        const userName = document.getElementById('settings-user-name').value;
        const userDescription = document.getElementById('settings-user-desc').value;
        const model = this.state.settings.model;
        const proactiveChatEnabled = document.getElementById('settings-proactive-toggle').checked;
        const randomFirstMessageEnabled = document.getElementById('settings-random-first-message-toggle').checked;
        const randomCharacterCount = parseInt(document.getElementById('settings-random-character-count').value, 10);
        const randomMessageFrequencyMin = parseInt(document.getElementById('settings-random-frequency-min').value, 10) || 10;
        const randomMessageFrequencyMax = parseInt(document.getElementById('settings-random-frequency-max').value, 10) || 120;

        const fontScale = parseFloat(document.getElementById('settings-font-scale').value);

        const wasRandomDisabled = !this.state.settings.randomFirstMessageEnabled;
        const newSettings = {
            ...this.state.settings,
            apiKey,
            userName,
            userDescription,
            model,
            proactiveChatEnabled,
            randomFirstMessageEnabled,
            randomCharacterCount,
            randomMessageFrequencyMin,
            randomMessageFrequencyMax,
            fontScale,
        };

        this.setState({
            settings: newSettings,
            showSettingsModal: false
        });

        if (wasRandomDisabled && randomFirstMessageEnabled) {
            this.scheduleMultipleRandomChats();
        }
    }

    handleSavePrompts() {
        const newPrompts = {
            main: {
                system_rules: document.getElementById('prompt-main-system_rules').value,
                role_and_objective: document.getElementById('prompt-main-role_and_objective').value,
                memory_generation: document.getElementById('prompt-main-memory_generation').value,
                character_acting: document.getElementById('prompt-main-character_acting').value,
                message_writing: document.getElementById('prompt-main-message_writing').value,
                language: document.getElementById('prompt-main-language').value,
                additional_instructions: document.getElementById('prompt-main-additional_instructions').value,
            },
            profile_creation: document.getElementById('prompt-profile_creation').value,
        };

        this.setState({
            settings: { ...this.state.settings, prompts: newPrompts },
            showPromptModal: false
        });
        showInfoModal(this.setState.bind(this), language.modal.promptSaveComplete.title, language.modal.promptSaveComplete.message);
    }

    openNewCharacterModal() {
        this.setState({ editingCharacter: { memories: [], proactiveEnabled: true }, showCharacterModal: true });
    }

    openEditCharacterModal(character) {
        this.setState({ editingCharacter: { ...character, memories: character.memories || [] }, showCharacterModal: true });
    }

    closeCharacterModal() {
        this.setState({ showCharacterModal: false, editingCharacter: null });
    }

    handleAvatarChange(e, isCard = false) {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (isCard) {
                loadCharacterFromImage(this.setState.bind(this), this.state.editingCharacter, language, decodeTextFromImage, file);
            } else {
                toBase64(file).then(base64 => {
                    const currentEditing = this.state.editingCharacter || {};
                    this.setState({ editingCharacter: { ...currentEditing, avatar: base64 } });
                });
            }
        }
    }

    async handleSaveCharacter() {
        const name = document.getElementById('character-name').value.trim();
        const prompt = document.getElementById('character-prompt').value.trim();

        if (!name || !prompt) {
            showInfoModal(this.setState.bind(this), language.modal.characterNameDescriptionNotFulfilled.title, language.modal.characterNameDescriptionNotFulfilled.message);
            return;
        }

        const memoryNodes = document.querySelectorAll('.memory-input');
        const memories = Array.from(memoryNodes).map(input => input.value.trim()).filter(Boolean);

        const proactiveToggle = document.getElementById('character-proactive-toggle');
        const proactiveEnabled = proactiveToggle ? proactiveToggle.checked : this.state.editingCharacter?.proactiveEnabled !== false;

        const characterData = {
            name,
            prompt,
            avatar: this.state.editingCharacter?.avatar || null,
            responseTime: document.getElementById('character-responseTime').value,
            thinkingTime: document.getElementById('character-thinkingTime').value,
            reactivity: document.getElementById('character-reactivity').value,
            tone: document.getElementById('character-tone').value,
            memories,
            proactiveEnabled,
            messageCountSinceLastSummary: this.state.editingCharacter?.messageCountSinceLastSummary || 0,
            media: this.state.editingCharacter?.media || [] // Preserve existing media
        };

        if (this.state.editingCharacter && this.state.editingCharacter.id) {
            const updatedCharacters = this.state.characters.map(c =>
                c.id === this.state.editingCharacter.id ? { ...c, ...characterData } : c
            );
            this.setState({ characters: updatedCharacters });
        } else {
            const newCharacter = { id: Date.now(), ...characterData, messageCountSinceLastSummary: 0, proactiveEnabled: true, media: [] };
            const newCharacters = [newCharacter, ...this.state.characters];
            const newMessages = { ...this.state.messages, [newCharacter.id]: [] };
            this.setState({
                characters: newCharacters,
                messages: newMessages,
                selectedChatId: newCharacter.id
            });
        }
        this.closeCharacterModal();
    }

    handleDeleteCharacter(characterId) {
        showConfirmModal(this.setState.bind(this), 
            language.modal.deleteCharacter.title, language.modal.deleteCharacter.message,
            () => {
                const newCharacters = this.state.characters.filter(c => c.id !== characterId);
                const newMessages = { ...this.state.messages };
                delete newMessages[characterId];

                let newSelectedChatId = this.state.selectedChatId;
                if (this.state.selectedChatId === characterId) {
                    newSelectedChatId = newCharacters.length > 0 ? newCharacters[0].id : null;
                }

                this.setState({
                    characters: newCharacters,
                    messages: newMessages,
                    selectedChatId: newSelectedChatId
                });
            }
        );
    }

    async handleImageFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            showInfoModal(this.setState.bind(this), language.modal.imageFileSizeExceeded.title, language.modal.imageFileSizeExceeded.message);
            e.target.value = '';
            return;
        }

        try {
            const resizedDataUrl = await resizeImage(file, 800, 800); // Resize to max 800x800
            this.setState({
                imageToSend: { dataUrl: resizedDataUrl, file },
                showInputOptions: false
            });
        } catch (error) {
            console.error("Image processing error:", error);
            showInfoModal(this.setState.bind(this), language.modal.imageProcessingError.title, language.modal.imageProcessingError.message);
        } finally {
            e.target.value = '';
        }
    }

    async handleSendMessage(content, type = 'text') {
        const { selectedChatId, isWaitingForResponse, settings, imageToSend } = this.state;

        if (!selectedChatId || isWaitingForResponse) return;
        if (type === 'text' && !content.trim() && !imageToSend) return;
        if (type === 'image' && !imageToSend) return;

        if (!settings.apiKey) {
            showInfoModal(this.setState.bind(this), language.modal.apiKeyRequired.title, language.modal.apiKeyRequired.message);
            this.setState({ showSettingsModal: true });
            return;
        }

        const userMessage = {
            id: Date.now(),
            sender: 'user',
            type: type,
            content: content,
            time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
            isMe: true
        };

        const charIndex = this.state.characters.findIndex(c => c.id === selectedChatId);
        if (charIndex === -1) return;
        const updatedCharacters = [...this.state.characters];

        if (type === 'image') {
            const character = { ...updatedCharacters[charIndex] };
            if (!character.media) {
                character.media = [];
            }
            const newImage = {
                id: `img_${Date.now()}`,
                dataUrl: imageToSend.dataUrl,
                mimeType: imageToSend.file.type
            };
            character.media.push(newImage);
            updatedCharacters[charIndex] = character;

            userMessage.imageId = newImage.id;
        }

        const newMessagesForChat = [...(this.state.messages[selectedChatId] || []), userMessage];
        const newMessagesState = { ...this.state.messages, [selectedChatId]: newMessagesForChat };

        if (type === 'text' || type === 'image') {
            const messageInput = document.getElementById('new-message-input');
            if (messageInput) {
                messageInput.value = '';
                messageInput.style.height = 'auto';
            }
        }

        const character = { ...updatedCharacters[charIndex] };
        character.messageCountSinceLastSummary = (character.messageCountSinceLastSummary || 0) + 1;

        let forceSummary = false;
        if (character.messageCountSinceLastSummary >= 30) {
            forceSummary = true;
            character.messageCountSinceLastSummary = 0; // Reset
        }
        updatedCharacters[charIndex] = character;

        this.setState({
            messages: newMessagesState,
            isWaitingForResponse: true,
            characters: updatedCharacters,
            imageToSend: null, // Clear preview
        });

        this.triggerApiCall(newMessagesState, false, false, forceSummary);
    }

    async triggerApiCall(currentMessagesState, isProactive = false, isReroll = false, forceSummary = false) {
        const chatId = isProactive ? currentMessagesState.id : this.state.selectedChatId;
        const character = this.state.characters.find(c => c.id === chatId);

        let history;
        if (isProactive) {
            history = this.state.messages[chatId] || [];
            if (history.length > 0 && !history[history.length - 1].isMe) {
                history = history.slice(0, -1);
            }
        } else if (isReroll) {
            history = currentMessagesState;
        } else {
            history = currentMessagesState[chatId] || [];
        }

        if (!character) {
            this.setState({ isWaitingForResponse: false });
            return;
        }

        const response = await this.callGeminiAPI(this.state.settings.apiKey, this.state.settings.model, this.state.settings.userName, this.state.settings.userDescription, character, history, isProactive, forceSummary);

        if (response.newMemory && response.newMemory.trim() !== '') {
            const charIndex = this.state.characters.findIndex(c => c.id === chatId);
            if (charIndex !== -1) {
                const updatedCharacters = [...this.state.characters];
                const charToUpdate = { ...updatedCharacters[charIndex] };
                charToUpdate.memories = charToUpdate.memories || [];
                charToUpdate.memories.push(response.newMemory.trim());
                updatedCharacters[charIndex] = charToUpdate;
                this.setState({ characters: updatedCharacters });
                console.log(`[Memory Added] for ${charToUpdate.name}: ${response.newMemory.trim()}`);
            }
        }

        await sleep(response.reactionDelay || 1000);
        this.setState({ isWaitingForResponse: false, typingCharacterId: chatId });


        if (response.messages && Array.isArray(response.messages) && response.messages.length > 0) {
            let currentChatMessages = this.state.messages[chatId] || [];
            let newUnreadCounts = { ...this.state.unreadCounts };

            for (let i = 0; i < response.messages.length; i++) {
                const messagePart = response.messages[i];

                await sleep(messagePart.delay || 1000);

                const botMessage = {
                    id: Date.now() + Math.random(),
                    sender: character.name,
                    content: messagePart.content,
                    time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
                    isMe: false,
                    isError: false,
                    type: 'text',
                };

                currentChatMessages = [...currentChatMessages, botMessage];

                if (isProactive && chatId !== this.state.selectedChatId) {
                    newUnreadCounts[chatId] = (newUnreadCounts[chatId] || 0) + 1;
                }

                this.setState({
                    messages: { ...this.state.messages, [chatId]: currentChatMessages },
                    unreadCounts: newUnreadCounts
                });
            }
        } else {
            const errorMessage = {
                id: Date.now() + 1,
                sender: 'System',
                content: response.error || language.chat.messageGenerationError,
                time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
                isMe: false,
                isError: true,
                type: 'text'
            };
            const currentChatMessages = this.state.messages[chatId] || [];
            this.setState({
                messages: { ...this.state.messages, [chatId]: [...currentChatMessages, errorMessage] },
            });
        }

        this.setState({ typingCharacterId: null });
    }

    async checkAndSendProactiveMessages() {
        if (this.state.isWaitingForResponse || !this.state.settings.apiKey || !this.state.settings.proactiveChatEnabled) {
            return;
        }

        const eligibleCharacters = this.state.characters.filter(char => {
            if (char.proactiveEnabled === false) {
                return false;
            }

            const reactivity = parseInt(char.reactivity, 10) || 5;

            const probability = 1.0 - (reactivity * 0.095);
            if (Math.random() > probability) {
                return false;
            }

            const timeThreshold = reactivity * 60000;

            const history = this.state.messages[char.id];

            if (!history || history.length === 0) {
                return true;
            }

            const lastMessage = history[history.length - 1];
            const timeSinceLastMessage = Date.now() - lastMessage.id;
            return timeSinceLastMessage > timeThreshold;
        });

        if (eligibleCharacters.length > 0) {
            const character = eligibleCharacters[Math.floor(Math.random() * eligibleCharacters.length)];
            console.log(`[Proactive] Sending message from ${character.name}`);
            await this.handleProactiveMessage(character);
        }
    }

    async handleProactiveMessage(character) {
        this.setState({ isWaitingForResponse: true });
        await this.triggerApiCall(character, true, false, false);
    }

    scheduleMultipleRandomChats() {
        const { randomCharacterCount, randomMessageFrequencyMin, randomMessageFrequencyMax } = this.state.settings;

        const minMs = randomMessageFrequencyMin * 60000;
        const maxMs = randomMessageFrequencyMax * 60000;

        for (let i = 0; i < randomCharacterCount; i++) {
            const randomDelay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
            console.log(`Scheduling random character ${i + 1}/${randomCharacterCount} in ${randomDelay / 1000} seconds.`);
            setTimeout(() => this.initiateSingleRandomCharacter(), randomDelay);
        }
    }

    async initiateSingleRandomCharacter() {
        const { apiKey, model, userName, userDescription } = this.state.settings;
        if (!userName.trim() || !userDescription.trim()) {
            console.warn("Cannot generate random character: User persona is not set.");
            return;
        }

        try {
            const profile = await this.callGeminiAPIForProfile(apiKey, model, userName, userDescription);
            if (profile.error) throw new Error(profile.error);

            const tempCharacter = {
                id: Date.now() + Math.random(),
                name: profile.name,
                prompt: profile.prompt,
                avatar: null,
                responseTime: String(Math.floor(Math.random() * 5) + 3),
                thinkingTime: String(Math.floor(Math.random() * 5) + 3),
                reactivity: String(Math.floor(Math.random() * 5) + 4),
                tone: String(Math.floor(Math.random() * 5) + 2),
                memories: [],
                proactiveEnabled: true,
                media: [],
                messageCountSinceLastSummary: 0,
                isRandom: true
            };

            const response = await this.callGeminiAPI(apiKey, model, userName, userDescription, tempCharacter, [], true, false);
            if (response.error) throw new Error(response.error);
            if (!response.messages || response.messages.length === 0) throw new Error("API did not return a first message.");

            const firstMessages = response.messages.map(msgPart => ({
                id: Date.now() + Math.random(),
                sender: tempCharacter.name,
                content: msgPart.content,
                time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
                isMe: false,
                isError: false,
                type: 'text',
            }));

            const newCharacters = [tempCharacter, ...this.state.characters];
            const newMessages = { ...this.state.messages, [tempCharacter.id]: firstMessages };
            const newUnreadCounts = { ...this.state.unreadCounts, [tempCharacter.id]: firstMessages.length };

            this.setState({
                characters: newCharacters,
                messages: newMessages,
                unreadCounts: newUnreadCounts
            });

        } catch (error) {
            console.error("Failed to generate and initiate single random character:", error);
        }
    }

    handleDeleteMessage(lastMessageId) {
        showConfirmModal(this.setState.bind(this), language.modal.messageGroupDeleteConfirm.title, language.modal.messageGroupDeleteConfirm.message, () => {
            const currentMessages = this.state.messages[this.state.selectedChatId] || [];
            const groupInfo = findMessageGroup(currentMessages, currentMessages.findIndex(msg => msg.id === lastMessageId));
            if (!groupInfo) return;

            const updatedMessages = [
                ...currentMessages.slice(0, groupInfo.startIndex),
                ...currentMessages.slice(groupInfo.endIndex + 1)
            ];

            this.setState({
                messages: {
                    ...this.state.messages,
                    [this.state.selectedChatId]: updatedMessages
                }
            });
        });
    }

    async handleSaveEditedMessage(lastMessageId) {
        const textarea = document.querySelector(`.edit-message-textarea[data-id="${lastMessageId}"]`);
        if (!textarea) return;
        const newContent = textarea.value.trim();

        const currentMessages = this.state.messages[this.state.selectedChatId] || [];
        const groupInfo = findMessageGroup(currentMessages, currentMessages.findIndex(msg => msg.id === lastMessageId));
        if (!groupInfo) return;

        const originalMessage = currentMessages[groupInfo.startIndex];
        if (originalMessage.type === 'text' && !newContent) {
            showInfoModal(this.setState.bind(this), language.modal.messageEmptyError.title, language.modal.messageEmptyError.message);
            return;
        }

        const editedMessage = {
            ...originalMessage,
            id: Date.now(),
            content: newContent,
            time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        };

        const messagesBefore = currentMessages.slice(0, groupInfo.startIndex);
        const updatedMessages = [...messagesBefore, editedMessage];

        const newMessagesState = {
            ...this.state.messages,
            [this.state.selectedChatId]: updatedMessages
        };

        this.setState({
            messages: newMessagesState,
            editingMessageId: null,
            isWaitingForResponse: true
        });

        await this.triggerApiCall(updatedMessages, false, true, false);
    }

    async handleRerollMessage(lastMessageId) {
        const currentMessages = this.state.messages[this.state.selectedChatId] || [];
        const groupInfo = findMessageGroup(currentMessages, currentMessages.findIndex(msg => msg.id === lastMessageId));
        if (!groupInfo) return;

        const truncatedMessages = currentMessages.slice(0, groupInfo.startIndex);

        const newMessagesState = {
            ...this.state.messages,
            [this.state.selectedChatId]: truncatedMessages
        };

        this.setState({
            messages: newMessagesState,
            isWaitingForResponse: true
        });

        await this.triggerApiCall(truncatedMessages, false, true, false);
    }

    handleEditMessage(lastMessageId) {
        this.setState({ editingMessageId: lastMessageId });
    }


    

    

    // --- KEYBOARD VISIBILITY HANDLER ---
    addKeyboardListeners() {
        if (!('visualViewport' in window)) {
            console.log("visualViewport API가 지원되지 않아 키보드 핸들링이 최적화되지 않을 수 있습니다.");
            return;
        }

        const appElement = document.getElementById('app');

        const handleViewportResize = () => {
            const viewport = window.visualViewport;
            appElement.style.height = `${viewport.height}px`;
            const activeElement = document.activeElement;
            const isInputActive = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');

            if (isInputActive) {
                setTimeout(() => {
                    activeElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest'
                    });
                }, 150);
            }
        };

        window.visualViewport.addEventListener('resize', handleViewportResize);
    }

    // --- DETAILS/SUMMARY ANIMATION HANDLER ---
    handleDetailsToggle(e) {
        e.preventDefault();
        const details = e.target.closest('details');
        if (!details) return;

        const contentWrapper = details.querySelector('.content-wrapper');
        if (!contentWrapper || details.dataset.animating === 'true') return;

        details.dataset.animating = 'true';

        if (details.open) {
            // Closing
            const height = contentWrapper.offsetHeight;
            contentWrapper.style.height = `${height}px`;

            requestAnimationFrame(() => {
                contentWrapper.style.transition = 'height 0.3s ease-in-out';
                contentWrapper.style.height = '0px';
            });

            contentWrapper.addEventListener('transitionend', () => {
                details.removeAttribute('open');
                contentWrapper.style.removeProperty('height');
                contentWrapper.style.removeProperty('transition');
                delete details.dataset.animating;
            }, { once: true });

        } else {
            // Opening
            details.setAttribute('open', '');
            const height = contentWrapper.scrollHeight;
            contentWrapper.style.height = '0px';
            contentWrapper.style.transition = 'height 0.3s ease-in-out';

            requestAnimationFrame(() => {
                contentWrapper.style.height = `${height}px`;
            });

            contentWrapper.addEventListener('transitionend', () => {
                contentWrapper.style.removeProperty('height');
                contentWrapper.style.removeProperty('transition');
                delete details.dataset.animating;
            }, { once: true });
        }
    }

    // --- CHARACTER CARD FUNCTIONS ---
    

    

    

    // --- BACKUP & RESTORE ---
    handleBackup() {
        try {
            const backupData = {
                settings: this.loadFromLocalStorage('personaChat_settings_v16', {}),
                characters: this.loadFromLocalStorage('personaChat_characters_v16', []),
                messages: this.loadFromLocalStorage('personaChat_messages_v16', {}),
                unreadCounts: this.loadFromLocalStorage('personaChat_unreadCounts_v16', {}),
            };

            const jsonString = JSON.stringify(backupData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            const date = new Date().toISOString().slice(0, 10);
            a.download = `arisutalk_backup_${date}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showInfoModal(this.setState.bind(this), language.modal.backupComplete.title, language.modal.backupComplete.message);
        } catch (error) {
            console.error("Backup failed:", error);
            showInfoModal(this.setState.bind(this), language.modal.backupFailed.title, language.modal.backupFailed.message);
        }
    }

    handleRestore(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const backupData = JSON.parse(event.target.result);

                // Basic validation
                if (backupData.settings && backupData.characters && backupData.messages && backupData.unreadCounts) {
                    showConfirmModal(this.setState.bind(this),
                        language.modal.restoreConfirm.title,
                        language.modal.restoreConfirm.message,
                        () => {
                            this.saveToLocalStorage('personaChat_settings_v16', backupData.settings);
                            this.saveToLocalStorage('personaChat_characters_v16', backupData.characters);
                            this.saveToLocalStorage('personaChat_messages_v16', backupData.messages);
                            this.saveToLocalStorage('personaChat_unreadCounts_v16', backupData.unreadCounts);

                            showInfoModal(this.setState.bind(this), language.modal.restoreComplete.title, language.modal.restoreComplete.message);
                            // Use a timeout to allow the user to see the confirmation modal before reloading
                            setTimeout(() => {
                                window.location.reload();
                            }, 2000);
                        }
                    );
                } else {
                    throw new Error("Invalid backup file format.");
                }
            } catch (error) {
                console.error("Restore failed:", error);
                showInfoModal(this.setState.bind(this), language.modal.restoreFailed.title, language.modal.restoreFailed.message);
            } finally {
                // Reset file input so the same file can be selected again
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    }

    handleBackupPrompts() {
        try {
            const promptsToBackup = this.state.settings.prompts;

            const jsonString = JSON.stringify(promptsToBackup, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            const date = new Date().toISOString().slice(0, 10);
            a.download = `arisutalk_prompts_backup_${date}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showInfoModal(this.setState.bind(this), language.modal.promptBackupComplete.title, language.modal.promptBackupComplete.message);
        } catch (error) {
            console.error("Prompt backup failed:", error);
            showInfoModal(this.setState.bind(this), language.modal.promptBackupFailed.title, language.modal.promptBackupFailed.message);
        }
    }

    handleRestorePrompts(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const restoredPrompts = JSON.parse(event.target.result);

                // Basic validation
                if (restoredPrompts.main && restoredPrompts.profile_creation &&
                    typeof restoredPrompts.main.system_rules === 'string'
                ) {
                    showConfirmModal(this.setState.bind(this),
                        language.modal.promptRestoreConfirm.title,
                        language.modal.promptRestoreConfirm.message,
                        () => {
                            const newPrompts = {
                                main: {
                                    ...this.defaultPrompts.main,
                                    ...(restoredPrompts.main || {})
                                },
                                profile_creation: restoredPrompts.profile_creation || this.defaultPrompts.profile_creation
                            };

                            // Just update the state. The re-render logic will handle the UI update.
                            this.setState({
                                settings: {
                                    ...this.state.settings,
                                    prompts: newPrompts
                                }
                            });
                        }
                    );
                } else {
                    throw new Error("Invalid prompts backup file format.");
                }
            } catch (error) {
                console.error("Prompt restore failed:", error);
                showInfoModal(this.setState.bind(this), language.modal.promptRestoreFailed.title, language.modal.promptRestoreFailed.message);
            } finally {
                // Reset file input so the same file can be selected again
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    }

    // --- API CALL ---
    async callGeminiAPIForProfile(apiKey, model, userName, userDescription) {
        const profilePrompt = this.state.settings.prompts.profile_creation
            .replace('{userName}', userName)
            .replace('{userDescription}', userDescription);

        const payload = {
            contents: [{
                parts: [{ text: "Please generate a character profile based on the instructions." }]
            }],
            systemInstruction: {
                parts: [{ text: profilePrompt }]
            },
            generationConfig: {
                temperature: 1.2,
                topP: 0.95,
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "name": { "type": "STRING" },
                        "prompt": { "type": "STRING" }
                    },
                    required: ["name", "prompt"]
                }
            },
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ]
        };

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                console.error("Profile Gen API Error:", data);
                const errorMessage = data?.error?.message || `API 요청 실패: ${response.statusText}`;
                throw new Error(errorMessage);
            }

            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content?.parts[0]?.text) {
                return JSON.parse(data.candidates[0].content.parts[0].text);
            } else {
                const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || '알 수 없는 이유';
                console.warn("Profile Gen API 응답에 유효한 content가 없습니다.", data);
                throw new Error(`프로필이 생성되지 않았습니다. (이유: ${reason})`);
            }
        } catch (error) {
            console.error("프로필 생성 API 호출 중 오류 발생:", error);
            return { error: error.message };
        }
    }

    async callGeminiAPI(apiKey, model, userName, userDescription, character, history, isProactive = false, forceSummary = false) {
        let contents = [];
        for (const msg of history) {
            const role = msg.isMe ? "user" : "model";
            let parts = [];

            if (msg.isMe && msg.type === 'image' && msg.imageId) {
                const imageData = character?.media?.find(m => m.id === msg.imageId);
                if (imageData) {
                    let textContent = msg.content || "(User sent an image with no caption)";
                    parts.push({ text: textContent });
                    parts.push({
                        inlineData: {
                            mimeType: imageData.mimeType || 'image/jpeg',
                            data: imageData.dataUrl.split(',')[1]
                        }
                    });
                } else {
                    parts.push({ text: msg.content || "(User sent an image that is no longer available)" });
                }
            } else if (msg.content) {
                parts.push({ text: msg.content });
            }

            if (parts.length > 0) {
                contents.push({ role, parts });
            }
        }

        if (isProactive && contents.length === 0) {
            contents.push({
                role: "user",
                parts: [{ text: "(SYSTEM: You are starting this conversation. Please begin.)" }]
            });
        }

        const lastMessageTime = history.length > 0 ? new Date(history[history.length - 1].id) : new Date();
        const currentTime = new Date();
        const timeDiff = Math.round((currentTime - lastMessageTime) / 1000 / 60);

        let timeContext = `(Context: It's currently ${currentTime.toLocaleString('en-US')}.`;
        if (isProactive) {
            const isFirstContactEver = history.length === 0;
            if (character.isRandom && isFirstContactEver) {
                timeContext += ` You are initiating contact for the very first time. You found the user's profile interesting and decided to reach out. Your first message MUST reflect this. Greet them and explain why you're contacting them, referencing their persona. This is a special instruction just for this one time.)`;
            } else if (isFirstContactEver) {
                timeContext += ` You are starting this conversation for the first time. Greet the user and start a friendly conversation.)`;
            } else {
                timeContext += ` It's been ${timeDiff} minutes since the conversation paused. You MUST initiate a new conversation topic. Ask a question or make an observation completely unrelated to the last few messages. Your goal is to re-engage the user with something fresh. Do not continue the previous train of thought.)`;
            }
        } else {
            if (history.length > 0) {
                timeContext += ` The last message was sent ${timeDiff} minutes ago.)`;
            } else {
                timeContext += ` This is the beginning of the conversation.)`;
            }
        }
        if (forceSummary) {
            timeContext += ` (summarize_memory: true)`;
        }

        const prompts = this.state.settings.prompts.main;
        const guidelines = [
            prompts.memory_generation,
            prompts.character_acting,
            prompts.message_writing,
            prompts.language,
            prompts.additional_instructions
        ].join('\n\n');

        const masterPrompt = `
# System Rules
${prompts.system_rules}

## Role and Objective of Assistant
${prompts.role_and_objective.replace(/{character.name}/g, character.name)}

## Informations
The information is composed of the settings and memories of ${character.name}, <user>, and the worldview in which they live.

# User Profile
Information of <user> that user will play.
- User's Name: ${userName || 'Not specified. You can ask.'}
- User's Description: ${userDescription || 'No specific information provided about the user.'}

# Character Profile & Additional Information
This is the information about the character, ${character.name}, you must act.
Settings of Worldview, features, and Memories of ${character.name} and <user>, etc.
${character.prompt}

# Memory
This is a list of key memories the character has. Use them to maintain consistency and recall past events.
${character.memories && character.memories.length > 0 ? character.memories.map(mem => `- ${mem}`).join('\n') : 'No specific memories recorded yet.'}

# Character Personality Sliders (1=Left, 10=Right)
- 응답시간 (${character.responseTime}/10): "거의 즉시" <-> "전화를 걸어야함". This is the character's general speed to check the user's message. This MUST affect your 'reactionDelay' value. A low value means very fast replies (e.g., 50-2000ms). A high value means very slow replies (e.g., 30000-180000ms), as if busy.
- 생각 시간 (${character.thinkingTime}/10): "사색에 잠김" <-> "메시지를 보내고 생각". This is how long the character thinks before sending messages. This MUST affect the 'delay' value in the 'messages' array. A low value (e.g., 1) means longer, more thoughtful delays (e.g., 30000-90000ms, as if deep in thought). A high value (e.g., 10) means short, impulsive delays (e.g., 500-2000ms, as if sending messages without much thought).
- 반응성 (${character.reactivity}/10): "활발한 JK 갸루" <-> "무뚝뚝함". This is how actively the character engages in conversation. This affects your energy level, engagement, and tendency to start a conversation (proactive chat).
- 어조/말투 (${character.tone}/10): "공손하고 예의바름" <-> "싸가지 없음". This is the character's politeness and language style. A low value means polite and gentle. A high value means rude and blunt.
*These are general tendencies. Adapt to the situation.*

I read all Informations carefully. First, let's remind my Guidelines again.

[## Guidelines]
${guidelines.replace(/{character.name}/g, character.name).replace('{timeContext}', timeContext).replace('{timeDiff}', timeDiff)}
            `;

        const payload = {
            contents: contents,
            systemInstruction: {
                parts: [{ text: masterPrompt }]
            },
            generationConfig: {
                temperature: 1.25,
                topK: 40,
                topP: 0.95,
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "reactionDelay": { "type": "INTEGER" },
                        "messages": {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    "delay": { "type": "INTEGER" },
                                    "content": { "type": "STRING" }
                                },
                                required: ["delay", "content"]
                            }
                        },
                        "newMemory": { "type": "STRING" }
                    },
                    required: ["reactionDelay", "messages"]
                }
            },
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ]
        };

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                console.error("API Error:", data);
                const errorMessage = data?.error?.message || `API 요청 실패: ${response.statusText}`;
                throw new Error(errorMessage);
            }

            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content?.parts[0]?.text) {
                const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
                parsed.reactionDelay = Math.max(0, parsed.reactionDelay || 0);
                return parsed;
            } else {
                const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || '알 수 없는 이유';
                console.warn("API 응답에 유효한 content가 없습니다.", data);
                throw new Error(`답변이 생성되지 않았습니다. (이유: ${reason})`);
            }

        } catch (error) {
            console.error("Gemini API 호출 중 오류 발생:", error);
            if (error.message.includes("User location is not supported")) {
                return { error: `죄송합니다. 현재 계신 국가에서는 Gemini API 사용이 지원되지 않습니다.` };
            }
            return { error: `응답 처리 중 오류가 발생했습니다: ${error.message}` };
        }
    }
}