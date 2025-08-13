import { language } from "./language.js";

export const showInfoModal = (setState, title, message) => {
    setState({ modal: { isOpen: true, title, message, onConfirm: null } });
};

export const showConfirmModal = (setState, title, message, onConfirm) => {
    setState({ modal: { isOpen: true, title, message, onConfirm } });
};

export const closeModal = (setState) => {
    setState({ modal: { isOpen: false, title: '', message: '', onConfirm: null } });
};
