import React, { useState, useMemo } from 'react';
import { useTheme, defaultTheme, purpleTheme, emeraldTheme, ThemeColors } from './ThemeContext';
import { Palette, X, MousePointer2, ChevronDown, ChevronRight, Download, Upload, RotateCcw } from 'lucide-react';
import { ThemeInspector } from './ThemeInspector';

type Category = {
  id: string;
  name: string;
  keys: { key: keyof ThemeColors; label: string }[];
};

const CATEGORIES: Category[] = [
  { id: 'base', name: 'Base', keys: [{ key: 'background', label: 'Background' }, { key: 'foreground', label: 'Foreground' }] },
  { id: 'sidebar', name: 'Sidebar', keys: [{ key: 'sidebar', label: 'Sidebar Background' }, { key: 'sidebarForeground', label: 'Sidebar Text' }, { key: 'sidebarBorder', label: 'Sidebar Border' }] },
  { id: 'themeBox', name: 'Theme Box', keys: [{ key: 'themeBox', label: 'Theme Box Background' }, { key: 'themeBoxForeground', label: 'Theme Box Text' }, { key: 'themeBoxBorder', label: 'Theme Box Border' }] },
  { id: 'cards', name: 'Cards', keys: [{ key: 'card', label: 'Card Background' }, { key: 'cardForeground', label: 'Card Text' }] },
  { id: 'primary', name: 'Primary', keys: [{ key: 'primary', label: 'Primary Background' }, { key: 'primaryForeground', label: 'Primary Text' }] },
  { id: 'destructive', name: 'Destructive', keys: [{ key: 'destructive', label: 'Destructive Background' }, { key: 'destructiveForeground', label: 'Destructive Text' }] },
  { id: 'borders', name: 'Borders & Inputs', keys: [{ key: 'border', label: 'Border' }, { key: 'input', label: 'Input' }] },
];

