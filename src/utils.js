import { language } from "./language.js";

export function applyFontScale(fontScale) {
    document.documentElement.style.setProperty("--font-scale", fontScale);
}

export function scrollToBottom(messagesEndRef) {
    if (messagesEndRef) {
        messagesEndRef.scrollIntoView({ behavior: "smooth" });
    }
}

export function createIcons() {
    lucide.createIcons();
}

export function formatDateSeparator(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return language.date.today;
    } else if (date.toDateString() === yesterday.toDateString()) {
        return language.date.yesterday;
    } else {
        return date.toLocaleDateString(language.locale, { year: "numeric", month: "long", day: "numeric" });
    }
}

export function findMessageGroup(messages, currentIndex) {
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

export function generateUniqueId() {
    return Date.now();
}

export function resizeImage(file, maxWidth, maxHeight) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = height * (maxWidth / width);
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = width * (maxHeight / height);
                    height = maxHeight;
                }

                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL(file.type));
            };
        };
        reader.readAsDataURL(file);
    });
}

export function dataURLtoBlob(dataurl) {
    const arr = dataurl.split(","), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[arr.length - 1]), n = bstr.length, u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

export function showInfoModal(title, message) {
    const modalContainer = document.getElementById("modal-container");
    modalContainer.innerHTML = `
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div class="bg-gray-800 rounded-2xl w-full max-w-sm mx-4 p-6 space-y-4 text-center relative">
                <h3 class="text-lg font-semibold text-white">${title}</h3>
                <p class="text-gray-300 text-sm">${message}</p>
                <div class="flex justify-center">
                    <button id="modal-cancel" class="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium">확인</button>
                </div>
            </div>
        </div>
    `;
}

export function showConfirmationModal(title, message, onConfirm) {
    const modalContainer = document.getElementById("modal-container");
    modalContainer.innerHTML = `
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div class="bg-gray-800 rounded-2xl w-full max-w-sm mx-4 p-6 space-y-4 text-center relative">
                <h3 class="text-lg font-semibold text-white">${title}</h3>
                <p class="text-gray-300 text-sm">${message}</p>
                <div class="flex justify-center space-x-4">
                    <button id="modal-cancel" class="py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm font-medium">취소</button>
                    <button id="modal-confirm" class="py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium">확인</button>
                </div>
            </div>
        </div>
    `;
    document.getElementById("modal-confirm").onclick = onConfirm;
    document.getElementById("modal-cancel").onclick = () => closeModal();
}

export function closeModal() {
    document.getElementById("modal-container").innerHTML = "";
}

export function handleDetailsToggle(e) {
    const details = e.target.closest("details");
    if (details) {
        details.open = !details.open;
    }
}


