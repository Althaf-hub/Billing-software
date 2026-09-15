import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Linking, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Minus, Plus, ScanBarcode } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { findProductByBarcode, getCustomers, getProducts, saveSale } from '../lib/db';
import { useAuthStore } from '../lib/store';

type PaymentMode = 'cash' | 'upi' | 'card' | 'credit';
type Product = { id: string; name: string; barcode?: string | null; price: number; stock_qty: number };
type CartItem = Product & { quantity: number };
const money = (amount: number) => `₹${amount.toFixed(2)}`;

export default function BillingScreen() {
  const { shopId, userId } = useAuthStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountText, setDiscountText] = useState('0');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [upiOpen, setUpiOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<{ total_amount: number; customer_id: string | null } | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const loadData = async () => {
    const [productRows, customerRows] = await Promise.all([getProducts(), getCustomers()]);
    setProducts(productRows as Product[]);
    setCustomers(customerRows as any[]);
  };
  useEffect(() => { void loadData(); }, []);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = Math.min(Math.max(Number(discountText) || 0, 0), subtotal);
  const total = subtotal - discount;
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);
  const filteredProducts = useMemo(() => products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase()) || product.barcode?.includes(search),
  ), [products, search]);

  const addToCart = (product: Product) => setCart((items) => {
    const existing = items.find((item) => item.id === product.id);
    if (existing) return items.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
    return [...items, { ...product, quantity: 1 }];
  });
  const changeQuantity = (id: string, change: number) => setCart((items) => items
    .map((item) => item.id === id ? { ...item, quantity: item.quantity + change } : item)
    .filter((item) => item.quantity > 0));
  const reset = () => { setCart([]); setDiscountText('0'); setPaymentMode('cash'); setSelectedCustomerId(null); setCompletedSale(null); };

  const handleBarcode = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true); setScannerOpen(false);
    const product = await findProductByBarcode(data);
    if (product) addToCart(product);
    else Alert.alert('Product not found', `No local product matches barcode ${data}.`);
  };
  const openScanner = async () => {
    if (!permission?.granted) {
      const response = await requestPermission();
      if (!response.granted) { Alert.alert('Camera permission needed', 'Allow camera access to scan barcodes.'); return; }
    }
    setScanned(false); setScannerOpen(true);
  };
  const checkout = async () => {
    if (!cart.length || !shopId || !userId) return;
    if (paymentMode === 'credit' && !selectedCustomerId) { Alert.alert('Customer required', 'Choose a customer before recording a credit sale.'); return; }
    try {
      await saveSale({ shop_id: shopId, sold_by: userId, customer_id: selectedCustomerId, total_amount: total, discount_amount: discount, payment_mode: paymentMode }, cart);
      await loadData(); setCompletedSale({ total_amount: total, customer_id: selectedCustomerId });
      if (paymentMode === 'upi') setUpiOpen(true);
      else { Alert.alert('Sale saved', 'The sale is safely stored on this device and will sync when online.'); reset(); }
    } catch { Alert.alert('Sale not saved', 'Please try again. Your cart has not been cleared.'); }
  };
  const shareWhatsApp = async () => {
    if (!completedSale) return;
    const phone = customers.find((customer) => customer.id === completedSale.customer_id)?.phone?.replace(/\D/g, '');
    const text = `Receipt\nTotal: ${money(completedSale.total_amount)}\nThank you for shopping with us!`;
    const url = phone ? `https://wa.me/91${phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
    await Linking.openURL(url).catch(() => Alert.alert('WhatsApp unavailable', 'Could not open WhatsApp on this device.'));
  };

  return <View className="flex-1 bg-zinc-50">
    <View className="flex-1 px-4 pt-4">
      <View className="flex-row gap-2 mb-3"><TextInput className="flex-1 bg-white border border-zinc-200 rounded-xl px-3 py-3 text-zinc-900" placeholder="Search products or barcode" value={search} onChangeText={setSearch} /><TouchableOpacity accessibilityLabel="Scan barcode" className="bg-indigo-600 rounded-xl px-4 justify-center" onPress={openScanner}><ScanBarcode color="white" /></TouchableOpacity></View>
      <FlatList data={filteredProducts} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled" renderItem={({ item }) => <TouchableOpacity className="bg-white p-4 rounded-xl mb-2 flex-row justify-between border border-zinc-100" onPress={() => addToCart(item)}><View><Text className="font-semibold text-zinc-900">{item.name}</Text><Text className="text-zinc-500 text-xs">Stock: {item.stock_qty}</Text></View><Text className="font-bold text-indigo-600">{money(item.price)}</Text></TouchableOpacity>} ListEmptyComponent={<Text className="text-center text-zinc-400 pt-8">No matching products.</Text>} />
    </View>
    <View className="bg-white border-t border-zinc-200 px-4 pt-3 pb-6">
      {cart.length ? <ScrollView style={{ maxHeight: 118 }}>{cart.map((item) => <View key={item.id} className="flex-row items-center mb-2"><View className="flex-1"><Text className="text-zinc-900 font-medium">{item.name}</Text><Text className="text-zinc-500 text-xs">{money(item.price)} x {item.quantity}</Text></View><TouchableOpacity className="p-2 bg-zinc-100 rounded-full" onPress={() => changeQuantity(item.id, -1)}><Minus size={15}/></TouchableOpacity><Text className="w-8 text-center">{item.quantity}</Text><TouchableOpacity className="p-2 bg-zinc-100 rounded-full" onPress={() => changeQuantity(item.id, 1)}><Plus size={15}/></TouchableOpacity></View>)}</ScrollView> : <Text className="text-zinc-400 text-center mb-2">Cart is empty</Text>}
      <View className="flex-row items-center mb-2"><Text className="text-zinc-600 flex-1">Discount (₹)</Text><TextInput className="border border-zinc-200 rounded-lg px-2 py-1 w-24 text-right" keyboardType="decimal-pad" value={discountText} onChangeText={setDiscountText}/></View>
      <TouchableOpacity className="border border-zinc-200 rounded-lg px-3 py-2 mb-2" onPress={() => setCustomerPickerOpen(true)}><Text className="text-zinc-700">{selectedCustomer ? `Customer: ${selectedCustomer.name}` : 'Select customer (required for credit)'}</Text></TouchableOpacity>
      <View className="flex-row gap-1 mb-3">{(['cash','upi','card','credit'] as PaymentMode[]).map((mode) => <TouchableOpacity key={mode} className={`flex-1 rounded-lg py-2 items-center ${paymentMode === mode ? 'bg-indigo-600' : 'bg-zinc-100'}`} onPress={() => setPaymentMode(mode)}><Text className={`capitalize text-xs font-medium ${paymentMode === mode ? 'text-white' : 'text-zinc-600'}`}>{mode}</Text></TouchableOpacity>)}</View>
      <View className="flex-row justify-between items-center mb-3"><Text className="text-zinc-500">Total</Text><Text className="text-xl font-bold text-zinc-900">{money(total)}</Text></View><TouchableOpacity className={`py-4 rounded-xl items-center ${cart.length ? 'bg-indigo-600' : 'bg-zinc-300'}`} disabled={!cart.length} onPress={checkout}><Text className="text-white font-bold">Complete sale</Text></TouchableOpacity>
    </View>
    <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}><View className="flex-1 bg-black"><CameraView className="flex-1" facing="back" onBarcodeScanned={scanned ? undefined : handleBarcode} barcodeScannerSettings={{ barcodeTypes: ['ean13','ean8','code128','code39','upc_a','upc_e','qr'] }}/><TouchableOpacity className="absolute bottom-12 self-center bg-white px-6 py-3 rounded-xl" onPress={() => setScannerOpen(false)}><Text className="font-semibold">Cancel scan</Text></TouchableOpacity></View></Modal>
    <Modal visible={customerPickerOpen} transparent animationType="slide" onRequestClose={() => setCustomerPickerOpen(false)}><View className="flex-1 bg-black/40 justify-end"><View className="bg-white rounded-t-2xl p-5" style={{ maxHeight: '65%' }}><Text className="text-lg font-bold mb-3">Choose customer</Text><FlatList data={customers} keyExtractor={(item) => item.id} renderItem={({ item }) => <TouchableOpacity className="py-3 border-b border-zinc-100" onPress={() => { setSelectedCustomerId(item.id); setCustomerPickerOpen(false); }}><Text className="font-medium">{item.name}</Text><Text className="text-zinc-500 text-xs">{item.phone || 'No phone'} · Due {money(item.credit_balance)}</Text></TouchableOpacity>}/><TouchableOpacity className="mt-3 py-3 items-center" onPress={() => { setSelectedCustomerId(null); setCustomerPickerOpen(false); }}><Text className="text-indigo-600 font-semibold">No customer</Text></TouchableOpacity></View></View></Modal>
    <Modal visible={upiOpen} transparent animationType="slide"><View className="flex-1 bg-black/40 justify-center px-6"><View className="bg-white rounded-2xl p-6 items-center"><Text className="text-xl font-bold mb-4">Scan to pay</Text><QRCode value={`upi://pay?pa=shop@upi&pn=Billing%20Shop&am=${total.toFixed(2)}&cu=INR`} size={210}/><Text className="text-lg font-semibold mt-4">{money(total)}</Text><View className="flex-row gap-3 mt-6"><TouchableOpacity className="bg-green-600 px-4 py-3 rounded-xl" onPress={shareWhatsApp}><Text className="text-white font-bold">WhatsApp</Text></TouchableOpacity><TouchableOpacity className="bg-indigo-600 px-5 py-3 rounded-xl" onPress={() => { setUpiOpen(false); reset(); }}><Text className="text-white font-bold">Done</Text></TouchableOpacity></View></View></View></Modal>
  </View>;
}
