import type { Config } from 'tailwindcss';

export default {
	darkMode: ['class'],
	content: ['./index.html', './src/**/*.{ts,tsx}'],
	theme: {
		extend: {
			fontFamily: {
				sans: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
				mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
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
				// Mission Control palette — used directly by bespoke MC components.
				mc: {
					bg: '#08080B',
					card: '#0B0B0E',
					surface: '#121216',
					raised: '#17171C',
					accent: '#E39A4C',
					'accent-hi': '#F0B26A',
					'accent-lo': '#B96F2E',
					success: '#55C784',
					indexing: '#6E9BE8',
					danger: '#E0604F',
					purple: '#8B7CC9',
					teal: '#5AA9A0',
					amber: '#D9B04C',
					text: '#F2F2F4',
					'text-2': '#A6A6B0',
					'text-3': '#8A8A96',
					muted: '#64646E',
					'muted-2': '#5A5A66',
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
