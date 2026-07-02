// Transient, app-level UI state that isn't tied to the open document or vault.

class UiState {
  /** Whether the Preferences modal is open. */
  preferencesOpen = $state(false);

  openPreferences() {
    this.preferencesOpen = true;
  }
  closePreferences() {
    this.preferencesOpen = false;
  }
}

export const ui = new UiState();
