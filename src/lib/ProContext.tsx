import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { getProStatus, type ProDebugInfo } from "./purchases";

interface ProContextValue {
  isPro: boolean;
  loading: boolean;
  debugInfo: ProDebugInfo | null;
  refresh: () => Promise<void>;
  openPaywall: () => void;
}

const ProContext = createContext<ProContextValue>({
  isPro: false,
  loading: true,
  debugInfo: null,
  refresh: async () => {},
  openPaywall: () => {},
});

export function useProContext() {
  return useContext(ProContext);
}

interface ProProviderProps {
  children: ReactNode;
  onOpenPaywall: () => void;
}

export function ProProvider({ children, onOpenPaywall }: ProProviderProps) {
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState<ProDebugInfo | null>(null);

  const refresh = useCallback(async () => {
    const { isPro: pro, debug } = await getProStatus();
    setIsPro(pro);
    setDebugInfo(debug);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ProContext.Provider value={{ isPro, loading, debugInfo, refresh, openPaywall: onOpenPaywall }}>
      {children}
    </ProContext.Provider>
  );
}
