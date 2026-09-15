import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TextInput } from 'react-native';
import { Search, User } from 'lucide-react-native';
import { getCustomers } from '../lib/db';

export default function CustomersScreen() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const data = await getCustomers();
      setCustomers(data as any[]);
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <View className="flex-1 bg-zinc-50 px-4 pt-4">
      <View className="flex-row items-center bg-white border border-zinc-200 rounded-xl px-3 py-3 mb-6 shadow-sm">
        <Search size={20} color="#71717a" />
        <TextInput
          className="flex-1 ml-3 text-base text-zinc-800"
          placeholder="Search customers..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View className="bg-white p-4 rounded-xl mb-3 flex-row justify-between items-center shadow-sm border border-zinc-100">
            <View className="flex-row items-center">
              <View className="w-10 h-10 bg-indigo-100 rounded-full items-center justify-center mr-4">
                <User size={20} color="#4f46e5" />
              </View>
              <View>
                <Text className="font-semibold text-zinc-900 text-lg">{item.name}</Text>
                <Text className="text-zinc-500">{item.phone}</Text>
              </View>
            </View>
            <View className="items-end">
              <Text className="text-xs text-zinc-500 mb-1">Credit Balance</Text>
              <Text className={\`font-bold text-lg \${item.credit_balance > 0 ? 'text-red-500' : 'text-green-600'}\`}>
                ₹{item.credit_balance.toFixed(2)}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View className="items-center justify-center py-10">
            <Text className="text-zinc-400">No customers found.</Text>
          </View>
        }
      />
    </View>
  );
}
