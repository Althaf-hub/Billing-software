import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useAuthStore } from '../lib/store';
import { useNavigation } from '@react-navigation/native';

const API_URL = 'https://shop-billing-worker.althafrahmanmp.workers.dev';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuthStore();
  const navigation = useNavigation();

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Please enter both username and password');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(\`\${API_URL}/auth/login\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) {
        throw new Error('Invalid credentials');
      }

      const data = await res.json();
      
      // Store auth info
      await login(data.token, data.shop_id, data.user_id, data.role);
      
      // Navigate to Billing if salesman, or if admin (though admin is typically desktop)
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' as never }],
      });

    } catch (e: any) {
      Alert.alert('Login Failed', e.message || 'Could not connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-zinc-950 px-6 justify-center">
      <View className="mb-10 items-center">
        <View className="w-20 h-20 bg-indigo-600 rounded-2xl items-center justify-center mb-4">
          <Text className="text-white text-3xl font-bold">B</Text>
        </View>
        <Text className="text-white text-3xl font-bold">Billing App</Text>
        <Text className="text-zinc-400 mt-2">Sign in to your account</Text>
      </View>

      <View className="space-y-4">
        <View>
          <Text className="text-zinc-300 mb-1.5 ml-1 font-medium">Username</Text>
          <TextInput
            className="bg-zinc-900 text-white px-4 py-3.5 rounded-xl border border-zinc-800"
            placeholder="Enter username"
            placeholderTextColor="#52525b"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
        </View>

        <View>
          <Text className="text-zinc-300 mb-1.5 ml-1 font-medium">Password</Text>
          <TextInput
            className="bg-zinc-900 text-white px-4 py-3.5 rounded-xl border border-zinc-800"
            placeholder="Enter password"
            placeholderTextColor="#52525b"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>

        <TouchableOpacity 
          className="bg-indigo-600 py-4 rounded-xl mt-4 items-center"
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold text-lg">Sign In</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
