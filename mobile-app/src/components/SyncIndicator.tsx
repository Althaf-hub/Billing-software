/**
 * SyncIndicator — header badge shown on all tabs.
 * Reads live state from useSyncStore (updated by the sync engine in sync.ts).
 * Tapping it triggers an immediate manual sync.
 */
import React from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { CloudOff, CloudLightning, RefreshCw, WifiOff } from 'lucide-react-native';
import { syncNow } from '../lib/sync';
import { useSyncStore } from '../lib/store';

export default function SyncIndicator() {
  const { status, pendingCount } = useSyncStore();

  const handlePress = async () => {
    try {
      const result = await syncNow();
      if (result.status === 'offline') {
        Alert.alert('Offline', 'Your sales remain safely queued until internet is available.');
      }
    } catch (error) {
      Alert.alert('Sync failed', error instanceof Error ? error.message : 'Please try again later.');
    }
  };

  if (status === 'syncing') {
    return (
      <Pressable disabled className="flex-row items-center mr-4">
        <RefreshCw size={16} color="#6366f1" />
        <Text className="text-indigo-400 ml-1.5 font-medium text-xs">Syncing…</Text>
      </Pressable>
    );
  }

  if (status === 'offline') {
    return (
      <Pressable onPress={handlePress} className="flex-row items-center mr-4">
        <WifiOff size={16} color="#ef4444" />
        <Text className="text-red-400 ml-1.5 font-medium text-xs">Offline</Text>
      </Pressable>
    );
  }

  if (status === 'error') {
    return (
      <Pressable onPress={handlePress} className="flex-row items-center mr-4">
        <CloudOff size={16} color="#f59e0b" />
        <Text className="text-amber-500 ml-1.5 font-medium text-xs">Retry sync</Text>
      </Pressable>
    );
  }

  if (pendingCount > 0) {
    return (
      <Pressable onPress={handlePress} className="flex-row items-center mr-4">
        <CloudOff size={16} color="#f59e0b" />
        <Text className="text-amber-500 ml-1.5 font-medium text-xs">Pending ({pendingCount})</Text>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={handlePress} className="flex-row items-center mr-4">
      <CloudLightning size={16} color="#10b981" />
      <Text className="text-green-500 ml-1.5 font-medium text-xs">Synced ✓</Text>
    </Pressable>
  );
}
