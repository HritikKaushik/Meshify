import type { Config } from 'tailwindcss';

export default {
	darkMode: ['class'],
	content: ['./index.html', './src/**/*.{ts,tsx}'],
	theme: {
		extend: {
			fontFamily: {
				sans: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
				mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))',
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))',
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))',
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))',
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))',
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))',
				},
				// Meshify light palette — used directly by bespoke components.
				// Actions are Google Blue; "Mesh" (the AI) is indigo. Neutrals run
				// ink → muted on a calm light canvas.
				mc: {
					bg: '#F7F8FB',
					card: '#FFFFFF',
					surface: '#F4F6FA',
					raised: '#EEF1F7',
					accent: '#1A73E8', // Google Blue — primary action / active
					'accent-hi': '#4F8DFB', // lightened blue (hover / on-dark)
					'accent-lo': '#1A56C8', // deep blue (pressed / on-tint text)
					success: '#1E9E6A',
					indexing: '#4F8DFB', // processing / indexing
					danger: '#E5484D',
					purple: '#6366F1', // Indigo — the knowledge node / Mesh identity
					teal: '#1A73E8', // code-file accent (kept blue for cohesion)
					amber: '#E8A33D', // warning
					text: '#12141A',
					'text-2': '#28303F',
					'text-3': '#5A6072',
					muted: '#8A90A0',
					'muted-2': '#9AA0B0',
					// Hairline border tokens (dark-on-light).
					border: 'rgba(16,24,40,0.08)',
					hairline: 'rgba(16,24,40,0.06)',
				},
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
			},
			keyframes: {
				'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
				'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
				meshpulse: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.35' } },
				breathe: { '0%,100%': { opacity: '.55', transform: 'scale(1)' }, '50%': { opacity: '.9', transform: 'scale(1.04)' } },
				beam: { '0%': { transform: 'translateX(-120%)' }, '100%': { transform: 'translateX(320%)' } },
				twinkle: { '0%,100%': { opacity: '.2' }, '50%': { opacity: '.9' } },
				aurora: { '0%,100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
				float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
				// Landing / HeroGeometric motion (design 3a). Kept subtle per the design brief.
				orbit: { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
				rise: { '0%': { opacity: '0', transform: 'translateY(46px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
				textin: { '0%': { opacity: '0', filter: 'blur(14px)', transform: 'translateY(16px)' }, '100%': { opacity: '1', filter: 'blur(0)', transform: 'translateY(0)' } },
				drift: { '0%,100%': { transform: 'translate(0,0)' }, '50%': { transform: 'translate(10px,-22px)' } },
				meteor: { '0%': { transform: 'translate(0,0)', opacity: '0' }, '12%': { opacity: '.9' }, '72%': { opacity: '.9' }, '100%': { transform: 'translate(-360px,360px)', opacity: '0' } },
				lamp: { '0%,100%': { opacity: '.45' }, '50%': { opacity: '.8' } },
				dash: { to: { strokeDashoffset: '-240' } },
				// Subtle route/content transition — a small fade+lift, nothing flashy.
				fade: { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				meshpulse: 'meshpulse 1.6s infinite',
				breathe: 'breathe 2.4s infinite',
				beam: 'beam 3.4s infinite linear',
				twinkle: 'twinkle 3s infinite',
				aurora: 'aurora 6s infinite',
				float: 'float 5s infinite ease-in-out',
				orbit: 'orbit 9s linear infinite',
				rise: 'rise 1.1s cubic-bezier(.22,1,.36,1) both',
				textin: 'textin .9s ease-out both',
				drift: 'drift 10s ease-in-out infinite',
				meteor: 'meteor 7s linear infinite',
				lamp: 'lamp 6s ease-in-out infinite',
				dash: 'dash 9s linear infinite',
				fade: 'fade .22s ease-out both',
			},
		},
	},
	plugins: [require('tailwindcss-animate')],
} satisfies Config;