export function ThemeSidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { theme, setTheme, activePreset, setActivePreset, componentStyles, updateComponentStyle, setComponentStyles } = useTheme();
  
  const [isInspectorActive, setIsInspectorActive] = useState(false);
  const [selectedSelector, setSelectedSelector] = useState<string | null>(null);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({ base: true });

  const handleThemeChange = (key: keyof ThemeColors, value: string) => {
    setActivePreset('custom');
    setTheme({ ...theme, [key]: value });
  };

  const handleElementSelected = (selector: string) => {
    setSelectedSelector(selector);
    setIsInspectorActive(false);
  };

  const toggleCategory = (id: string) => setOpenCategories(prev => ({ ...prev, [id]: !prev[id] }));

  const getOverridesCount = (cat: Category) => {
    return cat.keys.filter(k => theme[k.key] !== defaultTheme[k.key]).length;
  };

  const totalOverrides = useMemo(() => {
    let count = 0;
    (Object.keys(defaultTheme) as Array<keyof ThemeColors>).forEach(k => {
      if (theme[k] !== defaultTheme[k]) count++;
    });
    return count + Object.keys(componentStyles).length;
  }, [theme, componentStyles]);

  const handleReset = () => {
    setTheme(defaultTheme);
    setActivePreset('default');
    setComponentStyles({});
  };

  const handleExport = () => {
    const data = JSON.stringify({ theme, componentStyles }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cloudsync-theme.json';
    a.click();
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target?.result as string);
          if (parsed.theme) setTheme({ ...defaultTheme, ...parsed.theme });
          if (parsed.componentStyles) setComponentStyles(parsed.componentStyles);
          setActivePreset('custom');
        } catch (err) {
          alert("Invalid theme file.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  if (!isOpen) return null;

  return (
    <>
      <ThemeInspector isActive={isInspectorActive} onSelect={handleElementSelected} />
      
      <aside className="w-[360px] border-l border-theme-box-border bg-theme-box text-theme-box-foreground flex flex-col h-full relative z-20 shadow-2xl transition-all theme-sidebar">
        <div className="p-5 border-b border-theme-box-border flex items-start justify-between bg-theme-box">
          <div>
            <h3 className="font-semibold flex items-center gap-2 text-lg">
              <Palette size={18} className="text-primary" />
              Theme Box
            </h3>
            <p className="text-xs opacity-70 mt-1">Customize every color in the app. Changes apply instantly and persist.</p>
          </div>
          <button onClick={onClose} className="p-2 opacity-50 hover:opacity-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-8 scrollbar-thin scrollbar-thumb-neutral-700">
          
          <button 
            onClick={() => {
              setIsInspectorActive(!isInspectorActive);
              if (!isInspectorActive) setSelectedSelector(null);
            }}
            className={`w-full py-3 px-4 rounded-xl border flex items-center justify-center gap-2 transition-all font-medium text-sm ${
              isInspectorActive 
                ? 'border-primary bg-primary/20 text-primary shadow-[0_0_15px_rgba(59,130,246,0.3)]' 
                : 'border-border bg-card hover:border-neutral-500'
            }`}
          >
            <MousePointer2 size={16} className={isInspectorActive ? 'animate-pulse text-primary' : ''} />
            {isInspectorActive ? 'Select an element...' : 'Pick Element from Screen'}
          </button>

          <section>
            <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
              ✨ QUICK PRESETS
            </h4>
            <div className="grid grid-cols-3 gap-2">
              <PresetButton name="Ocean" colors={['#0ea5e9', '#38bdf8', '#0284c7']} onClick={() => { setActivePreset('default'); setTheme(defaultTheme); }} />
              <PresetButton name="Purple" colors={['#9333ea', '#c084fc', '#7e22ce']} onClick={() => { setActivePreset('purple'); setTheme(purpleTheme); }} />
              <PresetButton name="Emerald" colors={['#10b981', '#34d399', '#059669']} onClick={() => { setActivePreset('emerald'); setTheme(emeraldTheme); }} />
            </div>
          </section>

          {selectedSelector && (
            <section className="bg-primary/10 border border-primary/20 p-4 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-primary uppercase tracking-wider">Selected Component</h4>
                <button onClick={() => setSelectedSelector(null)} className="opacity-50 hover:opacity-100">
                  <X size={14} />
                </button>
              </div>
              
              <div className="text-[10px] font-mono opacity-70 bg-black/20 p-2 rounded mb-4 overflow-x-auto whitespace-nowrap border border-white/5">
                {selectedSelector}
              </div>

              <div className="space-y-4">
                <ColorPickerRow 
                  label="Background Color" 
                  value={componentStyles[selectedSelector]?.background || ''} 
                  onChange={(v) => updateComponentStyle(selectedSelector, { background: v })} 
                  allowClear
                />
                <ColorPickerRow 
                  label="Text Color" 
                  value={componentStyles[selectedSelector]?.color || ''} 
                  onChange={(v) => updateComponentStyle(selectedSelector, { color: v })} 
                  allowClear
                />
              </div>
            </section>
          )}

          <section>
            <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-4">ALL COLORS</h4>
            <div className="space-y-2">
              {CATEGORIES.map(cat => {
                const isOpen = openCategories[cat.id];
                const overrides = getOverridesCount(cat);
                
                return (
                  <div key={cat.id} className="border border-border rounded-lg overflow-hidden bg-card">
                    <button 
                      onClick={() => toggleCategory(cat.id)}
                      className="w-full p-3 flex items-center justify-between hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {isOpen ? <ChevronDown size={16} className="text-primary" /> : <ChevronRight size={16} className="opacity-50" />}
                        {cat.name}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-1">
                          {cat.keys.slice(0,2).map(k => (
                            <div key={k.key} className="w-4 h-4 rounded-full border border-border shadow-sm" style={{ backgroundColor: theme[k.key] }} />
                          ))}
                        </div>
                        {overrides > 0 && (
                          <span className="bg-primary/20 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                            {overrides}
                          </span>
                        )}
                      </div>
                    </button>
                    
                    {isOpen && (
                      <div className="p-3 pt-0 space-y-3 bg-black/10 border-t border-border">
                        <div className="h-2"></div>
                        {cat.keys.map(k => (
                          <ColorPickerRow 
                            key={k.key}
                            label={k.label} 
                            value={theme[k.key]} 
                            onChange={(v) => handleThemeChange(k.key, v)} 
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="p-4 border-t border-theme-box-border bg-theme-box flex flex-col gap-3">
          <div className="flex gap-3">
            <button onClick={handleExport} className="flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg border border-border bg-card hover:bg-white/5 transition-colors text-sm font-medium">
              <Download size={16} /> Export
            </button>
            <button onClick={handleImport} className="flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg border border-border bg-card hover:bg-white/5 transition-colors text-sm font-medium">
              <Upload size={16} /> Import
            </button>
          </div>
          
          <button 
            onClick={handleReset}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 transition-colors text-sm font-medium"
          >
            <RotateCcw size={16} /> Reset All ({totalOverrides} overrides)
          </button>
        </div>
      </aside>
    </>
  );
}

function PresetButton({ name, colors, onClick }: { name: string, colors: string[], onClick: () => void }) {
  return (
    <button onClick={onClick} className="p-3 rounded-xl border border-border bg-card hover:border-neutral-500 flex flex-col items-center justify-center gap-2 transition-all">
      <div className="flex -space-x-1.5">
        <div className="w-5 h-5 rounded-full border border-card z-10" style={{ backgroundColor: colors[0] }} />
        <div className="w-5 h-5 rounded-full border border-card z-20" style={{ backgroundColor: colors[1] }} />
        <div className="w-5 h-5 rounded-full border border-card z-30" style={{ backgroundColor: colors[2] }} />
      </div>
    </button>
  );
}

function ColorPickerRow({ label, value, onChange, allowClear }: { label: string, value: string, onChange: (v: string) => void, allowClear?: boolean }) {
  return (
    <div className="flex items-center justify-between group">
      <div className="flex items-center gap-3">
        <div className="relative w-8 h-8 rounded-md border border-border overflow-hidden shrink-0 shadow-sm">
          <input 
            type="color" 
            value={value || '#000000'} 
            onChange={(e) => onChange(e.target.value)} 
            className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer" 
          />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-[10px] font-mono opacity-50 uppercase">{value || 'Default'}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="px-2 py-1 bg-black/20 border border-border rounded font-mono text-xs opacity-70 uppercase w-20 text-center">
          {value || '---'}
        </div>
        {allowClear && value && (
          <button onClick={() => onChange('')} className="opacity-50 hover:text-destructive p-1 hover:opacity-100 transition-opacity">
            <RotateCcw size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
