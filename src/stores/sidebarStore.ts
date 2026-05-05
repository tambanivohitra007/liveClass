import { create } from 'zustand';

interface SidebarState {
  collapsed: boolean;
  toggleSidebar: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: localStorage.getItem('sidebar-collapsed') === 'true',
  toggleSidebar: () =>
    set((state) => {
      const next = !state.collapsed;
      localStorage.setItem('sidebar-collapsed', String(next));
      return { collapsed: next };
    }),
}));
