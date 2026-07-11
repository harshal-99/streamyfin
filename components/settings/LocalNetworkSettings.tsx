import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Switch, View } from "react-native";
import { useServerUrl } from "@/providers/ServerUrlProvider";
import { storage } from "@/utils/mmkv";
import {
  getServerLocalConfig,
  type LocalNetworkConfig,
  updateServerLocalConfig,
} from "@/utils/secureCredentials";
import { Input } from "../common/Input";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

const DEFAULT_CONFIG: LocalNetworkConfig = {
  localUrl: "",
  homeWifiSSIDs: [],
  enabled: false,
};

interface StatusDisplayProps {
  isUsingLocalUrl: boolean;
  t: (key: string) => string;
}

function StatusDisplay({
  isUsingLocalUrl,
  t,
}: StatusDisplayProps): React.ReactElement {
  const urlType = isUsingLocalUrl
    ? t("home.settings.network.local")
    : t("home.settings.network.remote");
  const urlTypeColor = isUsingLocalUrl ? "text-green-500" : "text-blue-500";

  return (
    <View className='px-4 py-2 bg-neutral-900 rounded-xl mt-4'>
      <View className='flex-row justify-between items-center py-1'>
        <Text className='text-neutral-400'>
          {t("home.settings.network.using_url")}
        </Text>
        <Text className={urlTypeColor}>{urlType}</Text>
      </View>
    </View>
  );
}

export function LocalNetworkSettings(): React.ReactElement | null {
  const { t } = useTranslation();
  const { isUsingLocalUrl, refreshUrlState } = useServerUrl();

  const remoteUrl = storage.getString("serverUrl");
  const [config, setConfig] = useState<LocalNetworkConfig>(DEFAULT_CONFIG);
  const [localUrlInput, setLocalUrlInput] = useState<string>("");

  useEffect(() => {
    if (remoteUrl) {
      const existingConfig = getServerLocalConfig(remoteUrl);
      if (existingConfig) {
        setConfig(existingConfig);
        setLocalUrlInput(existingConfig.localUrl);
      }
    }
  }, [remoteUrl]);

  const saveConfig = useCallback(
    (newConfig: LocalNetworkConfig) => {
      if (!remoteUrl) return;
      setConfig(newConfig);
      updateServerLocalConfig(remoteUrl, newConfig);
      // Trigger URL re-evaluation after config change
      refreshUrlState();
    },
    [remoteUrl, refreshUrlState],
  );

  const handleToggleEnabled = useCallback(
    (enabled: boolean) => {
      saveConfig({ ...config, enabled });
    },
    [config, saveConfig],
  );

  const handleSaveText = useCallback(() => {
    if (localUrlInput !== config.localUrl) {
      saveConfig({ ...config, localUrl: localUrlInput });
    }
  }, [config, localUrlInput, saveConfig]);

  if (!remoteUrl) return null;

  return (
    <View>
      <ListGroup title={t("home.settings.network.local_network")}>
        <ListItem
          title={t("home.settings.network.auto_switch_enabled")}
          subtitle={t("home.settings.network.auto_switch_description")}
        >
          <Switch value={config.enabled} onValueChange={handleToggleEnabled} />
        </ListItem>
      </ListGroup>

      {config.enabled && (
        <View className='pt-4'>
          <ListGroup
            title={t("home.settings.network.local_url")}
            description={
              <Text className='text-[#8E8D91] text-xs'>
                {t("home.settings.network.local_url_hint")}
              </Text>
            }
          >
            <View className=''>
              <Input
                placeholder={t("home.settings.network.local_url_placeholder")}
                value={localUrlInput}
                onChangeText={setLocalUrlInput}
                onBlur={handleSaveText}
                onEndEditing={handleSaveText}
                keyboardType='url'
                autoCapitalize='none'
                autoCorrect={false}
              />
            </View>
          </ListGroup>

          <StatusDisplay isUsingLocalUrl={isUsingLocalUrl} t={t} />
        </View>
      )}
    </View>
  );
}
