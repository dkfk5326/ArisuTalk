class EventHandler {
    constructor(app) {
        this.app = app;
    }

    addEventListeners() {
        const appElement = document.getElementById('app');

        appElement.addEventListener('click', (e) => {
            if (e.target.closest('#desktop-sidebar-toggle') || e.target.closest('#mobile-sidebar-toggle')) this.app.toggleSidebar();
            if (e.target.closest('#sidebar-backdrop')) this.app.setState({ sidebarCollapsed: true });

            if (e.target.closest('#open-settings-modal')) this.app.setState({ showSettingsModal: true });
            if (e.target.closest('#close-settings-modal')) this.app.setState({ showSettingsModal: false });
            if (e.target.closest('#save-settings')) this.app.handleSaveSettings();

            if (e.target.closest('#open-prompt-modal')) this.app.setState({ showPromptModal: true });
            if (e.target.closest('#close-prompt-modal')) this.app.setState({ showPromptModal: false });
            if (e.target.closest('#save-prompts')) this.app.handleSavePrompts();

            if (e.target.closest('#open-new-character-modal')) this.app.openNewCharacterModal();
            if (e.target.closest('#close-character-modal')) this.app.closeCharacterModal();
            if (e.target.closest('#save-character')) this.app.handleSaveCharacter();

            if (e.target.tagName === 'SUMMARY') {
                this.app.handleDetailsToggle(e);
            }

            const chatItem = e.target.closest('.character-item');
            if (chatItem) {
                const chatId = parseFloat(chatItem.dataset.id);
                this.app.selectChat(chatId);
            }

            const editCharButton = e.target.closest('.edit-character-btn');
            if (editCharButton) {
                e.stopPropagation();
                const character = this.app.stateManager.getState().characters.find(c => c.id === parseFloat(editCharButton.dataset.id));
                this.app.openEditCharacterModal(character);
            }
            const deleteCharButton = e.target.closest('.delete-character-btn');
            if (deleteCharButton) {
                e.stopPropagation();
                this.app.handleDeleteCharacter(parseFloat(deleteCharButton.dataset.id));
            }

            if (e.target.closest('#open-input-options-btn')) {
                this.app.setState({ showInputOptions: !this.app.stateManager.getState().showInputOptions });
            }
            if (e.target.closest('#open-image-upload')) {
                document.getElementById('image-upload-input').click();
            }
            if (e.target.closest('#cancel-image-preview')) {
                this.app.setState({ imageToSend: null });
            }

            if (e.target.closest('#modal-cancel')) this.app.closeModal();
            if (e.target.closest('#modal-confirm')) {
                if (this.app.stateManager.getState().modal.onConfirm) this.app.stateManager.getState().modal.onConfirm();
                this.app.closeModal();
            }
            if (e.target.closest('#select-avatar-btn')) document.getElementById('avatar-input').click();
            if (e.target.closest('#load-card-btn')) document.getElementById('card-input').click();
            if (e.target.closest('#save-card-btn')) this.app.handleSaveCharacterToImage();

            const deleteMsgButton = e.target.closest('.delete-msg-btn');
            if (deleteMsgButton) this.app.handleDeleteMessage(parseFloat(deleteMsgButton.dataset.id));

            const editMsgButton = e.target.closest('.edit-msg-btn');
            if (editMsgButton) this.app.handleEditMessage(parseFloat(editMsgButton.dataset.id));

            const rerollMsgButton = e.target.closest('.reroll-msg-btn');
            if (rerollMsgButton) this.app.handleRerollMessage(parseFloat(rerollMsgButton.dataset.id));

            const saveEditButton = e.target.closest('.save-edit-btn');
            if (saveEditButton) this.app.handleSaveEditedMessage(parseFloat(saveEditButton.dataset.id));

            const cancelEditButton = e.target.closest('.cancel-edit-btn');
            if (cancelEditButton) this.app.setState({ editingMessageId: null });

            if (e.target.closest('#add-memory-btn')) this.app.addMemoryField();
            const deleteMemoryBtn = e.target.closest('.delete-memory-btn');
            if (deleteMemoryBtn) {
                deleteMemoryBtn.closest('.memory-item').remove();
            }

            if (e.target.closest('#backup-data-btn')) this.app.handleBackup();
            if (e.target.closest('#restore-data-btn')) document.getElementById('restore-file-input').click();
            if (e.target.closest('#backup-prompts-btn')) this.app.handleBackupPrompts();
            if (e.target.closest('#restore-prompts-btn')) document.getElementById('restore-prompts-input').click();
        });

        appElement.addEventListener('input', (e) => {
            if (e.target.id === 'search-input') {
                this.app.setState({ searchQuery: e.target.value });
            }
            if (e.target.id === 'new-message-input') {
                const message = e.target.value;
                e.target.style.height = 'auto';
                e.target.style.height = (e.target.scrollHeight) + 'px';

                const sendButton = document.getElementById('send-message-btn');
                if (sendButton) {
                    const hasText = message.trim() !== '';
                    const hasImage = !!this.app.stateManager.getState().imageToSend;
                    sendButton.disabled = (!hasText && !hasImage) || this.app.stateManager.getState().isWaitingForResponse;
                }
            }
            if (e.target.id === 'settings-font-scale') {
                this.app.setState({ settings: { ...this.app.stateManager.getState().settings, fontScale: parseFloat(e.target.value) } });
            }
            if (e.target.id === 'settings-random-character-count') {
                const count = e.target.value;
                const label = document.getElementById('random-character-count-label');
                if (label) label.textContent = `${count}명`;
            }
        });

        appElement.addEventListener('change', (e) => {
            if (e.target.id === 'image-upload-input') {
                this.app.handleImageFileSelect(e);
            }
            if (e.target.id === 'avatar-input') {
                this.app.handleAvatarChange(e, false);
            }
            if (e.target.id === 'card-input') {
                this.app.handleAvatarChange(e, true);
            }
            if (e.target.id === 'settings-random-first-message-toggle') {
                const optionsDiv = document.getElementById('random-chat-options');
                if (optionsDiv) optionsDiv.style.display = e.target.checked ? 'block' : 'none';
            }
            if (e.target.id === 'restore-file-input') this.app.handleRestore(e);
            if (e.target.id === 'restore-prompts-input') this.app.handleRestorePrompts(e);
        });

        appElement.addEventListener('keypress', (e) => {
            if (e.target.id === 'new-message-input' && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const sendButton = document.getElementById('send-message-btn');
                if (sendButton && !sendButton.disabled) sendButton.click();
            }
            if (e.target.classList.contains('edit-message-textarea') && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.app.handleSaveEditedMessage(parseFloat(e.target.dataset.id));
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.input-area-container')) {
                this.app.setState({ showInputOptions: false });
            }
        });
    }
}

export default EventHandler;


