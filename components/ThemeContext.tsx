'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeColors = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarBorder: string;
  sidebarAccent: string;
  themeBox: string;
  themeBoxForeground: string;
  themeBoxBorder: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
};

export const defaultTheme: ThemeColors = {
  background: '#0a0a0f',
  foreground: '#e0f2fe',
  card: '#111118',
  cardForeground: '#e0f2fe',
  popover: '#111118',
  popoverForeground: '#e0f2fe',
  primary: '#0ea5e9',
  primaryForeground: '#000000',
  secondary: '#1e293b',
  secondaryForeground: '#f8fafc',
  muted: '#1e293b',
  mutedForeground: '#94a3b8',
  accent: '#1e293b',
  accentForeground: '#f8fafc',
  destructive: '#ef4444',
  destructiveForeground: '#f8fafc',
  border: '#1e293b',
  input: '#1e293b',
  ring: '#0ea5e9',
  sidebar: '#0f172a',
  sidebarForeground: '#f8fafc',
  sidebarBorder: '#1e293b',
  sidebarAccent: '#1e293b',
  themeBox: '#15171b',
  themeBoxForeground: '#e0f2fe',
  themeBoxBorder: '#1e293b',
  chart1: '#0ea5e9',
  chart2: '#22c55e',
  chart3: '#eab308',
  chart4: '#f97316',
  chart5: '#ef4444',
};

export const purpleTheme: ThemeColors = { ...defaultTheme,
  background: '#0a0514',
  foreground: '#f3e8ff',
  card: '#130a2a',
  cardForeground: '#f3e8ff',
  primary: '#9333ea',
  primaryForeground: '#ffffff',
  secondary: '#2e1065',
  secondaryForeground: '#f3e8ff',
  muted: '#2e1065',
  mutedForeground: '#d8b4fe',
  accent: '#2e1065',
  accentForeground: '#f3e8ff',
  border: '#3b0764',
  input: '#3b0764',
  ring: '#9333ea',
  sidebar: '#1b0b3b',
  sidebarBorder: '#3b0764',
};

export const emeraldTheme: ThemeColors = { ...defaultTheme,
  background: '#021008',
  foreground: '#d1fae5',
  card: '#062013',
  cardForeground: '#d1fae5',
  primary: '#10b981',
  primaryForeground: '#ffffff',
  secondary: '#064e3b',
  secondaryForeground: '#d1fae5',
  muted: '#064e3b',
  mutedForeground: '#6ee7b7',
  accent: '#064e3b',
  accentForeground: '#d1fae5',
  border: '#022c22',
  input: '#022c22',
  ring: '#10b981',
  sidebar: '#041c11',
  sidebarBorder: '#022c22',
};

export type ComponentStyle = {
  background?: string;
  color?: string;
};

interface ThemeContextValue {
  theme: ThemeColors;
  setTheme: (theme: ThemeColors) => void;
  activePreset: string;
  setActivePreset: (preset: string) => void;
  componentStyles: Record<string, ComponentStyle>;
  setComponentStyles: (styles: Record<string, ComponentStyle>) => void;
  updateComponentStyle: (selector: string, style: ComponentStyle) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeColors>(defaultTheme);
  const [activePreset, setActivePreset] = useState('default');
  const [componentStyles, setComponentStyles] = useState<Record<string, ComponentStyle>>({});

  useEffect(() => {
    const savedTheme = localStorage.getItem('omnisync-theme');
    const savedPreset = localStorage.getItem('omnisync-preset');
    const savedComponentStyles = localStorage.getItem('omnisync-component-styles');
    
    if (savedTheme) {
      try {
        const parsed = JSON.parse(savedTheme);
        // Ensure backward compatibility if they have old theme format
        queueMicrotask(() => setTheme({ ...defaultTheme, ...parsed }));
      } catch (e) {
        queueMicrotask(() => setTheme(defaultTheme));
      }
    }
    if (savedPreset) setActivePreset(savedPreset);
    if (savedComponentStyles) {
      try {
        setComponentStyles(JSON.parse(savedComponentStyles));
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    // Map our theme object to CSS variables
    Object.entries(theme).forEach(([key, value]) => {
      // e.g. "cardForeground" -> "--theme-card-foreground"
      const cssVarName = `--theme-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      root.style.setProperty(cssVarName, value);
    });
    
    localStorage.setItem('omnisync-theme', JSON.stringify(theme));
    localStorage.setItem('omnisync-preset', activePreset);
  }, [theme, activePreset]);

  useEffect(() => {
    localStorage.setItem('omnisync-component-styles', JSON.stringify(componentStyles));
  }, [componentStyles]);

  const updateComponentStyle = (selector: string, style: ComponentStyle) => {
    setComponentStyles(prev => {
      const updated = { ...prev };
      if (!updated[selector]) updated[selector] = {};
      updated[selector] = { ...updated[selector], ...style };
      return updated;
    });
  };

  // Generate CSS string for custom component styles
  const generatedCss = Object.entries(componentStyles).map(([selector, style]) => {
    let rules = '';
    if (style.background) rules += `background-color: ${style.background} !important;\n`;
    if (style.color) rules += `color: ${style.color} !important;\n`;
    if (!rules) return '';
    return `${selector} {\n${rules}}\n`;
  }).join('\n');

  return (
    <ThemeContext.Provider value={{ theme, setTheme, activePreset, setActivePreset, componentStyles, setComponentStyles, updateComponentStyle }}>
      <style dangerouslySetInnerHTML={{ __html: generatedCss }} />
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
