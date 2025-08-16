export function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

export function findMessageGroup(messages, targetIndex) {
    if (targetIndex < 0 || targetIndex >= messages.length) {
        return null;
    }

    const targetSender = messages[targetIndex].sender;
    let startIndex = targetIndex;
    let endIndex = targetIndex;

    // Find the start of the group
    while (startIndex > 0 && messages[startIndex - 1].sender === targetSender) {
        startIndex--;
    }

    // Find the end of the group
    while (endIndex < messages.length - 1 && messages[endIndex + 1].sender === targetSender) {
        endIndex++;
    }

    return {
        startIndex,
        endIndex,
        messages: messages.slice(startIndex, endIndex + 1),
    };
}

export function formatDateSeparator(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    return date.toLocaleDateString('ko-KR', options);
}