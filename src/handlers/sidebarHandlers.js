
export function handleSidebarClick(e, app) {
    const toggleSidebar = () => app.setState({ sidebarCollapsed: !app.state.sidebarCollapsed });

    if (e.target.closest('#desktop-sidebar-toggle') || e.target.closest('#mobile-sidebar-toggle')) {
        toggleSidebar();
    }
    if (e.target.closest('#sidebar-backdrop')) {
        app.setState({ sidebarCollapsed: true });
    }
    if (e.target.closest('#open-new-character-modal')) {
        app.openNewCharacterModal();
    }
}

export function handleSidebarInput(e, app) {
    if (e.target.id === 'search-input') {
        app.setState({ searchQuery: e.target.value });
    }
}
