import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DrawerTab = 'params' | 'monitor' | 'slots' | 'library' | 'help' | 'settings';

/** What the Library tab shows next, for a ⌘S that needs the user: Save As, or why the save failed. */
export type LibraryRequest = { kind: 'saveAs' } | { kind: 'error'; message: string };

type LayoutStore = {
  drawerOpen: boolean;
  drawerTab: DrawerTab;
  toggleDrawer(): void;
  closeDrawer(): void;
  /** Shows a Data drawer tab, opening the drawer if needed. */
  showTab(tab: DrawerTab): void;
  /** Opens the drawer on Help, or closes it if Help is already showing (the ? shortcut). */
  toggleHelp(): void;
  libraryRequest: LibraryRequest | null;
  /** Shows the Library tab with Save As open, or an error. */
  requestLibrary(request: LibraryRequest): void;
  clearLibraryRequest(): void;
};

/** Panel layout, kept between sessions (SPEC.md §5.11). */
export const useLayoutStore = create<LayoutStore>()(
  persist(
    (set) => ({
      drawerOpen: false,
      drawerTab: 'params',
      toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
      closeDrawer: () => set({ drawerOpen: false }),
      showTab: (drawerTab) => set({ drawerTab, drawerOpen: true }),
      toggleHelp: () =>
        set((s) => (s.drawerOpen && s.drawerTab === 'help' ? { drawerOpen: false } : { drawerTab: 'help', drawerOpen: true })),
      libraryRequest: null,
      requestLibrary: (libraryRequest) => set({ libraryRequest, drawerTab: 'library', drawerOpen: true }),
      clearLibraryRequest: () => set({ libraryRequest: null }),
    }),
    {
      name: 'clean-layout',
      partialize: ({ drawerOpen, drawerTab }) => ({ drawerOpen, drawerTab }),
    },
  ),
);
