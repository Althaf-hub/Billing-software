import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, Modal, ScrollView, Linking } from 'react-native';
import { Search, Plus, Minus, MessageCircle } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { getProducts, getCustomers, saveSale } from '../lib/db';
import { useAuthStore } from '../lib/store';

interface Product {
  id: string;
  name: string;
  price: number;
  stock_qty: number;
}

interface CartItem extends Product {
  quantity: number;
}

export default function BillingScreen() {
  const { shopId, userId } = useAuthStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Checkout state
  const [paymentMode, setPaymentMode] = useState<'cash' | 'upi' | 'card' | 'credit'>('cash');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [completedSale, setCompletedSale] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const p = await getProducts();
      setProducts(p as Product[]);
      const c = await getCustomers();
      setCustomers(c as any[]);
    } catch (e) {
      console.error(e);
    }
  };

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQ = item.quantity + delta;
        return newQ > 0 ? { ...item, quantity: newQ } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleCheckout = async () => {
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Add items before checkout.');
      return;
    }
    if (paymentMode === 'credit' && !selectedCustomerId) {
      Alert.alert('Customer Required', 'Select a customer for credit sales.');
      return;
    }

    try {
      const sale = {
        shop_id: shopId,
        sold_by: userId,
        customer_id: selectedCustomerId,
        total_amount: total,
        discount_amount: 0,
        payment_mode: paymentMode,
      };

      const saleId = await saveSale(sale, cart);
      
      setCompletedSale({ ...sale, id: saleId });
      
      if (paymentMode === 'upi') {
        setShowUpiModal(true);
      } else {
        Alert.alert('Success', 'Sale saved successfully offline.');
        resetCart();
      }
      
      // Reload products to get updated stock
      loadData();
    } catch (e) {
      Alert.alert('Error', 'Failed to save sale.');
      console.error(e);
    }
  };

  const resetCart = () => {
    setCart([]);
    setPaymentMode('cash');
    setSelectedCustomerId(null);
    setCompletedSale(null);
  };

  const shareWhatsApp = () => {
    if (!completedSale) return;
    
    // Simple wa.me link
    const text = \`Receipt from our shop.\\nTotal: ₹\${completedSale.total_amount}\\nThank you!\`;
    // In a real app we'd get customer phone if they are selected
    const url = \`whatsapp://send?text=\${encodeURIComponent(text)}\`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'WhatsApp not installed');
    });
  };

  return (
    <View className="flex-1 bg-zinc-50">
      {/* Products Section */}
      <View className="flex-1 px-4 pt-4">
        <View className="flex-row items-center bg-white border border-zinc-200 rounded-xl px-3 py-2 mb-4">
          <Search size={20} color="#71717a" />
          <TextInput
            className="flex-1 ml-2 text-base text-zinc-800"
            placeholder="Search products..."
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <FlatList
          data={filteredProducts}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity 
              className="bg-white p-4 rounded-xl mb-3 flex-row justify-between items-center shadow-sm border border-zinc-100"
              onPress={() => addToCart(item)}
            >
              <View>
                <Text className="font-semibold text-zinc-900 text-lg">{item.name}</Text>
                <Text className="text-zinc-500">Stock: {item.stock_qty}</Text>
              </View>
              <Text className="font-bold text-indigo-600 text-lg">₹{item.price.toFixed(2)}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Cart & Checkout Panel (Bottom) */}
      <View className="bg-white rounded-t-3xl shadow-xl border-t border-zinc-200 pt-4 px-4 pb-8 max-h-[50%]">
        <Text className="font-bold text-xl mb-3 text-zinc-900">Current Order</Text>
        
        {cart.length === 0 ? (
          <Text className="text-zinc-400 italic mb-4 text-center">Cart is empty</Text>
        ) : (
          <ScrollView className="mb-4 max-h-40">
            {cart.map(item => (
              <View key={item.id} className="flex-row justify-between items-center mb-3">
                <View className="flex-1">
                  <Text className="font-medium text-zinc-800">{item.name}</Text>
                  <Text className="text-zinc-500 text-sm">₹{item.price} x {item.quantity}</Text>
                </View>
                
                <View className="flex-row items-center">
                  <TouchableOpacity onPress={() => updateQuantity(item.id, -1)} className="bg-zinc-100 p-2 rounded-full">
                    <Minus size={16} color="#3f3f46" />
                  </TouchableOpacity>
                  <Text className="mx-3 font-medium text-lg w-6 text-center">{item.quantity}</Text>
                  <TouchableOpacity onPress={() => updateQuantity(item.id, 1)} className="bg-zinc-100 p-2 rounded-full">
                    <Plus size={16} color="#3f3f46" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        <View className="border-t border-zinc-200 pt-4 mb-4">
          <View className="flex-row justify-between mb-4">
            <Text className="text-zinc-500 text-lg">Total</Text>
            <Text className="font-bold text-2xl text-zinc-900">₹{total.toFixed(2)}</Text>
          </View>

          {/* Payment Modes */}
          <View className="flex-row justify-between mb-4">
            {['cash', 'upi', 'card', 'credit'].map((mode) => (
              <TouchableOpacity
                key={mode}
                className={\`px-4 py-2 rounded-lg border \${paymentMode === mode ? 'bg-indigo-50 border-indigo-600' : 'bg-white border-zinc-300'}\`}
                onPress={() => setPaymentMode(mode as any)}
              >
                <Text className={\`capitalize font-medium \${paymentMode === mode ? 'text-indigo-600' : 'text-zinc-600'}\`}>
                  {mode}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity 
          className={\`py-4 rounded-xl items-center \${cart.length === 0 ? 'bg-zinc-300' : 'bg-indigo-600'}\`}
          onPress={handleCheckout}
          disabled={cart.length === 0}
        >
          <Text className="text-white font-bold text-lg">Complete Sale</Text>
        </TouchableOpacity>
      </View>

      {/* UPI QR Modal */}
      <Modal visible={showUpiModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-center items-center px-6">
          <View className="bg-white w-full rounded-2xl p-6 items-center">
            <Text className="text-2xl font-bold mb-6 text-zinc-900">Scan to Pay UPI</Text>
            <View className="p-4 bg-white border border-zinc-200 rounded-xl mb-6 shadow-sm">
              <QRCode 
                value={\`upi://pay?pa=shop@upi&pn=BillingShop&am=\${total}\`} 
                size={200}
              />
            </View>
            <Text className="text-xl font-medium text-zinc-600 mb-6">Total: ₹{total.toFixed(2)}</Text>
            
            <View className="flex-row space-x-4 w-full">
              <TouchableOpacity 
                className="flex-1 bg-green-500 py-4 rounded-xl items-center flex-row justify-center mr-2"
                onPress={shareWhatsApp}
              >
                <MessageCircle color="white" size={20} className="mr-2" />
                <Text className="text-white font-bold">WhatsApp</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                className="flex-1 bg-indigo-600 py-4 rounded-xl items-center ml-2"
                onPress={() => {
                  setShowUpiModal(false);
                  resetCart();
                }}
              >
                <Text className="text-white font-bold">Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
