import NetInfo from "@react-native-community/netinfo";
import { useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { apiAtom } from "@/providers/JellyfinProvider";

interface NetworkStatusContextType {
  isConnected: boolean;
  serverConnected: boolean | null;
  loading: boolean;
  retryCheck: () => Promise<void>;
}

const NetworkStatusContext = createContext<NetworkStatusContextType | null>(
  null,
);

/**
 * Verifies if the Jellyfin server API is reachable by performing a HEAD request.
 * Discards requests that exceed a 5-second timeout limit.
 *
 * @param basePath - The base URL of the Jellyfin server.
 * @returns A promise resolving to true if reachable, false otherwise.
 */
async function checkApiReachable(basePath?: string): Promise<boolean> {
  if (!basePath) return false;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const url = basePath.endsWith("/") ? basePath : `${basePath}/`;
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}

/**
 * Provider component that monitors and broadcasts device internet connection and Jellyfin server status.
 * Handles automatic re-checking when NetInfo detects connectivity status changes.
 */
export function NetworkStatusProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(true);
  const [serverConnected, setServerConnected] = useState<boolean | null>(true);
  const [loading, setLoading] = useState(false);
  const [api] = useAtom(apiAtom);
  const queryClient = useQueryClient();
  const wasServerConnected = useRef<boolean | null>(null);

  const apiRef = useRef(api);
  const validationVersionRef = useRef(0);

  useEffect(() => {
    apiRef.current = api;
    validationVersionRef.current += 1;
  }, [api]);

  const validateConnection = useCallback(async () => {
    const validationVersion = ++validationVersionRef.current;
    if (!api?.basePath) return false;
    const checkPath = api.basePath;
    const reachable = await checkApiReachable(checkPath);
    if (
      validationVersion === validationVersionRef.current &&
      apiRef.current?.basePath === checkPath
    ) {
      setServerConnected(reachable);
    }
    return reachable;
  }, [api?.basePath]);

  const retryCheck = useCallback(async () => {
    setLoading(true);
    await validateConnection();
    setLoading(false);
  }, [validateConnection]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      setIsConnected(state.isConnected ?? false);
      if (state.isConnected) {
        await validateConnection();
      } else {
        validationVersionRef.current += 1;
        setServerConnected(false);
      }
    });

    // Initial check
    NetInfo.fetch().then((state) => {
      if (state.isConnected) {
        validateConnection();
      } else {
        validationVersionRef.current += 1;
        setServerConnected(false);
      }
    });

    return () => unsubscribe();
  }, [validateConnection]);

  // Refetch active queries when server becomes reachable
  useEffect(() => {
    if (serverConnected && wasServerConnected.current === false) {
      queryClient.refetchQueries({ type: "active" });
    }
    wasServerConnected.current = serverConnected;
  }, [serverConnected, queryClient]);

  return (
    <NetworkStatusContext.Provider
      value={{ isConnected, serverConnected, loading, retryCheck }}
    >
      {children}
    </NetworkStatusContext.Provider>
  );
}

/**
 * Hook to retrieve the current network connection and server reachability status.
 * Must be used within a NetworkStatusProvider.
 *
 * @returns The current NetworkStatusContext value.
 */
export function useNetworkStatus(): NetworkStatusContextType {
  const context = useContext(NetworkStatusContext);
  if (!context) {
    throw new Error(
      "useNetworkStatus must be used within NetworkStatusProvider",
    );
  }
  return context;
}
