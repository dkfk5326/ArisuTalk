
export function handleModalClick(e, app) {
    // Settings Modal
    if (e.target.closest('#open-settings-modal')) app.openSettingsModal();
    if (e.target.closest('#close-settings-modal')) app.handleCancelSettings();
    if (e.target.closest('#save-settings')) app.handleSaveSettings();

    // Prompt Modal
    if (e.target.closest('#open-prompt-modal')) app.setState({ showPromptModal: true });
    if (e.target.closest('#close-prompt-modal')) app.setState({ showPromptModal: false });
    if (e.target.closest('#save-prompts')) app.handleSavePrompts();

    // Character Modal
    if (e.target.closest('#close-character-modal')) app.closeCharacterModal();
    if (e.target.closest('#save-character')) app.handleSaveCharacter();
    if (e.target.closest('#select-avatar-btn')) document.getElementById('avatar-input').click();
    if (e.target.closest('#load-card-btn')) document.getElementById('card-input').click();
    if (e.target.closest('#save-card-btn')) app.handleSaveCharacterToImage();
    if (e.target.closest('#add-memory-btn')) app.addMemoryField();
    if (e.target.closest('#add-sticker-btn')) document.getElementById('sticker-input').click();
    if (e.target.closest('#toggle-sticker-selection')) app.toggleStickerSelectionMode();
    if (e.target.closest('#select-all-stickers')) app.handleSelectAllStickers();
    if (e.target.closest('#delete-selected-stickers')) app.handleDeleteSelectedStickers();
    const deleteMemoryBtn = e.target.closest('.delete-memory-btn');
    if (deleteMemoryBtn) deleteMemoryBtn.closest('.memory-item').remove();
    const deleteStickerBtn = e.target.closest('.delete-sticker-btn');
    if (deleteStickerBtn) app.handleDeleteSticker(parseInt(deleteStickerBtn.dataset.index));
    const editStickerNameBtn = e.target.closest('.edit-sticker-name-btn');
    if (editStickerNameBtn) app.handleEditStickerName(parseInt(editStickerNameBtn.dataset.index));

    // Confirmation Modal
    if (e.target.closest('#modal-cancel')) app.closeModal();
    if (e.target.closest('#modal-confirm')) {
        if (app.state.modal.onConfirm) app.state.modal.onConfirm();
    }

    // User Sticker Panel
    if (e.target.closest('#add-user-sticker-btn')) document.getElementById('user-sticker-input').click();
    if (e.target.closest('#delete-selected-stickers')) app.handleDeleteSelectedStickers();

    // Data Management
    if (e.target.closest('#backup-data-btn')) app.handleBackup();
    if (e.target.closest('#restore-data-btn')) document.getElementById('restore-file-input').click();
    if (e.target.closest('#backup-prompts-btn')) app.handleBackupPrompts();
    if (e.target.closest('#restore-prompts-btn')) document.getElementById('restore-prompts-input').click();

    const restoreSnapshotBtn = e.target.closest('.restore-snapshot-btn');
    if (restoreSnapshotBtn) {
        const timestamp = Number(restoreSnapshotBtn.dataset.timestamp);
        app.handleRestoreSnapshot(timestamp);
    }

    const deleteSnapshotBtn = e.target.closest('.delete-snapshot-btn');
    if (deleteSnapshotBtn) {
        const timestamp = Number(deleteSnapshotBtn.dataset.timestamp);
        app.handleDeleteSnapshot(timestamp);
    }
}

export function handleModalInput(e, app) {
    if (e.target.id === 'settings-font-scale') {
        const newScale = parseFloat(e.target.value);
        if (app.state.settings.fontScale !== newScale) {
            app.setState({ settings: { ...app.state.settings, fontScale: newScale } });
        }
    } else if (e.target.id === 'settings-api-key') {
        app.setState({ settings: { ...app.state.settings, apiKey: e.target.value } });
    } else if (e.target.id === 'settings-user-name') {
        app.setState({ settings: { ...app.state.settings, userName: e.target.value } });
    } else if (e.target.id === 'settings-user-desc') {
        app.setState({ settings: { ...app.state.settings, userDescription: e.target.value } });
    } else if (e.target.id === 'settings-proactive-toggle') {
        app.setState({ settings: { ...app.state.settings, proactiveChatEnabled: e.target.checked } });
    } else if (e.target.id === 'settings-random-first-message-toggle') {
        app.setState({ settings: { ...app.state.settings, randomFirstMessageEnabled: e.target.checked } });
    } else if (e.target.id === 'settings-random-character-count') {
        app.setState({ settings: { ...app.state.settings, randomCharacterCount: parseInt(e.target.value, 10) } });
    } else if (e.target.id === 'settings-random-frequency-min') {
        app.setState({ settings: { ...app.state.settings, randomMessageFrequencyMin: parseInt(e.target.value, 10) } });
    } else if (e.target.id === 'settings-random-frequency-max') {
        app.setState({ settings: { ...app.state.settings, randomMessageFrequencyMax: parseInt(e.target.value, 10) } });
    }
    if (e.target.id === 'settings-random-character-count') {
        const count = e.target.value;
        const label = document.getElementById('random-character-count-label');
        if (label) label.textContent = `${count}명`;
    }
}

export function handleModalChange(e, app) {
    if (e.target.id === 'avatar-input') app.handleAvatarChange(e, false);
    if (e.target.id === 'card-input') app.handleAvatarChange(e, true);
    if (e.target.id === 'sticker-input') app.handleStickerFileSelect(e);
    if (e.target.id === 'user-sticker-input') app.handleUserStickerFileSelect(e);
    if (e.target.id === 'settings-random-first-message-toggle') {
        const optionsDiv = document.getElementById('random-chat-options');
        if (optionsDiv) optionsDiv.style.display = e.target.checked ? 'block' : 'none';
    }
    if (e.target.id === 'restore-file-input') app.handleRestore(e);
    if (e.target.id === 'restore-prompts-input') app.handleRestorePrompts(e);
    if (e.target.id === 'settings-snapshots-toggle') {
        const optionsDiv = document.getElementById('snapshots-list');
        if (optionsDiv) optionsDiv.style.display = e.target.checked ? 'block' : 'none';
        app.handleToggleSnapshots(e.target.checked);
    }
}
