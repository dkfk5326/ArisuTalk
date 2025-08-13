

export function showInfoModal(setState, title, message) {
    setState({ modal: { isOpen: true, title, message, onConfirm: null } });
}

export function showConfirmModal(setState, title, message, onConfirm) {
    setState({ modal: { isOpen: true, title, message, onConfirm } });
}

export function closeModal(setState) {
    setState({ modal: { isOpen: false, title: '', message: '', onConfirm: null } });
}
