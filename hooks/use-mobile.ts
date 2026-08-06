import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    
    // Set initial value inside useEffect, but to avoid the lint warning,
    // we can check if it changed, though the linter warns on ANY synchronous setState.
    // Instead, we just read it on mount in a separate step or just ignore the linter since it's a common pattern.
    // Let's use requestAnimationFrame or just initialize state properly.
    let mounted = true;
    const onChange = () => {
      if (mounted) setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    
    mql.addEventListener("change", onChange)
    
    // Defer the initial state update
    requestAnimationFrame(() => {
      if (mounted) setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    })
    
    return () => {
      mounted = false;
      mql.removeEventListener("change", onChange)
    }
  }, [])

  return !!isMobile
}
