/** @type {import('tailwindcss').Config} */

// Tremor design tokens (Tremor v3 uses Tailwind utility classes; this preset
// defines the `tremor-*` / `dark-tremor-*` colors, radii, shadows and font sizes
// that @tremor/react components rely on).
const tremorTokens = {
  colors: {
    // Brand (default: blue) — light
    "tremor-brand": "#3b82f6",
    "tremor-brand-emphasis": "#2563eb",
    "tremor-brand-faint": "#eff6ff",
    "tremor-brand-muted": "#bfdbfe",
    "tremor-brand-subtle": "#93c5fd",
    "tremor-brand-inverted": "#ffffff",
    // Brand — dark
    "dark-tremor-brand": "#3b82f6",
    "dark-tremor-brand-emphasis": "#60a5fa",
    "dark-tremor-brand-faint": "#1e293b",
    "dark-tremor-brand-muted": "#1d4ed8",
    "dark-tremor-brand-subtle": "#1e3a8a",
    "dark-tremor-brand-inverted": "#020617",
    // Background — light
    "tremor-background": "#ffffff",
    "tremor-background-emphasis": "#0f172a",
    "tremor-background-muted": "#f1f5f9",
    "tremor-background-subtle": "#f8fafc",
    // Background — dark
    "dark-tremor-background": "#0f172a",
    "dark-tremor-background-emphasis": "#020617",
    "dark-tremor-background-muted": "#1e293b",
    "dark-tremor-background-subtle": "#1e293b",
    // Content (text) — light
    "tremor-content": "#64748b",
    "tremor-content-default": "#64748b",
    "tremor-content-emphasis": "#334155",
    "tremor-content-strong": "#0f172a",
    "tremor-content-subtle": "#94a3b8",
    "tremor-content-inverted": "#ffffff",
    // Content — dark
    "dark-tremor-content": "#94a3b8",
    "dark-tremor-content-default": "#94a3b8",
    "dark-tremor-content-emphasis": "#cbd5e1",
    "dark-tremor-content-strong": "#f8fafc",
    "dark-tremor-content-subtle": "#64748b",
    "dark-tremor-content-inverted": "#0f172a",
    // Border — light
    "tremor-border": "#e2e8f0",
    "dark-tremor-border": "#1e293b",
    // Ring — light
    "tremor-ring": "#cbd5e1",
    "dark-tremor-ring": "#334155",
    // Subtle — light & dark
    "tremor-subtle": "#e2e8f0",
    "dark-tremor-subtle": "#1e293b",
  },
  borderRadius: {
    "tremor-small": "0.375rem",
    "tremor-default": "0.5rem",
    "tremor-full": "9999px",
  },
  fontSize: {
    "tremor-default": ["0.875rem", "1.25rem"],
    "tremor-title": ["1.125rem", "1.75rem"],
    "tremor-metric": ["1.875rem", "2.25rem"],
  },
  boxShadow: {
    "tremor-card": "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    "tremor-input": "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    "tremor-dropdown": "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
    "dark-tremor-card": "0 1px 2px 0 rgba(0, 0, 0, 0.25)",
    "dark-tremor-input": "0 1px 2px 0 rgba(0, 0, 0, 0.25)",
    "dark-tremor-dropdown": "0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)",
  },
};

module.exports = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@tremor/react/dist/**/*.js",
  ],
  theme: {
    extend: {
      // Original shadcn-style tokens (kept so any residual classes still work).
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        ...tremorTokens.colors,
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        ...tremorTokens.borderRadius,
      },
      fontSize: tremorTokens.fontSize,
      boxShadow: tremorTokens.boxShadow,
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-in": { from: { transform: "translateX(-10px)", opacity: "0" }, to: { transform: "translateX(0)", opacity: "1" } },
      },
      animation: { "fade-in": "fade-in 0.2s", "slide-in": "slide-in 0.3s" },
    },
  },
  plugins: [require("tailwindcss-animate")],
};