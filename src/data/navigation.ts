export type NavItem = {
  id: string;
  label: string;
  /** Route path, relative to the hash router. */
  to: string;
};

/** The site menu, top to bottom. Add a line here to add a menu item. */
export const navItems: NavItem[] = [
  { id: 'home', label: 'Home', to: '/' },
  { id: 'projects', label: 'Projects', to: '/projects' },
];
