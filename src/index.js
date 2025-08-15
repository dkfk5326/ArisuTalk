import { language } from "./language.js";
import { defaultPrompts, defaultCharacters } from "./defauts.js";

// --- APP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    window.personaApp = new PersonaChatApp();
    await window.personaApp.init();
});

class PersonaChatApp {
    constructor() {
        // --- DEFAULT PROMPTS ---
        this.defaultPrompts = defaultPrompts;

        // --- STATE MANAGEMENT ---
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
                prompts: {
                    main: { ...this.defaultPrompts.main },
                    profile_creation: this.defaultPrompts.profile_creation
                }
            },
            characters: defaultCharacters, // 비동기 로딩으로 변경
            chatRooms: {}, // 비동기 로딩으로 변경
            messages: {}, // 비동기 로딩으로 변경
            unreadCounts: {}, // 비동기 로딩으로 변경
            userStickers: [], // 비동기 로딩으로 변경
            selectedChatId: null, // 이제 chatRoomId를 의미
            expandedCharacterId: null, // 채팅방 목록이 펼쳐진 캐릭터
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
            stickerSelectionMode: false,
            selectedStickerIndices: [],
            showUserStickerPanel: false,
            expandedStickers: new Set(), // 확장된 스티커들의 ID 집합
        };
        this.messagesEndRef = null;
        this.proactiveInterval = null;
        this.animatedMessageIds = new Set();
    }

    // --- CORE METHODS ---
    async init() {
        this.applyFontScale();
        this.addKeyboardListeners();
        
        // IndexedDB에서 데이터 로드
        await this.loadAllData();
        
        // 기존 데이터를 새로운 구조로 마이그레이션
        await this.migrateChatData();
        
        this.render();
        this.addEventListeners();
        const initialChatId = this.getFirstAvailableChatRoom();
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

    async loadAllData() {
        try {
            // 모든 데이터를 병렬로 로드
            const [settings, characters, chatRooms, messages, unreadCounts, userStickers] = await Promise.all([
                this.loadFromLocalStorage('personaChat_settings_v16', {}),
                this.loadFromLocalStorage('personaChat_characters_v16', defaultCharacters),
                this.loadFromLocalStorage('personaChat_chatRooms_v16', {}),
                this.loadFromLocalStorage('personaChat_messages_v16', {}),
                this.loadFromLocalStorage('personaChat_unreadCounts_v16', {}),
                this.loadFromLocalStorage('personaChat_userStickers_v16', [])
            ]);

            // 설정 업데이트
            this.state.settings = {
                ...this.state.settings,
                ...settings,
                prompts: {
                    main: { ...this.defaultPrompts.main, ...(settings.prompts?.main || {}) },
                    profile_creation: settings.prompts?.profile_creation || this.defaultPrompts.profile_creation
                }
            };

            // 다른 데이터 업데이트
            this.state.characters = characters;
            this.state.chatRooms = chatRooms;
            this.state.messages = messages;
            this.state.unreadCounts = unreadCounts;
            this.state.userStickers = userStickers;

        } catch (error) {
            console.error('데이터 로드 실패:', error);
            // 실패시 기본값 유지
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
        // 캐릭터 데이터 변경 체크 (큰 데이터이므로 직접 비교 대신 플래그 사용)
        if (this.shouldSaveCharacters || oldState.characters !== this.state.characters) {
            this.saveToLocalStorage('personaChat_characters_v16', this.state.characters);
            this.shouldSaveCharacters = false;
        }
        if (JSON.stringify(oldState.chatRooms) !== JSON.stringify(this.state.chatRooms)) {
            this.saveToLocalStorage('personaChat_chatRooms_v16', this.state.chatRooms);
        }
        if (JSON.stringify(oldState.messages) !== JSON.stringify(this.state.messages)) {
            this.saveToLocalStorage('personaChat_messages_v16', this.state.messages);
        }
        if (JSON.stringify(oldState.unreadCounts) !== JSON.stringify(this.state.unreadCounts)) {
            this.saveToLocalStorage('personaChat_unreadCounts_v16', this.state.unreadCounts);
        }
        if (JSON.stringify(oldState.userStickers) !== JSON.stringify(this.state.userStickers)) {
            this.saveToLocalStorage('personaChat_userStickers_v16', this.state.userStickers);
        }
    }

    applyFontScale() {
        document.documentElement.style.setProperty('--font-scale', this.state.settings.fontScale);
    }

    // --- UI UPDATE LOGIC ---
    updateUI(oldState, newState) {
        if (oldState.sidebarCollapsed !== newState.sidebarCollapsed ||
            oldState.searchQuery !== newState.searchQuery ||
            oldState.expandedCharacterId !== newState.expandedCharacterId ||
            JSON.stringify(oldState.characters) !== JSON.stringify(newState.characters) ||
            oldState.selectedChatId !== newState.selectedChatId ||
            JSON.stringify(oldState.unreadCounts) !== JSON.stringify(newState.unreadCounts) ||
            JSON.stringify(oldState.messages) !== JSON.stringify(newState.messages) ||
            JSON.stringify(oldState.chatRooms) !== JSON.stringify(newState.chatRooms)
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
            oldState.imageToSend !== newState.imageToSend ||
            oldState.showUserStickerPanel !== newState.showUserStickerPanel ||
            JSON.stringify(oldState.userStickers) !== JSON.stringify(newState.userStickers) ||
            JSON.stringify([...oldState.expandedStickers]) !== JSON.stringify([...newState.expandedStickers])
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

    // --- CHAT ROOM MANAGEMENT ---
    async migrateChatData() {
        // 마이그레이션 완료 플래그 확인
        const migrationCompleted = await this.loadFromLocalStorage('personaChat_migration_v16', false);
        if (migrationCompleted) {
            return;
        }
        
        const oldMessages = { ...this.state.messages };
        const newChatRooms = { ...this.state.chatRooms };
        const newMessages = { ...this.state.messages };
        
        this.state.characters.forEach(character => {
            const characterId = character.id;
            const oldMessagesForChar = oldMessages[characterId];
            
            // 이미 채팅방이 있는 캐릭터는 건너뛰기
            if (newChatRooms[characterId] && newChatRooms[characterId].length > 0) {
                return;
            }
            
            // 기존 채팅방 구조가 있는지 확인 (채팅방 ID는 문자열 형태)
            const isOldStructure = oldMessagesForChar && Array.isArray(oldMessagesForChar);
            
            if (isOldStructure && oldMessagesForChar.length > 0) {
                // 기존 메시지가 있으면 기본 채팅방으로 마이그레이션
                const defaultChatRoomId = `${characterId}_default_${Date.now()}`;
                const defaultChatRoom = {
                    id: defaultChatRoomId,
                    characterId: characterId,
                    name: '기본 채팅',
                    createdAt: Date.now(),
                    lastActivity: Date.now()
                };
                
                newChatRooms[characterId] = [defaultChatRoom];
                newMessages[defaultChatRoomId] = oldMessagesForChar;
                // 기존 구조의 메시지는 삭제하지 않고 유지 (호환성)
            } else {
                // 메시지가 없으면 빈 배열
                newChatRooms[characterId] = [];
            }
        });
        
        // setState를 사용하여 상태 업데이트
        this.setState({
            chatRooms: newChatRooms,
            messages: newMessages
        });
        
        // 마이그레이션 완료 플래그 저장
        this.saveToLocalStorage('personaChat_migration_v16', true);
    }

    getFirstAvailableChatRoom() {
        for (const character of this.state.characters) {
            const chatRooms = this.state.chatRooms[character.id] || [];
            if (chatRooms.length > 0) {
                return chatRooms[0].id;
            }
        }
        return null;
    }

    createNewChatRoom(characterId, chatName = '새 채팅') {
        const newChatRoomId = `${characterId}_${Date.now()}_${Math.random()}`;
        const newChatRoom = {
            id: newChatRoomId,
            characterId: characterId,
            name: chatName,
            createdAt: Date.now(),
            lastActivity: Date.now()
        };
        
        // 기존 채팅방 목록 복사 후 새 채팅방 추가
        const characterChatRooms = [...(this.state.chatRooms[characterId] || [])];
        characterChatRooms.unshift(newChatRoom); // 맨 앞에 추가
        
        // 새로운 chatRooms 객체 생성
        const newChatRooms = { ...this.state.chatRooms };
        newChatRooms[characterId] = characterChatRooms;
        
        // 새로운 messages 객체 생성
        const newMessages = { ...this.state.messages };
        newMessages[newChatRoomId] = [];
        
        // setState를 사용하여 상태 업데이트
        this.setState({
            chatRooms: newChatRooms,
            messages: newMessages
        });
        
        return newChatRoomId;
    }

    toggleCharacterExpansion(characterId) {
        // ID 타입을 숫자로 변환하여 비교
        const numericCharacterId = parseInt(characterId);
        const newExpandedId = this.state.expandedCharacterId === numericCharacterId ? null : numericCharacterId;
        this.setState({ expandedCharacterId: newExpandedId });
    }

    createNewChatRoomForCharacter(characterId) {
        const numericCharacterId = parseInt(characterId);
        const newChatRoomId = this.createNewChatRoom(numericCharacterId);
        this.selectChatRoom(newChatRoomId);
        this.setState({ expandedCharacterId: numericCharacterId }); // 자동으로 펼쳐서 새 채팅방 보이기
    }

    selectChatRoom(chatRoomId) {
        // 읽음 처리
        const newUnreadCounts = { ...this.state.unreadCounts };
        delete newUnreadCounts[chatRoomId];
        
        this.setState({
            selectedChatId: chatRoomId,
            unreadCounts: newUnreadCounts,
            editingMessageId: null,
            sidebarCollapsed: window.innerWidth < 768 ? true : this.state.sidebarCollapsed
        });
    }

    editCharacter(characterId) {
        const numericCharacterId = parseInt(characterId);
        const character = this.state.characters.find(c => c.id === numericCharacterId);
        if (character) {
            this.openEditCharacterModal(character);
        }
    }

    deleteCharacter(characterId) {
        const numericCharacterId = parseInt(characterId);
        this.handleDeleteCharacter(numericCharacterId);
    }

    getCurrentChatRoom() {
        if (!this.state.selectedChatId) return null;
        
        for (const characterId in this.state.chatRooms) {
            const chatRooms = this.state.chatRooms[characterId];
            const chatRoom = chatRooms.find(room => room.id === this.state.selectedChatId);
            if (chatRoom) return chatRoom;
        }
        return null;
    }

    deleteChatRoom(chatRoomId) {
        const chatRoom = this.getChatRoomById(chatRoomId);
        if (!chatRoom) return;

        this.showConfirmModal(
            '채팅방 삭제',
            '이 채팅방과 모든 메시지가 삭제됩니다. 계속하시겠습니까?',
            () => {
                const newChatRooms = { ...this.state.chatRooms };
                const newMessages = { ...this.state.messages };
                const newUnreadCounts = { ...this.state.unreadCounts };

                // 채팅방 목록에서 제거
                newChatRooms[chatRoom.characterId] = newChatRooms[chatRoom.characterId].filter(
                    room => room.id !== chatRoomId
                );

                // 메시지 삭제
                delete newMessages[chatRoomId];
                delete newUnreadCounts[chatRoomId];

                // 현재 선택된 채팅방이라면 다른 채팅방으로 변경
                let newSelectedChatId = this.state.selectedChatId;
                if (this.state.selectedChatId === chatRoomId) {
                    newSelectedChatId = this.getFirstAvailableChatRoom();
                }

                this.setState({
                    chatRooms: newChatRooms,
                    messages: newMessages,
                    unreadCounts: newUnreadCounts,
                    selectedChatId: newSelectedChatId
                });
            }
        );
    }

    getChatRoomById(chatRoomId) {
        for (const characterId in this.state.chatRooms) {
            const chatRoom = this.state.chatRooms[characterId].find(room => room.id === chatRoomId);
            if (chatRoom) return chatRoom;
        }
        return null;
    }

    // --- USER STICKER MANAGEMENT ---
    toggleUserStickerPanel() {
        this.setState({ showUserStickerPanel: !this.state.showUserStickerPanel });
    }

    toggleStickerSize(messageId) {
        const expandedStickers = new Set(this.state.expandedStickers);
        if (expandedStickers.has(messageId)) {
            expandedStickers.delete(messageId);
        } else {
            expandedStickers.add(messageId);
        }
        this.setState({ expandedStickers });
    }

    sendUserSticker(stickerName, stickerData, stickerType = 'image/png') {
        // 스티커를 미리 설정하고 메시지 입력창으로 이동
        this.setState({ 
            showUserStickerPanel: false,
            stickerToSend: {
                stickerName,
                data: stickerData,
                type: stickerType
            }
        });
        
        // 메시지 입력창에 포커스
        const messageInput = document.getElementById('new-message-input');
        if (messageInput) {
            messageInput.focus();
        }
    }

    handleSendMessageWithSticker() {
        const messageInput = document.getElementById('new-message-input');
        const content = messageInput ? messageInput.value : '';
        const hasImage = !!this.state.imageToSend;
        const hasStickerToSend = !!this.state.stickerToSend;
        
        if (hasStickerToSend) {
            // 스티커와 메시지를 함께 전송
            const messageContent = content.trim(); // 실제 텍스트 메시지
            
            this.handleSendMessage(messageContent, 'sticker', {
                stickerName: this.state.stickerToSend.stickerName,
                data: this.state.stickerToSend.data,
                type: this.state.stickerToSend.type,
                hasText: messageContent.length > 0,
                textContent: messageContent
            });
            
            // 스티커 상태 즉시 초기화
            this.state.stickerToSend = null;
            this.state.showInputOptions = false;
            
            // 메시지 입력창 초기화
            if (messageInput) {
                messageInput.value = '';
                messageInput.style.height = 'auto';
            }
            
            // UI 즉시 업데이트
            this.renderMainChat();
        } else {
            // 일반 메시지 또는 이미지 전송
            this.handleSendMessage(content, hasImage ? 'image' : 'text');
        }
    }

    addUserSticker(name, data) {
        this.addUserStickerWithType(name, data, 'image/png');
    }

    addUserStickerWithType(name, data, type) {
        const newSticker = {
            id: Date.now(),
            name: name,
            data: data,
            type: type,
            createdAt: Date.now()
        };
        const newStickers = [...this.state.userStickers, newSticker];
        this.setState({ userStickers: newStickers });
    }

    deleteUserSticker(stickerId) {
        const newStickers = this.state.userStickers.filter(s => s.id !== stickerId);
        this.setState({ userStickers: newStickers });
    }

    editUserStickerName(stickerId) {
        const sticker = this.state.userStickers.find(s => s.id === stickerId);
        if (!sticker) return;

        const newName = prompt('스티커 이름을 입력하세요:', sticker.name);
        if (newName !== null && newName.trim() !== '') {
            const newStickers = this.state.userStickers.map(s => 
                s.id === stickerId ? { ...s, name: newName.trim() } : s
            );
            this.setState({ userStickers: newStickers });
        }
    }

    calculateUserStickerSize() {
        return this.state.userStickers.reduce((total, sticker) => {
            if (sticker.data) {
                // Base64 데이터 크기 계산 (실제 크기의 약 133%)
                const base64Length = sticker.data.split(',')[1]?.length || 0;
                return total + (base64Length * 0.75); // Base64를 바이트로 변환
            }
            return total;
        }, 0);
    }

    async handleUserStickerFileSelect(e) {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        const stickerLimit = 100 * 1024 * 1024; // 100MB
        const currentSize = this.calculateUserStickerSize();

        for (const file of files) {
            // 지원되는 파일 타입 체크
            const allowedTypes = [
                'image/jpeg', 'image/jpg', 'image/gif', 'image/png', 
                'image/bmp', 'image/webp', 'video/webm', 'video/mp4', 'audio/mpeg', 'audio/mp3'
            ];
            if (!allowedTypes.includes(file.type)) {
                alert(`${file.name}은(는) 지원하지 않는 파일 형식입니다. 지원 형식: jpg, gif, png, bmp, webp, webm, mp4, mp3`);
                continue;
            }

            if (file.size > 30 * 1024 * 1024) { // 30MB 제한
                alert(`${file.name}은(는) 파일 크기가 너무 큽니다. (최대 30MB)`);
                continue;
            }

            try {
                let dataUrl;
                
                // 이미지 파일인 경우 압축 처리
                if (file.type.startsWith('image/')) {
                    dataUrl = await this.compressImageForSticker(file, 1024, 1024, 0.85);
                } else {
                    // 오디오/비디오 파일은 그대로 처리
                    dataUrl = await this.toBase64(file);
                }

                const stickerName = file.name.split('.')[0]; // 확장자 제거
                this.addUserStickerWithType(stickerName, dataUrl, file.type);
            } catch (error) {
                console.error('파일 처리 오류:', error);
                alert('파일을 처리하는 중 오류가 발생했습니다.');
            }
        }

        // 파일 입력 초기화
        e.target.value = '';
    }

    async compressImage(file, quality = 0.8) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = () => {
                // 최대 크기 제한 (예: 1024px)
                const maxSize = 1024;
                let { width, height } = img;

                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = (height * maxSize) / width;
                        width = maxSize;
                    } else {
                        width = (width * maxSize) / height;
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                // WebP 지원 확인
                const format = canvas.toDataURL('image/webp', quality).indexOf('data:image/webp') === 0 ? 'image/webp' : 'image/jpeg';
                const compressedDataUrl = canvas.toDataURL(format, quality);
                resolve(compressedDataUrl);
            };

            img.onerror = () => reject(new Error('이미지 로드 실패'));
            img.src = URL.createObjectURL(file);
        });
    }

    // --- LOCAL STORAGE HELPERS ---
    async loadFromLocalStorage(key, defaultValue) {
        try {
            // IndexedDB에서 먼저 시도
            const value = await this.loadFromIndexedDB(key);
            if (value !== null) {
                return value;
            }
        } catch (error) {
            console.warn(`Error reading from IndexedDB key "${key}":`, error);
        }

        // IndexedDB에서 데이터가 없으면 localStorage에서 fallback
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.warn(`Error reading localStorage key "${key}":`, error);
            return defaultValue;
        }
    }

    async loadFromIndexedDB(key) {
        return new Promise((resolve, reject) => {
            const dbName = 'PersonaChatDB';
            const request = indexedDB.open(dbName, 1);
            
            request.onerror = () => reject(request.error);
            
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction(['data'], 'readonly');
                const store = transaction.objectStore('data');
                const getRequest = store.get(key);
                
                getRequest.onsuccess = () => {
                    const result = getRequest.result;
                    resolve(result ? result.value : null);
                };
                
                getRequest.onerror = () => reject(getRequest.error);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('data')) {
                    db.createObjectStore('data', { keyPath: 'key' });
                }
            };
        });
    }

    async saveToLocalStorage(key, value) {
        try {
            // IndexedDB 사용으로 전환 (더 큰 저장 공간)
            await this.saveToIndexedDB(key, value);
        } catch (error) {
            console.error(`Error saving to IndexedDB key "${key}":`, error);
            // IndexedDB 실패시 localStorage로 fallback
            try {
                const stringifiedValue = JSON.stringify(value);
                window.localStorage.setItem(key, stringifiedValue);
            } catch (localStorageError) {
                console.error("localStorage fallback also failed:", localStorageError);
                alert("데이터 저장에 실패했습니다. 브라우저 캐시를 정리해주세요.");
            }
        }
    }

    async saveToIndexedDB(key, value) {
        return new Promise((resolve, reject) => {
            const dbName = 'PersonaChatDB';
            const request = indexedDB.open(dbName, 1);
            
            request.onerror = () => reject(request.error);
            
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction(['data'], 'readwrite');
                const store = transaction.objectStore('data');
                
                store.put({ key, value });
                
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('data')) {
                    db.createObjectStore('data', { keyPath: 'key' });
                }
            };
        });
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


            // 이제 캐릭터 수정/삭제는 인라인 onclick으로 처리됨

            if (e.target.closest('#open-input-options-btn')) {
                this.setState({ showInputOptions: !this.state.showInputOptions });
            }
            if (e.target.closest('#open-image-upload')) {
                document.getElementById('image-upload-input').click();
            }
            if (e.target.closest('#cancel-image-preview')) {
                this.setState({ imageToSend: null });
            }

            if (e.target.closest('#modal-cancel')) this.closeModal();
            if (e.target.closest('#modal-confirm')) {
                if (this.state.modal.onConfirm) this.state.modal.onConfirm();
                this.closeModal();
            }
            if (e.target.closest('#select-avatar-btn')) document.getElementById('avatar-input').click();
            if (e.target.closest('#load-card-btn')) document.getElementById('card-input').click();
            if (e.target.closest('#save-card-btn')) this.handleSaveCharacterToImage();


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
            if (e.target.closest('#add-sticker-btn')) document.getElementById('sticker-input').click();
            if (e.target.closest('#toggle-sticker-selection')) {
                console.log('Toggle sticker selection mode clicked');
                this.toggleStickerSelectionMode();
            }
            if (e.target.closest('#select-all-stickers')) this.handleSelectAllStickers();
            
            // 사용자 스티커 관련 이벤트
            if (e.target.closest('#add-user-sticker-btn')) document.getElementById('user-sticker-input').click();
            if (e.target.closest('#delete-selected-stickers')) this.handleDeleteSelectedStickers();
            const deleteMemoryBtn = e.target.closest('.delete-memory-btn');
            if (deleteMemoryBtn) {
                deleteMemoryBtn.closest('.memory-item').remove();
            }
            const deleteStickerBtn = e.target.closest('.delete-sticker-btn');
            if (deleteStickerBtn) {
                this.handleDeleteSticker(parseInt(deleteStickerBtn.dataset.index));
            }
            
            const editStickerNameBtn = e.target.closest('.edit-sticker-name-btn');
            if (editStickerNameBtn) {
                this.handleEditStickerName(parseInt(editStickerNameBtn.dataset.index));
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
            if (e.target.id === 'sticker-input') {
                this.handleStickerFileSelect(e);
            }
            if (e.target.id === 'user-sticker-input') {
                this.handleUserStickerFileSelect(e);
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
        const chatRooms = this.state.chatRooms[char.id] || [];
        const isExpanded = this.state.expandedCharacterId === parseInt(char.id);
        
        // 캐릭터의 모든 채팅방에서 가장 최근 메시지 찾기
        let lastMessage = null;
        let totalUnreadCount = 0;
        
        chatRooms.forEach(chatRoom => {
            const messages = this.state.messages[chatRoom.id] || [];
            const chatRoomLastMessage = messages.slice(-1)[0];
            if (chatRoomLastMessage && (!lastMessage || chatRoomLastMessage.id > lastMessage.id)) {
                lastMessage = chatRoomLastMessage;
            }
            totalUnreadCount += this.state.unreadCounts[chatRoom.id] || 0;
        });

        let lastMessageContent = language.chat.startNewChat;
        if (lastMessage) {
            if (lastMessage.type === 'image') {
                lastMessageContent = language.chat.imageSent;
            } else {
                lastMessageContent = lastMessage.content;
            }
        }

        return `
            <div class="character-group">
                <!-- 캐릭터 헤더 -->
                <div onclick="window.personaApp.toggleCharacterExpansion(${char.id})" class="character-header group p-3 md:p-4 rounded-xl cursor-pointer transition-all duration-200 relative hover:bg-gray-800/50">
                    <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex space-x-1 z-10">
                        <button onclick="window.personaApp.createNewChatRoomForCharacter(${char.id}); event.stopPropagation();" class="p-1 bg-gray-700 hover:bg-blue-600 rounded text-gray-300 hover:text-white transition-colors" title="새 채팅방">
                            <i data-lucide="plus" class="w-3 h-3"></i>
                        </button>
                        <button onclick="window.personaApp.editCharacter(${char.id}); event.stopPropagation();" class="p-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 hover:text-white transition-colors" title="수정">
                            <i data-lucide="edit-3" class="w-3 h-3"></i>
                        </button>
                        <button onclick="window.personaApp.deleteCharacter(${char.id}); event.stopPropagation();" class="p-1 bg-gray-700 hover:bg-red-600 rounded text-gray-300 hover:text-white transition-colors" title="삭제">
                            <i data-lucide="trash-2" class="w-3 h-3"></i>
                        </button>
                    </div>
                    <div class="flex items-center space-x-3 md:space-x-4">
                        ${this.renderAvatar(char, 'md')}
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center justify-between mb-1">
                                <h3 class="font-semibold text-white text-sm truncate">${char.name}</h3>
                                <div class="flex items-center gap-2">
                                    ${totalUnreadCount > 0 ? `<span class="bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full leading-none">${totalUnreadCount}</span>` : ''}
                                    <span class="text-xs text-gray-500 shrink-0">${lastMessage?.time || ''}</span>
                                    <i data-lucide="chevron-${isExpanded ? 'down' : 'right'}" class="w-4 h-4 text-gray-400"></i>
                                </div>
                            </div>
                            <p class="text-xs md:text-sm truncate ${lastMessage?.isError ? 'text-red-400' : 'text-gray-400'}">${lastMessageContent}</p>
                            <p class="text-xs text-gray-500 mt-1">${chatRooms.length}개 채팅방</p>
                        </div>
                    </div>
                </div>
                
                <!-- 채팅방 목록 -->
                ${isExpanded ? `
                    <div class="ml-6 space-y-1 pb-2">
                        ${chatRooms.map(chatRoom => this.renderChatRoomItem(chatRoom)).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderChatRoomItem(chatRoom) {
        const messages = this.state.messages[chatRoom.id] || [];
        const lastMessage = messages.slice(-1)[0];
        const isSelected = this.state.selectedChatId === chatRoom.id;
        const unreadCount = this.state.unreadCounts[chatRoom.id] || 0;
        
        let lastMessageContent = '채팅을 시작해보세요';
        if (lastMessage) {
            if (lastMessage.type === 'image') {
                lastMessageContent = '이미지를 보냈습니다';
            } else if (lastMessage.type === 'sticker') {
                lastMessageContent = '스티커를 보냈습니다';
            } else {
                lastMessageContent = lastMessage.content;
            }
        }
        
        return `
            <div class="chat-room-item group p-2 rounded-lg cursor-pointer transition-all duration-200 ${isSelected ? 'bg-blue-600' : 'hover:bg-gray-700'} relative">
                <div onclick="window.personaApp.selectChatRoom('${chatRoom.id}')" class="flex items-center justify-between">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between mb-1">
                            <h4 class="text-sm font-medium text-white truncate">${chatRoom.name}</h4>
                            <div class="flex items-center gap-2">
                                ${unreadCount > 0 ? `<span class="bg-red-500 text-white text-xs font-bold w-4 h-4 flex items-center justify-center rounded-full leading-none">${unreadCount}</span>` : ''}
                                <span class="text-xs text-gray-400 shrink-0">${lastMessage?.time || ''}</span>
                            </div>
                        </div>
                        <p class="text-xs text-gray-400 truncate">${lastMessageContent}</p>
                    </div>
                </div>
                <button onclick="window.personaApp.deleteChatRoom('${chatRoom.id}'); event.stopPropagation();" class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 bg-red-600 hover:bg-red-700 rounded text-white" title="채팅방 삭제">
                    <i data-lucide="trash-2" class="w-3 h-3"></i>
                </button>
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
        const selectedChatRoom = this.getCurrentChatRoom();
        const selectedChat = selectedChatRoom ? this.state.characters.find(c => c.id === selectedChatRoom.characterId) : null;


        if (selectedChatRoom && selectedChat) {
            mainChat.innerHTML = `
                    <header class="p-4 bg-gray-900/80 border-b border-gray-800 glass-effect flex items-center justify-between z-10">
                        <div class="flex items-center space-x-2 md:space-x-4">
                            <button id="mobile-sidebar-toggle" class="p-2 -ml-2 rounded-full hover:bg-gray-700 md:hidden">
                                <i data-lucide="menu" class="h-5 w-5 text-gray-300"></i>
                            </button>
                            ${this.renderAvatar(selectedChat, 'sm')}
                            <div>
                                <h2 class="font-semibold text-white text-base md:text-lg">${selectedChat.name}</h2>
                                <p class="text-xs md:text-sm text-gray-400 flex items-center"><i data-lucide="message-circle" class="w-3 h-3 mr-1.5"></i>${selectedChatRoom.name}</p>
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
                            ${this.state.stickerToSend ? `
                                <div class="mb-2 p-2 bg-gray-700 rounded-lg flex items-center gap-2 text-sm text-gray-300">
                                    <img src="${this.state.stickerToSend.data}" alt="${this.state.stickerToSend.stickerName}" class="w-6 h-6 rounded object-cover">
                                    <span>스티커: ${this.state.stickerToSend.stickerName}</span>
                                    <button onclick="window.personaApp.setState({stickerToSend: null})" class="ml-auto text-gray-400 hover:text-white">
                                        <i data-lucide="x" class="w-3 h-3"></i>
                                    </button>
                                </div>
                            ` : ''}
                            <textarea id="new-message-input" placeholder="${hasImage ? '캡션 추가...' : this.state.stickerToSend ? '스티커와 함께 보낼 메시지 (선택사항)...' : '메시지를 입력하세요...'}" class="w-full pl-4 pr-20 py-3 bg-gray-800 text-white rounded-2xl border border-gray-700 resize-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all duration-200 text-sm placeholder-gray-500" rows="1" style="min-height: 48px; max-height: 120px;" ${isWaitingForResponse ? 'disabled' : ''}></textarea>
                            <div class="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                                <button id="sticker-btn" 
                                    onclick="window.personaApp.toggleUserStickerPanel()" 
                                    class="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-full transition-all duration-200"
                                    ${isWaitingForResponse ? 'disabled' : ''}>
                                    <i data-lucide="smile" class="w-4 h-4"></i>
                                </button>
                                <button id="send-message-btn" 
                                    onclick="window.personaApp.handleSendMessageWithSticker()" 
                                    class="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                                    ${isWaitingForResponse ? 'disabled' : ''}>
                                    <i data-lucide="send" class="w-4 h-4"></i>
                                </button>
                            </div>
                            ${this.state.showUserStickerPanel ? this.renderUserStickerPanel() : ''}
                        </div>
                    </div>
                </div>
            `;
    }

    renderUserStickerPanel() {
        const userStickers = this.state.userStickers || [];
        const currentSize = this.calculateUserStickerSize();
        const stickerLimit = 100 * 1024 * 1024; // 100MB
        
        return `
            <div class="absolute bottom-full left-0 mb-2 w-80 bg-gray-800 rounded-xl shadow-lg border border-gray-700 animate-fadeIn">
                <div class="p-3 border-b border-gray-700 flex items-center justify-between">
                    <h3 class="text-sm font-medium text-white">페르소나 스티커</h3>
                    <div class="flex gap-2">
                        <button id="add-user-sticker-btn" class="p-1 bg-blue-600 hover:bg-blue-700 text-white rounded" title="스티커 추가">
                            <i data-lucide="plus" class="w-3 h-3"></i>
                        </button>
                        <button onclick="window.personaApp.toggleUserStickerPanel()" class="p-1 bg-gray-600 hover:bg-gray-500 text-white rounded" title="닫기">
                            <i data-lucide="x" class="w-3 h-3"></i>
                        </button>
                    </div>
                </div>
                <div class="p-3">
                    <div class="flex items-center justify-between text-xs text-gray-400 mb-3">
                        <span>jpg, gif, png, bmp, webp 지원 (개당 최대 30MB)</span>
                        <span>스티커 개수: ${userStickers.length}개</span>
                    </div>
                    <div class="flex items-center justify-between text-xs text-gray-500 mb-3">
                        <span>총 용량: ${this.formatBytes(currentSize)}</span>
                    </div>
                    ${userStickers.length === 0 ? `
                        <div class="text-center text-gray-400 py-8">
                            <i data-lucide="smile" class="w-8 h-8 mx-auto mb-2"></i>
                            <p class="text-sm">스티커를 추가해보세요</p>
                            <button onclick="document.getElementById('add-user-sticker-btn').click()" class="mt-2 text-xs text-blue-400 hover:text-blue-300">스티커 추가하기</button>
                        </div>
                    ` : `
                        <div class="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                            ${userStickers.map(sticker => {
                                const isVideo = sticker.type && (sticker.type.startsWith('video/') || sticker.type === 'video/mp4' || sticker.type === 'video/webm');
                                const isAudio = sticker.type && sticker.type.startsWith('audio/');
                                
                                let content = '';
                                if (isAudio) {
                                    content = `<div class="w-full h-full flex items-center justify-center bg-gray-600"><i data-lucide="music" class="w-6 h-6 text-gray-300"></i></div>`;
                                } else if (isVideo) {
                                    content = `<video class="w-full h-full object-cover" muted><source src="${sticker.data}" type="${sticker.type}"></video>`;
                                } else {
                                    content = `<img src="${sticker.data}" alt="${sticker.name}" class="w-full h-full object-cover">`;
                                }
                                
                                return `
                                <div class="relative group">
                                    <button onclick="window.personaApp.sendUserSticker('${sticker.name}', '${sticker.data}', '${sticker.type || 'image/png'}')" 
                                        class="w-full aspect-square bg-gray-700 rounded-lg overflow-hidden hover:bg-gray-600 transition-colors">
                                        ${content}
                                    </button>
                                    <div class="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                        <button onclick="window.personaApp.editUserStickerName(${sticker.id}); event.stopPropagation();" 
                                            class="w-5 h-5 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center text-xs" title="이름 변경">
                                            <i data-lucide="edit-3" class="w-2 h-2"></i>
                                        </button>
                                        <button onclick="window.personaApp.deleteUserSticker(${sticker.id}); event.stopPropagation();" 
                                            class="w-5 h-5 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-xs" title="삭제">
                                            <i data-lucide="x" class="w-3 h-3"></i>
                                        </button>
                                    </div>
                                    <div class="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 truncate rounded-b-lg">
                                        ${sticker.name}
                                    </div>
                                </div>
                                `;
                            }).join('')}
                        </div>
                    `}
                </div>
                <input type="file" accept="image/*,video/*,audio/*" id="user-sticker-input" class="hidden" multiple />
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
                html += `<div class="flex justify-center my-4"><div class="flex items-center text-xs text-gray-300 bg-gray-800/80 backdrop-blur-sm px-4 py-1.5 rounded-full shadow-md"><i data-lucide="calendar" class="w-3 h-3.5 mr-2 text-gray-400"></i>${this.formatDateSeparator(new Date(msg.id))}</div></div>`;
            }

            const groupInfo = this.findMessageGroup(messages, i);
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
            if (msg.type === 'sticker') {
                // 사용자 페르소나 스티커 처리 (msg.stickerData에 직접 저장됨)
                let stickerData = msg.stickerData;
                
                // 캐릭터 스티커 처리 (기존 로직)
                if (!stickerData) {
                    const selectedChatRoom = this.getCurrentChatRoom();
                    const character = selectedChatRoom ? this.state.characters.find(c => c.id === selectedChatRoom.characterId) : null;
                    stickerData = character?.stickers?.find(s => {
                        // ID로 찾기 (숫자 비교)
                        if (s.id == msg.stickerId) return true;
                        // 이름으로 찾기 (정확한 문자열 비교)
                        if (s.name === msg.stickerId) return true;
                        // 파일명에서 확장자 제거한 이름으로 찾기
                        const baseFileName = s.name.replace(/\.[^/.]+$/, "");
                        const searchFileName = String(msg.stickerId).replace(/\.[^/.]+$/, "");
                        if (baseFileName === searchFileName) return true;
                        return false;
                    });
                }
                
                if (stickerData) {
                    const isVideo = stickerData.type && (stickerData.type.startsWith('video/') || stickerData.type === 'video/mp4' || stickerData.type === 'video/webm');
                    const isAudio = stickerData.type && stickerData.type.startsWith('audio/');
                    
                    let stickerHtml = '';
                    if (isAudio) {
                        const audioSrc = stickerData.data || stickerData.dataUrl;
                        const stickerName = stickerData.stickerName || stickerData.name || '오디오';
                        stickerHtml = `
                            <div class="bg-gray-700 p-3 rounded-2xl max-w-xs">
                                <div class="flex items-center gap-3">
                                    <div class="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center">
                                        <i data-lucide="music" class="w-6 h-6 text-gray-300"></i>
                                    </div>
                                    <div>
                                        <div class="text-sm text-white font-medium">${stickerName}</div>
                                        <audio controls class="mt-1 h-8">
                                            <source src="${audioSrc}" type="${stickerData.type}">
                                        </audio>
                                    </div>
                                </div>
                            </div>
                        `;
                    } else if (isVideo) {
                        const videoSrc = stickerData.data || stickerData.dataUrl;
                        const isExpanded = this.state.expandedStickers.has(msg.id);
                        const sizeClass = isExpanded ? 'max-w-4xl' : 'max-w-xs';
                        const heightStyle = isExpanded ? 'max-height: 720px;' : 'max-height: 240px;';
                        stickerHtml = `
                            <div class="inline-block cursor-pointer transition-all duration-300" onclick="window.personaApp.toggleStickerSize(${msg.id})">
                                <video class="${sizeClass} rounded-2xl" style="${heightStyle}" controls muted loop autoplay>
                                    <source src="${videoSrc}" type="${stickerData.type}">
                                </video>
                            </div>
                        `;
                    } else {
                        const imgSrc = stickerData.data || stickerData.dataUrl;
                        const stickerName = stickerData.stickerName || stickerData.name || '스티커';
                        const isExpanded = this.state.expandedStickers.has(msg.id);
                        const sizeClass = isExpanded ? 'max-w-4xl' : 'max-w-xs';
                        const heightStyle = isExpanded ? 'max-height: 720px;' : 'max-height: 240px;';
                        stickerHtml = `<div class="inline-block cursor-pointer transition-all duration-300" onclick="window.personaApp.toggleStickerSize(${msg.id})"><img src="${imgSrc}" alt="${stickerName}" class="${sizeClass} rounded-2xl object-contain" style="${heightStyle}"></div>`;
                    }
                    
                    // 텍스트와 스티커 함께 표시
                    const hasTextMessage = (msg.hasText && msg.content && msg.content.trim()) || 
                                          (msg.stickerData && msg.stickerData.hasText && msg.stickerData.textContent && msg.stickerData.textContent.trim()) ||
                                          (msg.content && msg.content.trim() && !msg.content.includes('[스티커:'));
                    
                    if (hasTextMessage) {
                        // 텍스트 내용 결정
                        let textContent = '';
                        if (msg.stickerData && msg.stickerData.textContent) {
                            textContent = msg.stickerData.textContent;
                        } else if (msg.content && !msg.content.includes('[스티커:')) {
                            textContent = msg.content;
                        }
                        
                        if (textContent.trim()) {
                            const textHtml = `<div class="px-4 py-2 rounded-2xl text-sm md:text-base leading-relaxed ${msg.isMe ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-100'} mb-2"><div class="break-words">${textContent}</div></div>`;
                            messageBodyHtml = `<div class="flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}">${textHtml}${stickerHtml}</div>`;
                        } else {
                            messageBodyHtml = stickerHtml;
                        }
                    } else {
                        messageBodyHtml = stickerHtml;
                    }
                } else {
                    messageBodyHtml = `<div class="px-4 py-2 rounded-2xl text-sm md:text-base leading-relaxed bg-gray-700 text-gray-400 italic">[삭제된 스티커: ${msg.stickerName || msg.content}]</div>`;
                }
            } else if (msg.type === 'image') {
                const selectedChatRoom = this.getCurrentChatRoom();
                const character = selectedChatRoom ? this.state.characters.find(c => c.id === selectedChatRoom.characterId) : null;
                const imageData = character?.media?.find(m => m.id === msg.imageId);
                const imageUrl = imageData ? imageData.dataUrl : imagePlaceholder;

                const isExpanded = this.state.expandedStickers.has(msg.id);
                const sizeClass = isExpanded ? 'max-w-4xl' : 'max-w-xs';
                const heightStyle = isExpanded ? 'max-height: 720px;' : 'max-height: 320px;';
                const imageTag = `<div class="inline-block cursor-pointer transition-all duration-300" onclick="window.personaApp.toggleStickerSize(${msg.id})"><img src="${imageUrl}" class="${sizeClass} rounded-lg object-cover" style="${heightStyle}"></div>`;
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
            '## 스티커 사용법 (Sticker Usage)': { key: 'sticker_usage', content: prompts.main.sticker_usage },
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
                                            <div class="flex items-center gap-2 mb-3">
                                                <button onclick="window.personaApp.resetPromptToDefault('main', '${data.key}', '${title}')" class="py-1 px-3 bg-gray-600 hover:bg-gray-500 text-white rounded text-xs flex items-center gap-1">
                                                    <i data-lucide="rotate-ccw" class="w-3 h-3"></i> 기본값으로 되돌리기
                                                </button>
                                            </div>
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
                                        <div class="flex items-center gap-2 mb-3">
                                            <button onclick="window.personaApp.resetPromptToDefault('profile_creation', '', '# 캐릭터 생성 규칙 (Profile Creation Rules)')" class="py-1 px-3 bg-gray-600 hover:bg-gray-500 text-white rounded text-xs flex items-center gap-1">
                                                <i data-lucide="rotate-ccw" class="w-3 h-3"></i> 기본값으로 되돌리기
                                            </button>
                                        </div>
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
                                        
                                        <!-- Sticker Section -->
                                        <details class="group border-t border-gray-700 pt-2">
                                            <summary class="flex items-center justify-between cursor-pointer list-none py-2">
                                               <h4 class="text-sm font-medium text-gray-300">스티커</h4>
                                               <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180"></i>
                                            </summary>
                                            <div class="content-wrapper">
                                                <div class="content-inner pt-4 space-y-4">
                                                    <div class="flex items-center justify-between mb-3">
                                                        <div class="flex items-center gap-2">
                                                            <button id="add-sticker-btn" class="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm flex flex-col items-center justify-center gap-1">
                                                                <i data-lucide="plus" class="w-4 h-4"></i> 
                                                                <span class="text-xs">스티커<br>추가</span>
                                                            </button>
                                                            <input type="file" accept="image/jpeg,image/jpg,image/gif,image/png,image/bmp,image/webp,video/webm,video/mp4,audio/mpeg,audio/mp3" id="sticker-input" class="hidden" multiple />
                                                        </div>
                                                        ${(editingCharacter?.stickers || []).length > 0 ? `
                                                        <div class="flex items-center gap-2">
                                                            <button id="toggle-sticker-selection" class="py-2 px-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm flex flex-col items-center gap-1" data-selection-mode="${this.state.stickerSelectionMode ? 'true' : 'false'}">
                                                                <i data-lucide="check-square" class="w-4 h-4"></i> 
                                                                <span class="toggle-text text-xs">${this.state.stickerSelectionMode ? '선택<br>해제' : '선택<br>모드'}</span>
                                                            </button>
                                                            ${this.state.stickerSelectionMode ? `
                                                            <button id="select-all-stickers" class="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm flex flex-col items-center gap-1">
                                                                <i data-lucide="check-circle" class="w-4 h-4"></i> 
                                                                <span class="text-xs">전체<br>선택</span>
                                                            </button>
                                                            ` : ''}
                                                            <button id="delete-selected-stickers" class="py-2 px-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm flex flex-col items-center gap-1 opacity-50 cursor-not-allowed" disabled>
                                                                <i data-lucide="trash-2" class="w-4 h-4"></i> 
                                                                <span class="text-xs">삭제<br>(<span id="selected-count">0</span>)</span>
                                                            </button>
                                                        </div>
                                                        ` : ''}
                                                    </div>
                                                    <div class="flex items-center justify-between text-xs text-gray-400 mb-3">
                                                        <span>jpg, gif, png, bmp, webp, webm, mp4, mp3 지원 (개당 최대 30MB)</span>
                                                        <span>스티커 개수: ${(editingCharacter?.stickers || []).length}개</span>
                                                    </div>
                                                    <div class="flex items-center justify-between text-xs text-gray-500 mb-3">
                                                        <span>전체 저장 용량: ${this.formatBytes(this.getLocalStorageUsage())}</span>
                                                        <span>총 용량: ${this.formatBytes(this.calculateCharacterStickerSize(editingCharacter || {}))}</span>
                                                    </div>
                                                    <div id="sticker-container" class="grid grid-cols-4 gap-2">
                                                        ${this.renderStickerGrid(editingCharacter?.stickers || [])}
                                                    </div>
                                                </div>
                                            </div>
                                        </details>
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

    renderMemoryInput(memoryText = '') {
        return `
                <div class="memory-item flex items-center gap-2">
                    <input type="text" class="memory-input flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border-0 focus:ring-2 focus:ring-blue-500/50 text-sm" value="${memoryText}" placeholder="기억할 내용을 입력하세요...">
                    <button class="delete-memory-btn p-2 text-gray-400 hover:text-red-400">
                        <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
                    </button>
                </div>
            `;
    }

    renderStickerGrid(stickers) {
        if (!stickers || stickers.length === 0) {
            return '<div class="col-span-4 text-center text-gray-400 text-sm py-4">아직 스티커가 없습니다.</div>';
        }
        
        const isSelectionMode = this.state.stickerSelectionMode;
        const selectedIndices = this.state.selectedStickerIndices || [];
        
        return stickers.map((sticker, index) => {
            const isSelected = selectedIndices.includes(index);
            const isVideo = sticker.type && (sticker.type.startsWith('video/') || sticker.type === 'video/mp4' || sticker.type === 'video/webm');
            const isAudio = sticker.type && sticker.type.startsWith('audio/');
            
            let content = '';
            if (isAudio) {
                content = `
                    <div class="w-full h-16 bg-gray-600 rounded-lg flex items-center justify-center">
                        <i data-lucide="music" class="w-6 h-6 text-gray-300"></i>
                    </div>
                    <div class="text-xs text-gray-300 text-center truncate mt-1">${sticker.name}</div>
                `;
            } else if (isVideo) {
                content = `
                    <video class="w-full h-16 object-cover rounded-lg" muted loop autoplay>
                        <source src="${sticker.dataUrl}" type="${sticker.type}">
                    </video>
                    <div class="text-xs text-gray-300 text-center truncate mt-1">${sticker.name}</div>
                `;
            } else {
                content = `
                    <img src="${sticker.dataUrl}" alt="${sticker.name}" class="w-full h-16 object-cover rounded-lg">
                    <div class="text-xs text-gray-300 text-center truncate mt-1">${sticker.name}</div>
                `;
            }
            
            return `
                <div class="sticker-item relative group ${isSelected && isSelectionMode ? 'ring-2 ring-blue-500' : ''}" ${isSelectionMode ? `data-index="${index}"` : ''}>
                    ${isSelectionMode ? `
                        <div class="absolute -top-2 -left-2 z-10">
                            <input type="checkbox" class="sticker-checkbox w-5 h-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500" data-index="${index}" ${isSelected ? 'checked' : ''} onclick="window.personaApp.handleStickerSelection(${index}, this.checked)">
                        </div>
                    ` : ''}
                    ${content}
                    ${!isSelectionMode ? `
                        <div class="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            <button class="edit-sticker-name-btn p-1 bg-blue-600 rounded-full text-white" data-index="${index}" title="이름 변경">
                                <i data-lucide="edit-3" class="w-2 h-2 pointer-events-none"></i>
                            </button>
                            <button class="delete-sticker-btn p-1 bg-red-600 rounded-full text-white" data-index="${index}" title="삭제">
                                <i data-lucide="x" class="w-3 h-3 pointer-events-none"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
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

    showInfoModal(title, message) {
        this.setState({ modal: { isOpen: true, title, message, onConfirm: null } });
    }

    showConfirmModal(title, message, onConfirm) {
        this.setState({ modal: { isOpen: true, title, message, onConfirm } });
    }

    closeModal() {
        this.setState({ modal: { isOpen: false, title: '', message: '', onConfirm: null } });
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
                sticker_usage: document.getElementById('prompt-main-sticker_usage').value,
            },
            profile_creation: document.getElementById('prompt-profile_creation').value,
        };

        this.setState({
            settings: { ...this.state.settings, prompts: newPrompts },
            showPromptModal: false
        });
        this.showInfoModal(language.modal.promptSaveComplete.title, language.modal.promptSaveComplete.message);
    }

    openNewCharacterModal() {
        this.setState({ 
            editingCharacter: { memories: [], proactiveEnabled: true }, 
            showCharacterModal: true,
            stickerSelectionMode: false,
            selectedStickerIndices: []
        });
    }

    openEditCharacterModal(character) {
        this.setState({ 
            editingCharacter: { ...character, memories: character.memories || [] }, 
            showCharacterModal: true,
            stickerSelectionMode: false,
            selectedStickerIndices: []
        });
    }

    closeCharacterModal() {
        this.setState({ 
            showCharacterModal: false, 
            editingCharacter: null,
            stickerSelectionMode: false,
            selectedStickerIndices: []
        });
    }

    handleAvatarChange(e, isCard = false) {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (isCard) {
                this.loadCharacterFromImage(file);
            } else {
                this.toBase64(file).then(base64 => {
                    const currentEditing = this.state.editingCharacter || {};
                    this.setState({ editingCharacter: { ...currentEditing, avatar: base64 } });
                });
            }
        }
    }

    async handleStickerFileSelect(e) {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        
        const currentStickers = this.state.editingCharacter?.stickers || [];
        const newStickers = [];
        
        // 대량 파일을 순차적으로 처리하여 메모리 오버플로우 방지
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            // 10개마다 잠시 대기
            if (i > 0 && i % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // 파일 크기 체크 (5MB 제한)
            if (file.size > 30 * 1024 * 1024) {
                this.showInfoModal("파일 크기 초과", `${file.name}은(는) 30MB를 초과합니다. 용량을 줄여주세요.`);
                continue;
            }
            
            // 파일 타입 체크
            const allowedTypes = [
                'image/jpeg', 'image/jpg', 'image/gif', 'image/png', 
                'image/bmp', 'image/webp', 'video/webm', 'video/mp4', 'audio/mpeg', 'audio/mp3'
            ];
            if (!allowedTypes.includes(file.type)) {
                this.showInfoModal("지원하지 않는 형식", `${file.name}은(는) 지원하지 않는 파일 형식입니다.`);
                continue;
            }
            
            try {
                let dataUrl;
                let processedSize = file.size;
                
                // 이미지 파일인 경우 압축 처리
                if (file.type.startsWith('image/')) {
                    // GIF는 압축하지 않음 (애니메이션 보존)
                    if (file.type === 'image/gif') {
                        dataUrl = await this.toBase64(file);
                    } else {
                        // 다른 이미지는 압축 (최대 800x800, 품질 0.7)
                        dataUrl = await this.compressImageForSticker(file, 1024, 1024, 0.85);
                        // 압축된 크기 계산 (대략적)
                        const compressedBase64 = dataUrl.split(',')[1];
                        processedSize = Math.round(compressedBase64.length * 0.75);
                    }
                } else {
                    // 비디오, 오디오는 그대로 사용
                    dataUrl = await this.toBase64(file);
                }
                
                const sticker = {
                    id: Date.now() + Math.random(),
                    name: file.name,
                    type: file.type,
                    dataUrl: dataUrl,
                    originalSize: file.size,
                    size: processedSize
                };
                newStickers.push(sticker);
            } catch (error) {
                console.error(`스티커 처리 오류: ${file.name}`, error);
                this.showInfoModal("스티커 처리 오류", `${file.name}을(를) 처리하는 중 오류가 발생했습니다.`);
            }
        }
        
        if (newStickers.length > 0) {
            const currentEditing = this.state.editingCharacter || {};
            
            // 캐릭터별 스티커 용량 제한 제거
            
            const updatedStickers = [...currentStickers, ...newStickers];
            const updatedCharacterData = { 
                ...currentEditing, 
                stickers: updatedStickers 
            };
            
            // 전체 저장 공간 체크
            const characterDataString = JSON.stringify(updatedCharacterData);
            const storageCheck = this.checkStorageSpace(characterDataString, 'personaChat_characters_v16');
            
            if (!storageCheck.canSave) {
                this.showInfoModal(
                    "전체 저장 공간 부족", 
                    `현재 사용량: ${storageCheck.current}\n예상 사용량: ${storageCheck.total}\n\n브라우저 저장 공간이 부족합니다. 오래된 대화나 다른 캐릭터의 데이터를 삭제해주세요.`
                );
                return;
            }
            
            this.shouldSaveCharacters = true;
            this.setState({ 
                editingCharacter: updatedCharacterData
            });
        }
        
        // 파일 입력 초기화
        e.target.value = '';
    }
    
    handleDeleteSticker(index) {
        const currentStickers = this.state.editingCharacter?.stickers || [];
        const updatedStickers = currentStickers.filter((_, i) => i !== index);
        const currentEditing = this.state.editingCharacter || {};
        this.setState({ 
            editingCharacter: { 
                ...currentEditing, 
                stickers: updatedStickers 
            } 
        });
    }

    handleEditStickerName(index) {
        if (this.state.editingCharacter && this.state.editingCharacter.stickers) {
            const sticker = this.state.editingCharacter.stickers[index];
            if (!sticker) return;

            const newName = prompt('스티커 이름을 입력하세요:', sticker.name);
            if (newName !== null && newName.trim() !== '') {
                const newStickers = [...this.state.editingCharacter.stickers];
                newStickers[index] = { ...sticker, name: newName.trim() };
                this.setState({ 
                    editingCharacter: { 
                        ...this.state.editingCharacter, 
                        stickers: newStickers 
                    } 
                });
            }
        }
    }

    toggleStickerSelectionMode() {
        console.log('Toggling sticker selection mode - current state:', this.state.stickerSelectionMode);
        
        // 상태를 먼저 업데이트
        this.state.stickerSelectionMode = !this.state.stickerSelectionMode;
        this.state.selectedStickerIndices = [];
        
        console.log('New state set to:', this.state.stickerSelectionMode);
        
        // 스티커 섹션만 업데이트 (모달 전체 리렌더링 방지)
        this.updateStickerSection();
        
        console.log('Sticker section updated');
    }

    updateStickerSection() {
        // 스티커 그리드 업데이트
        const stickerContainer = document.getElementById('sticker-container');
        if (stickerContainer) {
            const currentStickers = this.state.editingCharacter?.stickers || [];
            stickerContainer.innerHTML = this.renderStickerGrid(currentStickers);
        }
        
        // 토글 버튼 텍스트 업데이트
        const toggleButton = document.getElementById('toggle-sticker-selection');
        if (toggleButton) {
            const textSpan = toggleButton.querySelector('.toggle-text');
            if (textSpan) {
                textSpan.innerHTML = this.state.stickerSelectionMode ? '선택<br>해제' : '선택<br>모드';
            }
        }
        
        // 전체 선택 버튼 추가/제거 (기존 버튼들은 유지)
        let selectAllButton = document.getElementById('select-all-stickers');
        if (this.state.stickerSelectionMode) {
            if (!selectAllButton) {
                // 전체 선택 버튼 추가 (토글 버튼 뒤에)
                const selectAllHTML = `
                    <button id="select-all-stickers" class="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm flex flex-col items-center gap-1">
                        <i data-lucide="check-circle" class="w-4 h-4"></i> 
                        <span class="text-xs">전체<br>선택</span>
                    </button>
                `;
                toggleButton.insertAdjacentHTML('afterend', selectAllHTML);
            }
        } else {
            if (selectAllButton) {
                selectAllButton.remove();
            }
        }
        
        // 삭제 버튼 초기화 (선택 해제시)
        const deleteButton = document.getElementById('delete-selected-stickers');
        if (deleteButton && !this.state.stickerSelectionMode) {
            deleteButton.disabled = true;
            deleteButton.classList.add('opacity-50', 'cursor-not-allowed');
            const countSpan = deleteButton.querySelector('#selected-count');
            if (countSpan) countSpan.textContent = '0';
        }
        
        // 아이콘 다시 생성
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }


    handleStickerSelection(index, isChecked) {
        console.log('Sticker selection changed:', index, isChecked);
        const currentSelected = this.state.selectedStickerIndices || [];
        let newSelected;
        
        if (isChecked) {
            newSelected = [...currentSelected, index];
        } else {
            newSelected = currentSelected.filter(i => i !== index);
        }
        
        console.log('New selected indices:', newSelected);
        
        // 상태 직접 업데이트
        this.state.selectedStickerIndices = newSelected;
        
        // UI 요소 즉시 업데이트
        const countElement = document.getElementById('selected-count');
        const deleteButton = document.getElementById('delete-selected-stickers');
        
        console.log('Count element:', countElement);
        console.log('Delete button:', deleteButton);
        
        if (countElement) {
            countElement.textContent = newSelected.length;
            console.log('Updated count to:', newSelected.length);
        }
        
        if (deleteButton) {
            if (newSelected.length > 0) {
                deleteButton.disabled = false;
                deleteButton.classList.remove('opacity-50', 'cursor-not-allowed');
                console.log('Enabled delete button');
            } else {
                deleteButton.disabled = true;
                deleteButton.classList.add('opacity-50', 'cursor-not-allowed');
                console.log('Disabled delete button');
            }
        }
    }

    handleSelectAllStickers() {
        const currentStickers = this.state.editingCharacter?.stickers || [];
        const allIndices = currentStickers.map((_, index) => index);
        
        // 상태 직접 업데이트
        this.state.selectedStickerIndices = allIndices;
        
        // UI 업데이트 - 체크박스들 모두 체크
        const checkboxes = document.querySelectorAll('.sticker-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
        });
        
        // 선택 개수와 삭제 버튼 업데이트
        const countElement = document.getElementById('selected-count');
        const deleteButton = document.getElementById('delete-selected-stickers');
        
        if (countElement) countElement.textContent = allIndices.length;
        if (deleteButton) {
            deleteButton.disabled = false;
            deleteButton.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }

    handleDeleteSelectedStickers() {
        const selectedIndices = this.state.selectedStickerIndices || [];
        if (selectedIndices.length === 0) return;

        const currentStickers = this.state.editingCharacter?.stickers || [];
        
        // 선택된 인덱스를 Set으로 변환하여 빠른 검색 가능
        const selectedSet = new Set(selectedIndices);
        
        // 선택되지 않은 스티커만 남김
        const updatedStickers = currentStickers.filter((_, index) => !selectedSet.has(index));

        // 상태 직접 업데이트
        this.state.editingCharacter = { 
            ...this.state.editingCharacter, 
            stickers: updatedStickers 
        };
        this.state.selectedStickerIndices = [];
        this.state.stickerSelectionMode = false; // 삭제 후 선택 모드 해제
        
        // UI 전체 업데이트
        this.updateStickerSection();
    }

    async handleSaveCharacter() {
        const name = document.getElementById('character-name').value.trim();
        const prompt = document.getElementById('character-prompt').value.trim();

        if (!name || !prompt) {
            this.showInfoModal(language.modal.characterNameDescriptionNotFulfilled.title, language.modal.characterNameDescriptionNotFulfilled.message);
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
            media: this.state.editingCharacter?.media || [], // Preserve existing media
            stickers: this.state.editingCharacter?.stickers || [] // Preserve existing stickers
        };

        // 저장 전 용량 체크
        const characterDataString = JSON.stringify(characterData);
        const storageCheck = this.checkStorageSpace(characterDataString, 'personaChat_characters_v16');
        
        if (!storageCheck.canSave) {
            this.showInfoModal(
                "저장 공간 부족", 
                `현재 사용량: ${storageCheck.current}\n예상 사용량: ${storageCheck.total}\n\n스티커나 이미지를 줄이거나 오래된 대화를 삭제해주세요.`
            );
            return;
        }

        if (this.state.editingCharacter && this.state.editingCharacter.id) {
            const updatedCharacters = this.state.characters.map(c =>
                c.id === this.state.editingCharacter.id ? { ...c, ...characterData } : c
            );
            this.shouldSaveCharacters = true;
            this.setState({ characters: updatedCharacters });
        } else {
            const newCharacter = { id: Date.now(), ...characterData, messageCountSinceLastSummary: 0, proactiveEnabled: true, media: [], stickers: [] };
            const newCharacters = [newCharacter, ...this.state.characters];
            const newMessages = { ...this.state.messages, [newCharacter.id]: [] };
            this.shouldSaveCharacters = true;
            this.setState({
                characters: newCharacters,
                messages: newMessages,
                selectedChatId: newCharacter.id
            });
        }
        this.closeCharacterModal();
    }

    handleDeleteCharacter(characterId) {
        this.showConfirmModal(
            language.modal.characterDeleteConfirm.title, language.modal.characterDeleteConfirm.message,
            () => {
                const newCharacters = this.state.characters.filter(c => c.id !== characterId);
                const newMessages = { ...this.state.messages };
                const newChatRooms = { ...this.state.chatRooms };
                const newUnreadCounts = { ...this.state.unreadCounts };
                
                // 캐릭터의 모든 채팅방과 관련 메시지 삭제
                const characterChatRooms = this.state.chatRooms[characterId] || [];
                characterChatRooms.forEach(chatRoom => {
                    delete newMessages[chatRoom.id];
                    delete newUnreadCounts[chatRoom.id];
                });
                
                // 캐릭터 채팅방 목록 삭제
                delete newChatRooms[characterId];
                
                // 기존 메시지 구조 삭제 (호환성)
                delete newMessages[characterId];

                let newSelectedChatId = this.state.selectedChatId;
                // 현재 선택된 채팅이 삭제되는 캐릭터의 것이라면 다른 채팅으로 변경
                const selectedChatRoom = this.getCurrentChatRoom();
                if (selectedChatRoom && selectedChatRoom.characterId === characterId) {
                    newSelectedChatId = this.getFirstAvailableChatRoom();
                }

                this.setState({
                    characters: newCharacters,
                    messages: newMessages,
                    chatRooms: newChatRooms,
                    unreadCounts: newUnreadCounts,
                    selectedChatId: newSelectedChatId,
                    expandedCharacterId: null
                });
            }
        );
    }

    async handleImageFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 30 * 1024 * 1024) { // 30MB limit
            this.showInfoModal(language.modal.imageFileSizeExceeded.title, language.modal.imageFileSizeExceeded.message);
            e.target.value = '';
            return;
        }

        try {
            const resizedDataUrl = await this.resizeImage(file, 800, 800); // Resize to max 800x800
            this.setState({
                imageToSend: { dataUrl: resizedDataUrl, file },
                showInputOptions: false
            });
        } catch (error) {
            console.error("Image processing error:", error);
            this.showInfoModal(language.modal.imageProcessingError.title, language.modal.imageProcessingError.message);
        } finally {
            e.target.value = '';
        }
    }

    async handleSendMessage(content, type = 'text', stickerData = null) {
        const { selectedChatId, isWaitingForResponse, settings, imageToSend } = this.state;

        if (!selectedChatId || isWaitingForResponse) return;
        if (type === 'text' && !content.trim() && !imageToSend) return;
        if (type === 'image' && !imageToSend) return;
        if (type === 'sticker' && !content.trim()) return;

        if (!settings.apiKey) {
            this.showInfoModal(language.modal.apiKeyRequired.title, language.modal.apiKeyRequired.message);
            this.setState({ showSettingsModal: true });
            return;
        }

        const userMessage = {
            id: Date.now(),
            sender: 'user',
            type: type,
            content: content,
            time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
            isMe: true,
            ...(type === 'sticker' && stickerData ? { stickerData } : {})
        };

        const selectedChatRoom = this.getCurrentChatRoom();
        if (!selectedChatRoom) return;
        
        const charIndex = this.state.characters.findIndex(c => c.id === selectedChatRoom.characterId);
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
        let chatId, character;
        
        if (isProactive) {
            // Proactive 모드에서는 character 객체가 전달됨
            character = currentMessagesState;
            // 해당 캐릭터의 첫 번째 채팅방 찾기
            const characterChatRooms = this.state.chatRooms[character.id] || [];
            if (characterChatRooms.length > 0) {
                chatId = characterChatRooms[0].id;
            } else {
                // 채팅방이 없으면 새로 생성
                chatId = this.createNewChatRoom(character.id);
            }
        } else {
            // 일반 모드에서는 선택된 채팅방 사용
            chatId = this.state.selectedChatId;
            const chatRoom = this.getCurrentChatRoom();
            character = chatRoom ? this.state.characters.find(c => c.id === chatRoom.characterId) : null;
        }

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

        await this.sleep(response.reactionDelay || 1000);
        this.setState({ isWaitingForResponse: false, typingCharacterId: chatId });


        if (response.messages && Array.isArray(response.messages) && response.messages.length > 0) {
            let currentChatMessages = this.state.messages[chatId] || [];
            let newUnreadCounts = { ...this.state.unreadCounts };

            for (let i = 0; i < response.messages.length; i++) {
                const messagePart = response.messages[i];

                await this.sleep(messagePart.delay || 1000);

                const botMessage = {
                    id: Date.now() + Math.random(),
                    sender: character.name,
                    content: messagePart.content,
                    time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
                    isMe: false,
                    isError: false,
                    type: messagePart.sticker ? 'sticker' : 'text',
                    hasText: !!(messagePart.content && messagePart.content.trim()),
                };
                
                // 스티커가 포함된 경우 스티커 정보 추가
                if (messagePart.sticker) {
                    botMessage.stickerId = messagePart.sticker;
                    const foundSticker = character.stickers?.find(s => {
                        // ID로 찾기 (숫자 비교)
                        if (s.id == messagePart.sticker) return true;
                        // 이름으로 찾기 (정확한 문자열 비교)
                        if (s.name === messagePart.sticker) return true;
                        // 파일명에서 확장자 제거한 이름으로 찾기
                        const baseFileName = s.name.replace(/\.[^/.]+$/, "");
                        const searchFileName = String(messagePart.sticker).replace(/\.[^/.]+$/, "");
                        if (baseFileName === searchFileName) return true;
                        return false;
                    });
                    botMessage.stickerName = foundSticker?.name || 'Unknown Sticker';
                }

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
        this.showConfirmModal(language.modal.messageGroupDeleteConfirm.title, language.modal.messageGroupDeleteConfirm.message, () => {
            const currentMessages = this.state.messages[this.state.selectedChatId] || [];
            const groupInfo = this.findMessageGroup(currentMessages, currentMessages.findIndex(msg => msg.id === lastMessageId));
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
        const groupInfo = this.findMessageGroup(currentMessages, currentMessages.findIndex(msg => msg.id === lastMessageId));
        if (!groupInfo) return;

        const originalMessage = currentMessages[groupInfo.startIndex];
        if (originalMessage.type === 'text' && !newContent) {
            this.showInfoModal(language.modal.messageEmptyError.title, language.modal.messageEmptyError.message);
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
        const groupInfo = this.findMessageGroup(currentMessages, currentMessages.findIndex(msg => msg.id === lastMessageId));
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


    // --- HELPER FUNCTIONS ---
    toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    resizeImage = (file, maxWidth, maxHeight) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8)); // Use JPEG for smaller size
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });

    compressImageForSticker = (file, maxWidth, maxHeight, quality) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // 비율 유지하면서 크기 조정
                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                // 이미지 품질 개선을 위한 설정
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                
                ctx.drawImage(img, 0, 0, width, height);
                
                // 원본 포맷 유지하려고 시도, 실패시 JPEG
                let mimeType = file.type;
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
                    mimeType = 'image/jpeg';
                }
                
                resolve(canvas.toDataURL(mimeType, quality));
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });

    sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    // LocalStorage 사용량 체크 (이 앱 전용)
    getLocalStorageUsage() {
        const appKeys = [
            'personaChat_settings_v16',
            'personaChat_characters_v16', 
            'personaChat_messages_v16',
            'personaChat_unreadCounts_v16',
            'personaChat_chatRooms_v16',
            'personaChat_userStickers_v16'
        ];
        
        let totalSize = 0;
        for (const key of appKeys) {
            const value = localStorage.getItem(key);
            if (value) {
                totalSize += value.length + key.length;
            }
        }
        return totalSize;
    }

    // 바이트를 읽기 쉬운 형태로 변환
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 캐릭터 스티커 전체 용량 계산
    calculateCharacterStickerSize(character) {
        if (!character.stickers || character.stickers.length === 0) {
            return 0;
        }
        
        return character.stickers.reduce((total, sticker) => {
            // Base64 데이터의 실제 크기 계산
            if (sticker.dataUrl) {
                const base64Data = sticker.dataUrl.split(',')[1] || '';
                return total + Math.round(base64Data.length * 0.75); // Base64는 실제 데이터의 약 133%
            }
            return total + (sticker.size || 0);
        }, 0);
    }

    // 저장 공간 체크 (수정됨 - 실제 데이터 크기만 계산)
    checkStorageSpace(newData = '', existingKey = '') {
        // 현재 이 앱이 사용하는 localStorage 크기만 계산
        const appKeys = [
            'personaChat_settings_v16',
            'personaChat_characters_v16', 
            'personaChat_messages_v16',
            'personaChat_unreadCounts_v16',
            'personaChat_chatRooms_v16',
            'personaChat_userStickers_v16'
        ];
        
        let currentAppUsage = 0;
        for (const key of appKeys) {
            const value = localStorage.getItem(key);
            if (value) {
                currentAppUsage += value.length + key.length;
            }
        }
        
        // 기존 데이터가 있다면 그 크기를 제외하고 새 데이터 크기만 추가
        let existingSize = 0;
        if (existingKey) {
            const existing = localStorage.getItem(existingKey);
            if (existing) {
                existingSize = existing.length;
            }
        }
        
        const newDataSize = newData.length;
        const totalAfterAdd = currentAppUsage - existingSize + newDataSize;
        
        // 50MB를 경고 기준으로 설정
        const warningLimit = 50 * 1024 * 1024; // 50MB
        
        if (totalAfterAdd > warningLimit) {
            const currentFormatted = this.formatBytes(currentAppUsage);
            const totalFormatted = this.formatBytes(totalAfterAdd);
            return {
                canSave: false,
                current: currentFormatted,
                total: totalFormatted
            };
        }
        
        return { canSave: true };
    }

    // 캐릭터 스티커 용량 체크
    checkCharacterStickerLimit(character, newStickers = []) {
        const currentStickerSize = this.calculateCharacterStickerSize(character);
        const newStickerSize = newStickers.reduce((total, sticker) => {
            if (sticker.dataUrl) {
                const base64Data = sticker.dataUrl.split(',')[1] || '';
                return total + Math.round(base64Data.length * 0.75);
            }
            return total + (sticker.size || 0);
        }, 0);
        
        const totalAfterAdd = currentStickerSize + newStickerSize;
        const stickerLimit = 100 * 1024 * 1024; // 100MB
        
        if (totalAfterAdd > stickerLimit) {
            return {
                canAdd: false,
                current: this.formatBytes(currentStickerSize),
                afterAdd: this.formatBytes(totalAfterAdd),
                limit: this.formatBytes(stickerLimit)
            };
        }
        
        return { canAdd: true };
    }

    formatDateSeparator = (date) => {
        return new Intl.DateTimeFormat('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
        }).format(date);
    };

    findMessageGroup(messages, index) {
        const message = messages[index];
        if (!message) return null;

        let startIndex = index;
        for (let i = index - 1; i >= 0; i--) {
            if (messages[i].isMe === message.isMe && (new Date(messages[i + 1].id) - new Date(messages[i].id) < 60000)) {
                startIndex = i;
            } else {
                break;
            }
        }

        let endIndex = index;
        for (let i = index + 1; i < messages.length; i++) {
            if (messages[i].isMe === message.isMe && (new Date(messages[i].id) - new Date(messages[i - 1].id) < 60000)) {
                endIndex = i;
            } else {
                break;
            }
        }

        return {
            startIndex: startIndex,
            endIndex: endIndex,
            firstMessageId: messages[startIndex].id,
            lastMessageId: messages[endIndex].id
        };
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
    encodeTextInImage(imageData, text) {
        const data = imageData.data;
        const textBytes = new TextEncoder().encode(text);
        const textLength = textBytes.length;
        const headerSizeInPixels = 8;

        const availableDataPixels = (data.length / 4) - headerSizeInPixels;

        if (textLength > availableDataPixels) {
            console.error(`Image is too small. Required: ${textLength}, Available: ${availableDataPixels}`);
            this.showInfoModal(language.modal.imageTooSmallOrCharacterInfoTooLong.title,
                language.modal.imageTooSmallOrCharacterInfoTooLong.message);
            return null;
        }

        data[3] = 0x50; data[7] = 0x43; data[11] = 0x41; data[15] = 0x52;
        data[19] = (textLength >> 24) & 0xFF;
        data[23] = (textLength >> 16) & 0xFF;
        data[27] = (textLength >> 8) & 0xFF;
        data[31] = textLength & 0xFF;

        for (let i = 0; i < textLength; i++) {
            data[(headerSizeInPixels + i) * 4 + 3] = textBytes[i];
        }
        return imageData;
    }

    decodeTextFromImage(imageData) {
        const data = imageData.data;
        const headerSizeInPixels = 8;

        if (data[3] !== 0x50 || data[7] !== 0x43 || data[11] !== 0x41 || data[15] !== 0x52) {
            return null;
        }

        const textLength = (data[19] << 24) | (data[23] << 16) | (data[27] << 8) | data[31];

        if (textLength <= 0 || textLength > (data.length / 4) - headerSizeInPixels) {
            return null;
        }

        const textBytes = new Uint8Array(textLength);
        for (let i = 0; i < textLength; i++) {
            textBytes[i] = data[(headerSizeInPixels + i) * 4 + 3];
        }

        try {
            return new TextDecoder().decode(textBytes);
        } catch (e) {
            return null;
        }
    }

    async handleSaveCharacterToImage() {
        const name = document.getElementById('character-name').value.trim();
        if (!name) {
            this.showInfoModal(language.modal.characterCardNoNameError.title, language.modal.characterCardNoNameError.message);
            return;
        }
        const currentAvatar = this.state.editingCharacter?.avatar;
        if (!currentAvatar) {
            this.showInfoModal(language.modal.characterCardNoAvatarImageError.title, language.modal.characterCardNoAvatarImageError.message);
            return;
        }

        const memoryNodes = document.querySelectorAll('.memory-input');
        const memories = Array.from(memoryNodes).map(input => input.value.trim()).filter(Boolean);

        const proactiveToggle = document.getElementById('character-proactive-toggle');
        const proactiveEnabled = proactiveToggle ? proactiveToggle.checked : this.state.editingCharacter?.proactiveEnabled !== false;

        const characterData = {
            name: name,
            prompt: document.getElementById('character-prompt').value.trim(),
            responseTime: document.getElementById('character-responseTime').value,
            thinkingTime: document.getElementById('character-thinkingTime').value,
            reactivity: document.getElementById('character-reactivity').value,
            tone: document.getElementById('character-tone').value,
            source: 'PersonaChatAppCharacterCard',
            memories: memories,
            proactiveEnabled: proactiveEnabled,
        };

        const image = new Image();
        image.crossOrigin = "Anonymous";
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const jsonString = JSON.stringify(characterData);

            const newImageData = this.encodeTextInImage(imageData, jsonString);

            if (newImageData) {
                ctx.putImageData(newImageData, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.href = dataUrl;
                link.download = `${characterData.name}_card.png`;
                link.click();
            }
        };
        image.onerror = () => this.showInfoModal(language.modal.avatarImageLoadError.title, language.modal.avatarImageLoadError.message);
        image.src = currentAvatar;
    }

    async loadCharacterFromImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageSrc = e.target.result;
            const image = new Image();
            image.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = image.width;
                canvas.height = image.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                try {
                    const jsonString = this.decodeTextFromImage(imageData);
                    if (jsonString) {
                        const data = JSON.parse(jsonString);
                        if (data.source === 'PersonaChatAppCharacterCard') {
                            this.setState({
                                editingCharacter: { ...this.state.editingCharacter, ...data, avatar: imageSrc }
                            });
                            this.showInfoModal(language.modal.avatarLoadSuccess.title, language.modal.avatarLoadSuccess.message);
                            return;
                        }
                    }
                } catch (err) {
                    console.error("Failed to parse character data from image:", err);
                }

                this.showInfoModal(language.modal.characterCardNoAvatarImageInfo.title, language.modal.characterCardNoAvatarImageInfo.message);

                this.setState({ editingCharacter: { ...(this.state.editingCharacter || {}), avatar: imageSrc } });
            };
            image.src = imageSrc;
        };
        reader.readAsDataURL(file);
    }

    // --- BACKUP & RESTORE ---
    async handleBackup() {
        try {
            const backupData = {
                version: 'v16',
                timestamp: new Date().toISOString(),
                settings: await this.loadFromLocalStorage('personaChat_settings_v16', {}),
                characters: await this.loadFromLocalStorage('personaChat_characters_v16', []),
                messages: await this.loadFromLocalStorage('personaChat_messages_v16', {}),
                unreadCounts: await this.loadFromLocalStorage('personaChat_unreadCounts_v16', {}),
                chatRooms: await this.loadFromLocalStorage('personaChat_chatRooms_v16', {}),
                userStickers: await this.loadFromLocalStorage('personaChat_userStickers_v16', [])
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

            this.showInfoModal(language.modal.backupComplete.title, language.modal.backupComplete.message);
        } catch (error) {
            console.error("Backup failed:", error);
            this.showInfoModal(language.modal.backupFailed.title, language.modal.backupFailed.message);
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
                    this.showConfirmModal(
                        language.modal.restoreConfirm.title,
                        language.modal.restoreConfirm.message,
                        () => {
                            this.saveToLocalStorage('personaChat_settings_v16', backupData.settings);
                            this.saveToLocalStorage('personaChat_characters_v16', backupData.characters);
                            this.saveToLocalStorage('personaChat_messages_v16', backupData.messages);
                            this.saveToLocalStorage('personaChat_unreadCounts_v16', backupData.unreadCounts);

                            this.showInfoModal(language.modal.restoreComplete.title, language.modal.restoreComplete.message);
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
                this.showInfoModal(language.modal.restoreFailed.title, language.modal.restoreFailed.message);
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

            this.showInfoModal(language.modal.promptBackupComplete.title, language.modal.promptBackupComplete.message);
        } catch (error) {
            console.error("Prompt backup failed:", error);
            this.showInfoModal(language.modal.promptBackupFailed.title, language.modal.promptBackupFailed.message);
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
                    this.showConfirmModal(
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
                this.showInfoModal(language.modal.promptRestoreFailed.title, language.modal.promptRestoreFailed.message);
            } finally {
                // Reset file input so the same file can be selected again
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    }

    resetPromptToDefault(section, key, promptName) {
        this.showConfirmModal(
            '프롬프트 초기화',
            `"${promptName}"을(를) 기본값으로 되돌리시겠습니까?\n현재 설정은 모두 사라집니다.`,
            () => {
                // 기본 프롬프트 가져오기
                import('./defauts.js').then(({ defaultPrompts }) => {
                    const currentPrompts = { ...this.state.settings.prompts };
                    
                    if (section === 'main') {
                        // 메인 프롬프트의 특정 키 리셋
                        currentPrompts.main[key] = defaultPrompts.main[key];
                    } else if (section === 'profile_creation') {
                        // 프로필 생성 프롬프트 전체 리셋
                        currentPrompts.profile_creation = defaultPrompts.profile_creation;
                    }
                    
                    // 상태 직접 업데이트
                    this.state.settings.prompts = currentPrompts;
                    
                    // 해당 textarea 업데이트
                    let textareaId;
                    if (section === 'main') {
                        textareaId = `prompt-main-${key}`;
                    } else if (section === 'profile_creation') {
                        textareaId = 'prompt-profile_creation';
                    }
                    
                    const textarea = document.getElementById(textareaId);
                    if (textarea) {
                        if (section === 'main') {
                            textarea.value = defaultPrompts.main[key];
                        } else if (section === 'profile_creation') {
                            textarea.value = defaultPrompts.profile_creation;
                        }
                    }
                    
                    this.showInfoModal('초기화 완료', `"${promptName}"이(가) 기본값으로 되돌려졌습니다.`);
                });
            }
        );
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
            } else if (msg.isMe && msg.type === 'sticker' && msg.stickerData) {
                // 페르소나 스티커: 스티커 이름만 AI에게 전송 (파일 데이터는 전송하지 않음)
                const stickerName = msg.stickerData.stickerName || 'Unknown Sticker';
                let stickerText = `[사용자가 "${stickerName}" 스티커를 보냄]`;
                if (msg.content && msg.content.trim()) {
                    stickerText += ` ${msg.content}`;
                }
                parts.push({ text: stickerText });
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
        
        // 스티커 정보 준비
        const availableStickers = character.stickers?.map(sticker => `${sticker.id} (${sticker.name})`).join(', ') || 'none';
        
        const guidelines = [
            prompts.memory_generation,
            prompts.character_acting,
            prompts.message_writing,
            prompts.language,
            prompts.additional_instructions,
            prompts.sticker_usage?.replace('{availableStickers}', availableStickers) || ''
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

# Sticker Collection
${character.stickers && character.stickers.length > 0 ? 
  `${character.name} has access to the following stickers that can be used to express emotions and reactions:
${character.stickers.map(sticker => `- ${sticker.id}: "${sticker.name}" (${sticker.type})`).join('\n')}

## Sticker Usage
${prompts.sticker_usage?.replace('{character.name}', character.name).replace('{availableStickers}', availableStickers) || ''}` : 
  `${character.name} has no stickers available. Use only text-based expressions.`}

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
                                    "content": { "type": "STRING" },
                                    "sticker": { "type": "STRING" }
                                },
                                required: ["delay"]
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
                const rawResponseText = data.candidates[0].content.parts[0].text;
                const parsed = JSON.parse(rawResponseText);
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