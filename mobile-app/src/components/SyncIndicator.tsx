import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { CloudOff, CloudLightning } from 'lucide-react-native';
import { getPendingSyncCount } from '../lib/db';

export default function SyncIndicator() {
  const [pendingCount, setPendingCount] = useState(0);

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

  if (pendingCount === 0) {
    return (
      <View className="flex-row items-center mr-4">
        <CloudLightning size={18} color="#10b981" />
        <Text className="text-green-500 ml-1 font-medium text-xs">Synced</Text>
      </View>
    );
  }

  return (
    <View className="flex-row items-center mr-4">
      <CloudOff size={18} color="#f59e0b" />
      <Text className="text-amber-500 ml-1 font-medium text-xs">Pending ({pendingCount})</Text>
    </View>
  );
}
