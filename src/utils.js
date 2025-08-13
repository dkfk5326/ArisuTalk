export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function formatDateSeparator(date) {
    return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
    }).format(date);
}


export function findMessageGroup(messages, index) {
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
