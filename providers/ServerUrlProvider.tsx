import { useAtomValue } from "jotai";
import type React from "react";
import { createContext, type ReactNode, useContext } from "react";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useNetworkStatus } from "@/providers/NetworkStatusProvider";
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

  const remoteUrl = storage.getString("serverUrl") || null;
  const config = remoteUrl ? getServerLocalConfig(remoteUrl) : undefined;
  const localUrl = config?.enabled ? config.localUrl : null;

  const isUsingLocalUrl = Boolean(
    api?.basePath &&
      localUrl &&
      api.basePath.replace(/\/$/, "") === localUrl.replace(/\/$/, ""),
  );

  return (
    <ServerUrlContext.Provider
      value={{
        effectiveServerUrl: api?.basePath || null,
        isUsingLocalUrl,
        currentSSID: null,
        refreshUrlState: () => {
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
