'use client';
import React, { useEffect, useState } from 'react';
import { useTheme } from './ThemeContext';

function getUniqueSelector(el: Element): string {
  if (el.tagName.toLowerCase() === 'html') return 'html';
  if (el.id) return `#${el.id}`;
  
  const path = [];
  let current: Element | null = el;
  
  while (current && current.tagName.toLowerCase() !== 'html') {
    if (current.id) {
      path.unshift(`#${current.id}`);
      break;
    } else {
      let index = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }
      path.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${index})`);
    }
    current = current.parentElement;
  }
  return path.join(' > ');
}

export function ThemeInspector({ 
  isActive, 
  onSelect 
}: { 
  isActive: boolean; 
  onSelect: (selector: string) => void 
}) {
  const [hoveredRect, setHoveredRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!isActive) {
      setHoveredRect(null);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as Element;
      // Don't highlight the inspector overlay itself or the Theme Sidebar
      if (target.closest('.theme-inspector-overlay') || target.closest('.theme-sidebar')) {
        setHoveredRect(null);
        return;
      }
      setHoveredRect(target.getBoundingClientRect());
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest('.theme-inspector-overlay') || target.closest('.theme-sidebar')) {
        return;
      }
      
      e.preventDefault();
      e.stopPropagation();
      
      const selector = getUniqueSelector(target);
      onSelect(selector);
    };

    // Use capture phase to intercept clicks before they trigger React handlers
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('click', handleClick, true);
    };
  }, [isActive, onSelect]);

  if (!isActive || !hoveredRect) return null;

  return (
    <div 
      className="theme-inspector-overlay fixed z-[9999] pointer-events-none border-2 border-blue-500 bg-blue-500/20 transition-all duration-75"
      style={{
        top: hoveredRect.top,
        left: hoveredRect.left,
        width: hoveredRect.width,
        height: hoveredRect.height,
      }}
    />
  );
}
