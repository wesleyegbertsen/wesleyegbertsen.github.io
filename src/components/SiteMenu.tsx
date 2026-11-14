import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { navItems, type NavItem } from '../data/navigation.ts';
import { useMediaQuery } from '../hooks/useMediaQuery.ts';
import styles from './SiteMenu.module.css';

const COLLAPSE_QUERY = '(max-width: 700px)';
const LIST_ID = 'site-menu-list';

function Links({ items, onChoose }: { items: NavItem[]; onChoose?: () => void }) {
  return (
    <ul id={LIST_ID} className={styles.list}>
      {items.map((item) => (
        <li key={item.id}>
          <NavLink to={item.to} end={item.to === '/'} className={styles.link} onClick={onChoose}>
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * The left-hand page menu: a stacked terminal-style list on wide screens, a
 * "Menu" button that opens the same list on narrow ones.
 */
export function SiteMenu({ items = navItems }: { items?: NavItem[] }) {
  const collapsed = useMediaQuery(COLLAPSE_QUERY);
  const { pathname } = useLocation();
  // Remember the page the menu was opened on: moving to another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = collapsed && openOn === pathname;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    wrapRef.current?.querySelector('a')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpenOn(null);
      toggleRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      // The toggle opens and closes the menu itself.
      if (wrapRef.current?.contains(target) || toggleRef.current?.contains(target)) return;
      setOpenOn(null);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  if (!collapsed) {
    return (
      <nav className={styles.menu} aria-label="Site">
        <Links items={items} />
      </nav>
    );
  }

  return (
    <nav className={styles.collapsed} aria-label="Site">
      <button
        ref={toggleRef}
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={open ? LIST_ID : undefined}
        onClick={() => setOpenOn(open ? null : pathname)}
      >
        Menu
      </button>
      {open && (
        <div ref={wrapRef} className={styles.overlay}>
          {/* Choosing any link closes the menu, even the page already shown, and the chosen link is about to unmount. */}
          <Links
            items={items}
            onChoose={() => {
              setOpenOn(null);
              toggleRef.current?.focus();
            }}
          />
        </div>
      )}
    </nav>
  );
}
