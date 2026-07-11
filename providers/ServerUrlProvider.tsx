import { useAtomValue } from "jotai";
import type React from "react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useNetworkStatus } from "@/providers/NetworkStatusProvider";
import { writeInfoLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { getServerLocalConfig } from "@/utils/secureCredentials";

interface ServerUrlContextValue {
  effectiveServerUrl: string | null;
  isUsingLocalUrl: boolean;
  currentSSID: string | null;
  refreshUrlState: () => void;
}

const ServerUrlContext = createContext<ServerUrlContextValue | null>(null);

interface Props {
  children: ReactNode;
}

export function ServerUrlProvider({ children }: Props): React.ReactElement {
  const api = useAtomValue(apiAtom);
  const { retryCheck } = useNetworkStatus();
  const [_tick, setTick] = useState(0);

  const remoteUrl = storage.getString("serverUrl") || null;
  const config = remoteUrl ? getServerLocalConfig(remoteUrl) : undefined;
  const localUrl = config?.enabled ? config.localUrl : null;

  const normalizeUrl = (url: string) =>
    url.trim().toLowerCase().replace(/\/$/, "");
  const isUsingLocalUrl = Boolean(
    api?.basePath &&
      localUrl &&
      normalizeUrl(api.basePath) === normalizeUrl(localUrl),
  );

  useEffect(() => {
    writeInfoLog("[ServerUrlProvider] URL Detection Status", {
      apiBasePath: api?.basePath,
      localUrl: localUrl,
      remoteUrl: remoteUrl,
      isUsingLocalUrl,
    });
  }, [api?.basePath, localUrl, remoteUrl, isUsingLocalUrl]);

  return (
    <ServerUrlContext.Provider
      value={{
        effectiveServerUrl: api?.basePath || null,
        isUsingLocalUrl,
        currentSSID: null,
        refreshUrlState: () => {
          setTick((t) => t + 1);
          retryCheck();
        },
      }}
    >
      {children}
    </ServerUrlContext.Provider>
  );
}

export function useServerUrl(): ServerUrlContextValue {
  const context = useContext(ServerUrlContext);
  if (!context) {
    throw new Error("useServerUrl must be used within ServerUrlProvider");
  }
  return context;
}
