import React, { useState, useEffect } from 'react';
import { Alert, Pressable, View, Text } from 'react-native';
import { CloudOff, CloudLightning } from 'lucide-react-native';
import { getPendingSyncCount } from '../lib/db';
import { syncNow } from '../lib/sync';

export default function SyncIndicator() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const checkSync = async () => {
      try {
        const count = await getPendingSyncCount();
        setPendingCount(count);
      } catch (e) {
        console.error(e);
      }
    };
    
    checkSync();
    const interval = setInterval(checkSync, 5000); // Check every 5 seconds
    
    return () => clearInterval(interval);
  }, []);

  const sync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncNow();
      if (result.status === 'offline') Alert.alert('Offline', 'Your sales remain safely queued until internet is available.');
      await checkPending();
    } catch (error) {
      Alert.alert('Sync failed', error instanceof Error ? error.message : 'Please try again later.');
    } finally { setIsSyncing(false); }
  };
  const checkPending = async () => setPendingCount(await getPendingSyncCount());

  if (pendingCount === 0) {
    return (
      <Pressable onPress={sync} disabled={isSyncing} className="flex-row items-center mr-4">
        <CloudLightning size={18} color="#10b981" />
        <Text className="text-green-500 ml-1 font-medium text-xs">{isSyncing ? 'Syncing' : 'Synced'}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={sync} disabled={isSyncing} className="flex-row items-center mr-4">
      <CloudOff size={18} color="#f59e0b" />
      <Text className="text-amber-500 ml-1 font-medium text-xs">{isSyncing ? 'Syncing' : `Pending (${pendingCount})`}</Text>
    </Pressable>
  );
}
