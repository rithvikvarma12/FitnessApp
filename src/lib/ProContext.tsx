import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { getIsPro } from "./purchases";

interface ProContextValue {
  isPro: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  openPaywall: () => void;
}

const ProContext = createContext<ProContextValue>({
  isPro: false,
  loading: true,
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

  const refresh = useCallback(async () => {
    const pro = await getIsPro();
    setIsPro(pro);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ProContext.Provider value={{ isPro, loading, refresh, openPaywall: onOpenPaywall }}>
      {children}
    </ProContext.Provider>
  );
}
