import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'meshify.theme';

type ThemeContextValue = {
	theme: Theme;
	setTheme: (t: Theme) => void;
	toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Reads the theme the pre-paint boot script (in index.html) already applied. */
function initialTheme(): Theme {
	if (typeof document !== 'undefined' && document.documentElement.classList.contains('light')) return 'light';
	try {
		return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
	} catch {
		return 'dark';
	}
}

function applyTheme(theme: Theme) {
	const root = document.documentElement;
	root.classList.toggle('light', theme === 'light');
	root.classList.toggle('dark', theme === 'dark');
	root.style.colorScheme = theme;
	// Keep the browser UI (address bar / notch) in sync.
	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute('content', theme === 'light' ? '#fbfbfd' : '#111114');
}

/**
 * Dark-first theme provider. The boot script in index.html sets the class before
 * first paint (no flash); this keeps React state, `localStorage`, and the DOM in
 * sync and exposes `useTheme()`.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setThemeState] = useState<Theme>(initialTheme);

	useEffect(() => {
		applyTheme(theme);
		try {
			localStorage.setItem(STORAGE_KEY, theme);
		} catch {
			/* ignore */
		}
	}, [theme]);

	const setTheme = useCallback((t: Theme) => setThemeState(t), []);
	const toggle = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), []);

	const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);
	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
	const ctx = useContext(ThemeContext);
	if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
	return ctx;
}
