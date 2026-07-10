import type { Api } from "@jellyfin/sdk";
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
import { apiAtom, useJellyfin } from "@/providers/JellyfinProvider";
import { storage } from "@/utils/mmkv";
import { getServerLocalConfig } from "@/utils/secureCredentials";

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
 * @param api - The Jellyfin API client instance.
 * @param basePath - The base URL of the Jellyfin server.
 * @returns A promise resolving to true if reachable, false otherwise.
 */
async function checkApiReachable(api: Api, basePath: string): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  const cleanPath = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const url = `${cleanPath}/System/Info/Public`;

  try {
    const response = await api.axiosInstance.get(url, {
      signal: controller.signal,
      timeout: 5000,
    });
    clearTimeout(timeoutId);
    return response.status >= 200 && response.status < 300;
  } catch (error: any) {
    clearTimeout(timeoutId);

    // If the server responded with any status code, it is reachable
    if (error?.response) {
      return true;
    }

    // Fallback to fetch in case Axios/XHR had issues with local certificates/network layers
    try {
      const fetchController = new AbortController();
      const fetchTimeoutId = setTimeout(() => fetchController.abort(), 5000);
      const response = await fetch(url, {
        method: "GET",
        signal: fetchController.signal,
      });
      clearTimeout(fetchTimeoutId);

      // Any response (even if non-2xx status code like 401/403) means the server is reachable
      return response.ok || response.status === 401 || response.status === 403;
    } catch {
      return false;
    }
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
  const { switchServerUrl } = useJellyfin();
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
    let reachable = await checkApiReachable(api, checkPath);

    // Fallback: If unreachable, check if we have a local URL configured and try that as well
    if (!reachable) {
      const remoteUrl = storage.getString("serverUrl");
      if (remoteUrl) {
        const config = getServerLocalConfig(remoteUrl);
        if (config?.enabled && config.localUrl) {
          // Normalize URLs by stripping trailing slashes
          const normalizedLocal = config.localUrl.endsWith("/")
            ? config.localUrl.slice(0, -1)
            : config.localUrl;
          const normalizedCurrent = checkPath.endsWith("/")
            ? checkPath.slice(0, -1)
            : checkPath;
          const normalizedRemote = remoteUrl.endsWith("/")
            ? remoteUrl.slice(0, -1)
            : remoteUrl;

          // If current is remote, try local. If current is local, try remote (in case we moved away from home)
          const fallbackUrl =
            normalizedCurrent === normalizedRemote
              ? normalizedLocal
              : normalizedRemote;

          if (normalizedCurrent !== fallbackUrl) {
            const fallbackReachable = await checkApiReachable(api, fallbackUrl);
            if (fallbackReachable) {
              switchServerUrl(fallbackUrl);
              reachable = true;
            }
          }
        }
      }
    }

    if (
      validationVersion === validationVersionRef.current &&
      apiRef.current?.basePath === api.basePath
    ) {
      setServerConnected(reachable);
    }
    return reachable;
  }, [api, api?.basePath, switchServerUrl]);

  const retryCheck = useCallback(async () => {
    setLoading(true);
    await validateConnection();
    setLoading(false);
  }, [validateConnection]);

  const validateConnectionRef = useRef(validateConnection);

  useEffect(() => {
    validateConnectionRef.current = validateConnection;
  }, [validateConnection]);

  // Run validation check when api changes
  useEffect(() => {
    if (api?.basePath) {
      validateConnection();
    }
  }, [api, validateConnection]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      setIsConnected(state.isConnected ?? false);
      if (state.isConnected) {
        await validateConnectionRef.current();
      } else {
        validationVersionRef.current += 1;
        setServerConnected(false);
      }
    });

    // Initial check
    NetInfo.fetch().then((state) => {
      if (state.isConnected) {
        validateConnectionRef.current();
      } else {
        validationVersionRef.current += 1;
        setServerConnected(false);
      }
    });

    return () => unsubscribe();
  }, []);

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
