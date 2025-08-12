import { language } from "./language.js";

class UIRenderer {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.animatedMessageIds = new Set();
    }

    renderSidebar() {
        const state = this.stateManager.getState();
        const sidebar = document.getElementById("sidebar");
        const sidebarContent = document.getElementById("sidebar-content");
        const backdrop = document.getElementById("sidebar-backdrop");
        const desktopToggle = document.getElementById("desktop-sidebar-toggle");

        if (state.sidebarCollapsed) {
            sidebar.classList.add("-translate-x-full", "md:w-0");
            sidebar.classList.remove("translate-x-0", "md:w-80");
            backdrop.classList.add("hidden");
            if (desktopToggle) desktopToggle.innerHTML = `<i data-lucide="chevron-right" class="w-5 h-5 text-gray-300"></i>`;
        } else {
            sidebar.classList.remove("-translate-x-full", "md:w-0");
            sidebar.classList.add("translate-x-0", "md:w-80");
            backdrop.classList.remove("hidden");
            if (desktopToggle) desktopToggle.innerHTML = `<i data-lucide="chevron-left" class="w-5 h-5 text-gray-300"></i>`;
        }

        const filteredCharacters = state.characters.filter(char =>
            char.name.toLowerCase().includes(state.searchQuery.toLowerCase())
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
                        <input id="search-input" type="text" placeholder="검색하기..." value="${state.searchQuery}" class="w-full pl-11 pr-4 py-2 md:py-3 bg-gray-800 text-white rounded-xl border-0 focus:ring-2 focus:ring-blue-500/30 focus:bg-gray-750 transition-all duration-200 text-sm placeholder-gray-500" />
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
                        ${filteredCharacters.map(char => this.renderCharacterItem(char)).join("")}
                    </div>
                </div>
            `;
    }

    renderCharacterItem(char) {
        const state = this.stateManager.getState();
        const lastMessage = (state.messages[char.id] || []).slice(-1)[0];
        const isSelected = state.selectedChatId === char.id;
        const unreadCount = state.unreadCounts[char.id] || 0;

        let lastMessageContent = language.chat.startNewChat;
        if (lastMessage) {
            if (lastMessage.type === "image") {
                lastMessageContent = language.chat.imageSent;
            } else {
                lastMessageContent = lastMessage.content;
            }
        }

        return `
                <div data-id="${char.id}" class="character-item group p-3 md:p-4 rounded-xl cursor-pointer transition-all duration-200 relative ${isSelected ? "bg-gray-800 border border-gray-700" : "hover:bg-gray-800/50"}">
                    <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex space-x-1">
                        <button data-id="${char.id}" class="edit-character-btn p-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 hover:text-white transition-colors"><i data-lucide="edit-3" class="w-3 h-3 pointer-events-none"></i></button>
                        <button data-id="${char.id}" class="delete-character-btn p-1 bg-gray-700 hover:bg-red-600 rounded text-gray-300 hover:text-white transition-colors"><i data-lucide="trash-2" class="w-3 h-3 pointer-events-none"></i></button>
                    </div>
                    <div class="flex items-center space-x-3 md:space-x-4 pointer-events-none">
                        ${this.renderAvatar(char, "md")}
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center justify-between mb-1">
                                <h3 class="font-semibold text-white text-sm truncate">${char.name}</h3>
                                <div class="flex items-center gap-2">
                                    ${unreadCount > 0 ? `<span class="bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full leading-none">${unreadCount}</span>` : ""}
                                    <span class="text-xs text-gray-500 shrink-0">${lastMessage?.time || ""}</span>
                                </div>
                            </div>
                            <p class="text-xs md:text-sm truncate ${lastMessage?.isError ? "text-red-400" : "text-gray-400"}">${lastMessageContent}</p>
                        </div>
                    </div>
                </div>
            `;
    }

    renderAvatar(character, size = "md") {
        const sizeClasses = {
            sm: "w-10 h-10 text-sm",
            md: "w-12 h-12 text-base",
            lg: "w-16 h-16 text-lg",
        }[size];

        if (character?.avatar && character.avatar.startsWith("data:image")) {
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
        const state = this.stateManager.getState();
        const mainChat = document.getElementById("main-chat");
        const selectedChat = state.characters.find(c => c.id === state.selectedChatId);

        if (selectedChat) {
            mainChat.innerHTML = `
                    <header class="p-4 bg-gray-900/80 border-b border-gray-800 glass-effect flex items-center justify-between z-10">
                        <div class="flex items-center space-x-2 md:space-x-4">
                            <button id="mobile-sidebar-toggle" class="p-2 -ml-2 rounded-full hover:bg-gray-700 md:hidden">
                                <i data-lucide="menu" class="h-5 w-5 text-gray-300"></i>
                            </button>
                            ${this.renderAvatar(selectedChat, "sm")}
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
        const state = this.stateManager.getState();
        const { showInputOptions, isWaitingForResponse, imageToSend } = state;
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
        const state = this.stateManager.getState();
        const messages = state.messages[state.selectedChatId] || [];
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

            if (state.editingMessageId === groupInfo.lastMessageId) {
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

            const selectedChat = state.characters.find(c => c.id === state.selectedChatId);
            const showSenderInfo = !msg.isMe && i === groupInfo.startIndex;

            const hasAnimated = this.animatedMessageIds.has(msg.id);
            const needsAnimation = !hasAnimated;
            if (needsAnimation) {
                this.animatedMessageIds.add(msg.id);
            }

            const lastUserMessage = [...messages].reverse().find(m => m.isMe);
            const showUnread = msg.isMe && lastUserMessage && msg.id === lastUserMessage.id && state.isWaitingForResponse && !state.typingCharacterId;

            let messageBodyHtml = '';
            if (msg.type === 'sticker') { // Fallback for old sticker data
                messageBodyHtml = `<div class="px-4 py-2 rounded-2xl text-sm md:text-base leading-relaxed bg-gray-700 text-gray-400 italic">[삭제된 스티커: ${msg.stickerName || msg.content}]</div>`;
            } else if (msg.type === 'image') {
                const character = state.characters.find(c => c.id === state.selectedChatId);
                const imageData = character?.media?.find(m => m.id === msg.imageId);
                const imageUrl = imageData ? imageData.dataUrl : ""; // Placeholder for image if not found

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
                const canReroll = !msg.isMe && (msg.type === 'text' || msg.type === 'image') && isLastMessageOverall && !state.isWaitingForResponse;
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

        if (state.typingCharacterId === state.selectedChatId) {
            const selectedChat = state.characters.find(c => c.id === state.selectedChatId);
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
        const container = document.getElementById("modal-container");
        let html = '';
        if (this.stateManager.getState().showSettingsModal) html += this.renderSettingsModal();
        if (this.stateManager.getState().showCharacterModal) html += this.renderCharacterModal();
        if (this.stateManager.getState().showPromptModal) html += this.renderPromptModal();
        if (this.stateManager.getState().modal.isOpen) html += this.renderConfirmationModal();
        container.innerHTML = html;
        this.createIcons();
    }

    renderSettingsModal() {
        const { settings } = this.stateManager.getState();
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
                                    <span class="text-base font-medium text-gray-200 inline-flex items-center"><i data-lucide="bot" class="w-4 h-4 mr-2"></i>AI 설정</span>
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
                                    <span class="text-base font-medium text-gray-200 inline-flex items-center"><i data-lucide="text-size" class="w-4 h-4 mr-2"></i>글자 크기</span>
                                    <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180"></i>
                                </summary>
                                <div class="content-wrapper">
                                    <div class="content-inner pt-4 space-y-4">
                                        <div>
                                            <label for="settings-font-scale" class="block text-sm font-medium text-gray-300 mb-2">글자 크기 조절: <span id="font-scale-label">${settings.fontScale.toFixed(1)}</span></label>
                                            <input type="range" id="settings-font-scale" min="0.8" max="1.2" step="0.1" value="${settings.fontScale}" class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-lg" oninput="document.getElementById('font-scale-label').innerText = this.value">
                                        </div>
                                    </div>
                                </div>
                            </details>
                            <!-- 데이터 관리 -->
                            <details class="group border-b border-gray-700 pb-2">
                                <summary class="flex items-center justify-between cursor-pointer list-none py-2">
                                    <span class="text-base font-medium text-gray-200 inline-flex items-center"><i data-lucide="database" class="w-4 h-4 mr-2"></i>데이터 관리</span>
                                    <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180"></i>
                                </summary>
                                <div class="content-wrapper">
                                    <div class="content-inner pt-4 space-y-4">
                                        <div>
                                            <button id="backup-data-btn" class="w-full py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                                                <i data-lucide="download" class="w-4 h-4"></i> 데이터 백업
                                            </button>
                                        </div>
                                        <div>
                                            <input type="file" id="restore-file-input" accept=".json" class="hidden" />
                                            <button id="restore-data-btn" class="w-full py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                                                <i data-lucide="upload" class="w-4 h-4"></i> 데이터 복원
                                            </button>
                                        </div>
                                        <div>
                                            <button id="backup-prompts-btn" class="w-full py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                                                <i data-lucide="download" class="w-4 h-4"></i> 프롬프트 백업
                                            </button>
                                        </div>
                                        <div>
                                            <input type="file" id="restore-prompts-input" accept=".json" class="hidden" />
                                            <button id="restore-prompts-btn" class="w-full py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                                                <i data-lucide="upload" class="w-4 h-4"></i> 프롬프트 복원
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </details>
                            <!-- 고급 설정 -->
                            <details class="group border-b border-gray-700 pb-2">
                                <summary class="flex items-center justify-between cursor-pointer list-none py-2">
                                    <span class="text-base font-medium text-gray-200 inline-flex items-center"><i data-lucide="sliders-horizontal" class="w-4 h-4 mr-2"></i>고급 설정</span>
                                    <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180"></i>
                                </summary>
                                <div class="content-wrapper">
                                    <div class="content-inner pt-4 space-y-4">
                                        <div>
                                            <label for="settings-user-name" class="block text-sm font-medium text-gray-300 mb-2">사용자 이름</label>
                                            <input id="settings-user-name" type="text" placeholder="사용자 이름" value="${settings.userName}" class="w-full px-4 py-3 bg-gray-700 text-white rounded-xl border-0 focus:ring-2 focus:ring-blue-500/50 transition-all duration-200 text-sm" />
                                        </div>
                                        <div>
                                            <label for="settings-user-description" class="block text-sm font-medium text-gray-300 mb-2">사용자 설명</label>
                                            <textarea id="settings-user-description" placeholder="사용자 설명" class="w-full px-4 py-3 bg-gray-700 text-white rounded-xl border-0 focus:ring-2 focus:ring-blue-500/50 transition-all duration-200 text-sm" rows="3">${settings.userDescription}</textarea>
                                        </div>
                                        <div class="flex items-center justify-between">
                                            <label for="settings-proactive-chat-enabled" class="text-sm font-medium text-gray-300">선제적 채팅 활성화</label>
                                            <input type="checkbox" id="settings-proactive-chat-enabled" class="toggle toggle-primary" ${settings.proactiveChatEnabled ? 'checked' : ''}>
                                        </div>
                                        <div class="flex items-center justify-between">
                                            <label for="settings-random-first-message-enabled" class="text-sm font-medium text-gray-300">랜덤 첫 메시지 활성화</label>
                                            <input type="checkbox" id="settings-random-first-message-enabled" class="toggle toggle-primary" ${settings.randomFirstMessageEnabled ? 'checked' : ''}>
                                        </div>
                                        <div id="random-chat-options" class="space-y-4 ${settings.randomFirstMessageEnabled ? 'block' : 'hidden'}">
                                            <div>
                                                <label for="settings-random-character-count" class="block text-sm font-medium text-gray-300 mb-2">랜덤 캐릭터 수: <span id="random-character-count-label">${settings.randomCharacterCount}명</span></label>
                                                <input type="range" id="settings-random-character-count" min="1" max="10" step="1" value="${settings.randomCharacterCount}" class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-lg" oninput="document.getElementById('random-character-count-label').innerText = this.value + '명'">
                                            </div>
                                            <div>
                                                <label for="settings-random-message-frequency-min" class="block text-sm font-medium text-gray-300 mb-2">랜덤 메시지 빈도 (최소, 분): <span id="random-message-frequency-min-label">${settings.randomMessageFrequencyMin}분</span></label>
                                                <input type="range" id="settings-random-message-frequency-min" min="1" max="60" step="1" value="${settings.randomMessageFrequencyMin}" class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-lg" oninput="document.getElementById('random-message-frequency-min-label').innerText = this.value + '분'">
                                            </div>
                                            <div>
                                                <label for="settings-random-message-frequency-max" class="block text-sm font-medium text-gray-300 mb-2">랜덤 메시지 빈도 (최대, 분): <span id="random-message-frequency-max-label">${settings.randomMessageFrequencyMax}분</span></label>
                                                <input type="range" id="settings-random-message-frequency-max" min="60" max="300" step="10" value="${settings.randomMessageFrequencyMax}" class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-lg" oninput="document.getElementById('random-message-frequency-max-label').innerText = this.value + '분'">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </details>
                        </div>
                        <div class="p-4 border-t border-gray-700 flex justify-end shrink-0">
                            <button id="save-settings" class="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium">저장</button>
                        </div>
                    </div>
                </div>
            `;
    }

    renderCharacterModal() {
        const state = this.stateManager.getState();
        const editingCharacter = state.editingCharacter || {};
        const isNew = !editingCharacter.id;

        const memoriesHtml = (editingCharacter.memories || []).map((memory, index) => `
            <div class="flex items-center space-x-2 memory-item">
                <input type="text" value="${memory}" data-index="${index}" class="memory-input w-full px-3 py-2 bg-gray-700 text-white rounded-lg text-sm" placeholder="기억을 입력하세요" />
                <button class="delete-memory-btn p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"><i data-lucide="minus" class="w-4 h-4"></i></button>
            </div>
        `).join('');

        const mediaHtml = (editingCharacter.media || []).map((mediaItem, index) => `
            <div class="flex items-center space-x-2 media-item">
                <img src="${mediaItem.dataUrl}" class="w-16 h-16 object-cover rounded-lg" />
                <input type="text" value="${mediaItem.name}" data-index="${index}" class="media-name-input w-full px-3 py-2 bg-gray-700 text-white rounded-lg text-sm" placeholder="미디어 이름" />
                <button class="delete-media-btn p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"><i data-lucide="minus" class="w-4 h-4"></i></button>
            </div>
        `).join('');

        return `
            <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div class="bg-gray-800 rounded-2xl w-full max-w-2xl mx-4 flex flex-col" style="max-height: 90vh;">
                    <div class="flex items-center justify-between p-6 border-b border-gray-700 shrink-0">
                        <h3 class="text-lg font-semibold text-white">${isNew ? '새로운 상대 초대' : '상대 정보 수정'}</h3>
                        <button id="close-character-modal" class="p-1 hover:bg-gray-700 rounded-full"><i data-lucide="x" class="w-5 h-5"></i></button>
                    </div>
                    <div class="p-6 space-y-4 overflow-y-auto">
                        <div class="flex flex-col items-center">
                            <div class="relative w-24 h-24 mb-4">
                                ${this.renderAvatar(editingCharacter, 'lg')}
                                <button id="select-avatar-btn" class="absolute bottom-0 right-0 bg-blue-600 hover:bg-blue-700 p-2 rounded-full text-white border-2 border-gray-800">
                                    <i data-lucide="camera" class="w-4 h-4"></i>
                                </button>
                                <input type="file" id="avatar-input" accept="image/*" class="hidden" />
                            </div>
                            <input type="text" id="character-name" placeholder="이름" value="${editingCharacter.name || ''}" class="w-full max-w-sm px-4 py-3 bg-gray-700 text-white rounded-xl border-0 focus:ring-2 focus:ring-blue-500/50 text-center text-xl font-semibold" />
                        </div>

                        <div>
                            <label for="character-description" class="block text-sm font-medium text-gray-300 mb-2">설명</label>
                            <textarea id="character-description" placeholder="상대에 대한 설명" class="w-full px-4 py-3 bg-gray-700 text-white rounded-xl border-0 focus:ring-2 focus:ring-blue-500/50 text-sm" rows="4">${editingCharacter.description || ''}</textarea>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-300 mb-2">기억</label>
                            <div id="memories-container" class="space-y-2 mb-2">
                                ${memoriesHtml}
                            </div>
                            <button id="add-memory-btn" class="w-full py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                                <i data-lucide="plus" class="w-4 h-4"></i> 기억 추가
                            </button>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-300 mb-2">미디어 (사진)</label>
                            <div id="media-container" class="space-y-2 mb-2">
                                ${mediaHtml}
                            </div>
                            <input type="file" id="media-input" accept="image/*" class="hidden" multiple />
                            <button id="add-media-btn" class="w-full py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                                <i data-lucide="plus" class="w-4 h-4"></i> 미디어 추가
                            </button>
                        </div>

                        <div class="flex space-x-2">
                            <button id="load-card-btn" class="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                                <i data-lucide="upload" class="w-4 h-4"></i> 카드 불러오기
                            </button>
                            <button id="save-card-btn" class="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                                <i data-lucide="download" class="w-4 h-4"></i> 카드 저장
                            </button>
                        </div>
                    </div>
                    <div class="p-4 border-t border-gray-700 flex justify-end shrink-0">
                        <button id="save-character" class="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium">저장</button>
                    </div>
                </div>
            </div>
        `;
    }

    renderPromptModal() {
        const state = this.stateManager.getState();
        const prompts = state.settings.prompts;

        const renderPromptSection = (key, promptData) => {
            const entriesHtml = Object.entries(promptData).map(([subKey, value]) => `
                <div>
                    <label for="prompt-${key}-${subKey}" class="block text-sm font-medium text-gray-300 mb-2">${subKey}</label>
                    <textarea id="prompt-${key}-${subKey}" class="w-full px-4 py-3 bg-gray-700 text-white rounded-xl border-0 focus:ring-2 focus:ring-blue-500/50 text-sm" rows="4">${value}</textarea>
                </div>
            `).join('');
            return `
                <details class="group border-b border-gray-700 pb-2" ${key === 'main' ? 'open' : ''}>
                    <summary class="flex items-center justify-between cursor-pointer list-none py-2">
                        <span class="text-base font-medium text-gray-200">${key === 'main' ? '메인 프롬프트' : '프로필 생성 프롬프트'}</span>
                        <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180"></i>
                    </summary>
                    <div class="content-wrapper">
                        <div class="content-inner pt-4 space-y-4">
                            ${entriesHtml}
                        </div>
                    </div>
                </details>
            `;
        };

        return `
            <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div class="bg-gray-800 rounded-2xl w-full max-w-md mx-4 flex flex-col" style="max-height: 90vh;">
                    <div class="flex items-center justify-between p-6 border-b border-gray-700 shrink-0">
                        <h3 class="text-lg font-semibold text-white">프롬프트 수정</h3>
                        <button id="close-prompt-modal" class="p-1 hover:bg-gray-700 rounded-full"><i data-lucide="x" class="w-5 h-5"></i></button>
                    </div>
                    <div class="p-6 space-y-2 overflow-y-auto">
                        ${renderPromptSection('main', prompts.main)}
                        ${renderPromptSection('profile_creation', prompts.profile_creation)}
                    </div>
                    <div class="p-4 border-t border-gray-700 flex justify-end shrink-0">
                        <button id="save-prompts" class="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium">저장</button>
                    </div>
                </div>
            </div>
        `;
    }

    renderConfirmationModal() {
        const modal = this.stateManager.getState().modal;
        return `
            <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div class="bg-gray-800 rounded-2xl w-full max-w-sm mx-4 p-6 space-y-4 text-center relative">
                    <h3 class="text-lg font-semibold text-white">${modal.title}</h3>
                    <p class="text-gray-300 text-sm">${modal.message}</p>
                    <div class="flex justify-center space-x-4">
                        <button id="modal-cancel" class="py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm font-medium">취소</button>
                        <button id="modal-confirm" class="py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium">확인</button>
                    </div>
                </div>
            </div>
        `;
    }

    // Helper functions (move to utils.js later)
    formatDateSeparator(date) {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return language.date.today;
        } else if (date.toDateString() === yesterday.toDateString()) {
            return language.date.yesterday;
        } else {
            return date.toLocaleDateString(language.locale, { year: 'numeric', month: 'long', day: 'numeric' });
        }
    }

    findMessageGroup(messages, currentIndex) {
        const currentMsg = messages[currentIndex];
        let startIndex = currentIndex;
        let endIndex = currentIndex;

        // Find start of group
        while (startIndex > 0 &&
            messages[startIndex - 1].sender === currentMsg.sender &&
            messages[startIndex - 1].isMe === currentMsg.isMe &&
            messages[startIndex - 1].type === currentMsg.type) {
            startIndex--;
        }

        // Find end of group
        while (endIndex < messages.length - 1 &&
            messages[endIndex + 1].sender === currentMsg.sender &&
            messages[endIndex + 1].isMe === currentMsg.isMe &&
            messages[endIndex + 1].type === currentMsg.type) {
            endIndex++;
        }

        return { startIndex, endIndex, lastMessageId: messages[endIndex].id };
    }

    applyFontScale(fontScale) {
        document.documentElement.style.setProperty('--font-scale', fontScale);
    }

    scrollToBottom(messagesEndRef) {
        if (messagesEndRef) {
            messagesEndRef.scrollIntoView({ behavior: 'smooth' });
        }
    }

    createIcons() {
        lucide.createIcons();
    }
}

export default UIRenderer;


