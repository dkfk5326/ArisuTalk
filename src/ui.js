import { renderSidebar } from './components/Sidebar.js';
import { renderMainChat } from './components/MainChat.js';
import { renderSettingsModal } from './components/SettingsModal.js';
import { renderCharacterModal } from './components/CharacterModal.js';
import { renderPromptModal } from './components/PromptModal.js';
import { renderConfirmationModal } from './components/ConfirmationModal.js';

function renderModals(app) {
    const container = document.getElementById('modal-container');
    let html = '';
    if (app.state.showSettingsModal) html += renderSettingsModal(app);
    if (app.state.showCharacterModal) html += renderCharacterModal(app);
    if (app.state.showPromptModal) html += renderPromptModal(app);
    if (app.state.modal.isOpen) html += renderConfirmationModal(app);
    container.innerHTML = html;
}

// --- MAIN RENDER ORCHESTRATOR ---

export function render(app) {
    const oldState = app.oldState || {};
    const newState = app.state;
    const isFirstRender = !app.oldState;

    // 조건부 렌더링으로 불필요한 DOM 업데이트 최소화
    if (isFirstRender || shouldUpdateSidebar(oldState, newState)) {
        renderSidebar(app);
    }

    if (isFirstRender || shouldUpdateMainChat(oldState, newState)) {
        renderMainChat(app);
    }

    if (isFirstRender || shouldUpdateModals(oldState, newState)) {
        renderModals(app);
    }

    lucide.createIcons();
    app.scrollToBottom();
}

// --- 조건부 렌더링 헬퍼 함수 ---

function shouldUpdateSidebar(oldState, newState) {
    return (
        oldState.sidebarCollapsed !== newState.sidebarCollapsed ||
        oldState.searchQuery !== newState.searchQuery ||
        oldState.expandedCharacterId !== newState.expandedCharacterId ||
        JSON.stringify(oldState.characters) !== JSON.stringify(newState.characters) ||
        oldState.selectedChatId !== newState.selectedChatId ||
        JSON.stringify(oldState.unreadCounts) !== JSON.stringify(newState.unreadCounts) ||
        JSON.stringify(oldState.messages) !== JSON.stringify(newState.messages) ||
        JSON.stringify(oldState.chatRooms) !== JSON.stringify(newState.chatRooms)
    );
}

function shouldUpdateMainChat(oldState, newState) {
    return (
        oldState.selectedChatId !== newState.selectedChatId ||
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
    );
}

function shouldUpdateModals(oldState, newState) {
    return (
        oldState.showSettingsModal !== newState.showSettingsModal ||
        oldState.showCharacterModal !== newState.showCharacterModal ||
        oldState.showPromptModal !== newState.showPromptModal ||
        oldState.modal.isOpen !== newState.modal.isOpen ||
        (newState.showSettingsModal && JSON.stringify(oldState.settings) !== JSON.stringify(newState.settings)) ||
        (newState.showCharacterModal && JSON.stringify(oldState.editingCharacter) !== JSON.stringify(newState.editingCharacter)) ||
        (newState.showPromptModal && JSON.stringify(oldState.settings.prompts) !== JSON.stringify(newState.settings.prompts))
    );
}