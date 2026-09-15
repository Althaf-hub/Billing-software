import React, { useState, useEffect } from 'react';
import { View, Text, FlatList } from 'react-native';
import { getTodaySales } from '../lib/db';
import { useAuthStore } from '../lib/store';
import { Clock, CheckCircle } from 'lucide-react-native';

export default function HistoryScreen() {
  const [sales, setSales] = useState<any[]>([]);
  const { userId } = useAuthStore();

  useEffect(() => {
    if (userId) loadHistory();
  }, [userId]);

  const loadHistory = async () => {
    try {
      const data = await getTodaySales(userId!);
      setSales(data as any[]);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <View className="flex-1 bg-zinc-50 px-4 pt-4">
      <View className="mb-4 flex-row justify-between items-end">
        <Text className="text-xl font-bold text-zinc-900">Today's Sales</Text>
        <Text className="text-zinc-500">{sales.length} orders</Text>
      </View>

      <FlatList
        data={sales}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View className="bg-white p-4 rounded-xl mb-3 shadow-sm border border-zinc-100">
            <View className="flex-row justify-between items-start mb-2">
              <View>
                <Text className="font-semibold text-zinc-900 text-lg">Order #{item.invoice_number || item.id.slice(0,8)}</Text>
                <View className="flex-row items-center mt-1">
                  <Clock size={14} color="#71717a" className="mr-1" />
                  <Text className="text-zinc-500 text-sm">
                    {new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </Text>
                </View>
              </View>
              <Text className="font-bold text-lg text-zinc-900">₹{item.total_amount.toFixed(2)}</Text>
            </View>
            
            <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-zinc-100">
              <View className="px-2 py-1 bg-zinc-100 rounded text-xs">
                <Text className="text-zinc-600 uppercase text-xs font-medium">{item.payment_mode}</Text>
              </View>
              <View className="flex-row items-center">
                {item.synced ? (
                  <CheckCircle size={14} color="#10b981" />
                ) : (
                  <View className="w-2 h-2 rounded-full bg-amber-500 mr-1" />
                )}
                <Text className={\`ml-1 text-sm \${item.synced ? 'text-green-600' : 'text-amber-600'}\`}>
                  {item.synced ? 'Synced' : 'Pending Sync'}
                </Text>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View className="items-center justify-center py-10">
            <Text className="text-zinc-400">No sales today.</Text>
          </View>
        }
      />
    </View>
  );
}
