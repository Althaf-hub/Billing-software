import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Package, Plus, RotateCcw, X } from "lucide-react-native";
import {
  addExpense,
  addVendor,
  getExpenses,
  getPurchases,
  getProducts,
  getVendors,
  savePurchase,
} from "../lib/db";
import { useAuthStore } from "../lib/store";

type SubTab = "vendors" | "purchases" | "expenses";
type Vendor = { id: string; name: string; phone: string | null; created_at: string };
type Purchase = {
  id: string;
  vendor_id: string | null;
  vendor_name: string | null;
  total_amount: number;
  is_return: number;
  created_at: string;
};
type Expense = { id: string; label: string; amount: number; created_at: string };
type Product = { id: string; name: string; stock_qty: number };
type LineItem = { product_id: string; product_name: string; quantity: string; cost_price: string };

const money = (n: number) => `Rs.${n.toFixed(2)}`;
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default function ProcurementScreen() {
  const { shopId, userId } = useAuthStore();
  const [tab, setTab] = useState<SubTab>("vendors");

  // Vendors
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [addVendorOpen, setAddVendorOpen] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [vendorSaving, setVendorSaving] = useState(false);

  // Purchases
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseIsReturn, setPurchaseIsReturn] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { product_id: "", product_name: "", quantity: "1", cost_price: "" },
  ]);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [editingLineIdx, setEditingLineIdx] = useState<number>(0);
  const [purchaseSaving, setPurchaseSaving] = useState(false);

  // Expenses
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [expenseLabel, setExpenseLabel] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseSaving, setExpenseSaving] = useState(false);

  const loadAll = useCallback(async () => {
    if (!shopId) return;
    const [v, p, e, pr] = await Promise.all([
      getVendors(shopId),
      getPurchases(shopId),
      getExpenses(shopId),
      getProducts(),
    ]);
    setVendors(v);
    setPurchases(p as Purchase[]);
    setExpenses(e);
    setProducts(pr as Product[]);
  }, [shopId]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // Vendor handlers
  const handleAddVendor = async () => {
    if (!vendorName.trim() || !shopId) return;
    setVendorSaving(true);
    try {
      await addVendor(shopId, vendorName, vendorPhone);
      await loadAll();
      setVendorName(""); setVendorPhone(""); setAddVendorOpen(false);
    } catch {
      Alert.alert("Error", "Could not save vendor. Please try again.");
    } finally { setVendorSaving(false); }
  };

  // Purchase handlers
  const openNewPurchase = (asReturn = false) => {
    setPurchaseIsReturn(asReturn);
    setSelectedVendorId(null);
    setLineItems([{ product_id: "", product_name: "", quantity: "1", cost_price: "" }]);
    setPurchaseOpen(true);
  };

  const addLine = () =>
    setLineItems((prev) => [...prev, { product_id: "", product_name: "", quantity: "1", cost_price: "" }]);

  const removeLine = (idx: number) =>
    setLineItems((prev) => prev.filter((_, i) => i !== idx));

  const updateLine = (idx: number, field: keyof LineItem, value: string) =>
    setLineItems((prev) => prev.map((line, i) => i === idx ? { ...line, [field]: value } : line));

  const openProductPicker = (idx: number) => { setEditingLineIdx(idx); setProductPickerOpen(true); };

  const selectProduct = (product: Product) => {
    setLineItems((prev) =>
      prev.map((line, i) =>
        i === editingLineIdx
          ? { ...line, product_id: product.id, product_name: product.name }
          : line,
      ),
    );
    setProductPickerOpen(false);
  };

  const handleSavePurchase = async () => {
    if (!shopId || !userId) return;
    const valid = lineItems.filter(
      (l) => l.product_id && Number(l.quantity) > 0 && Number(l.cost_price) >= 0,
    );
    if (!valid.length) {
      Alert.alert("Incomplete", "Add at least one product line with quantity and cost price.");
      return;
    }
    setPurchaseSaving(true);
    try {
      await savePurchase(
        shopId,
        selectedVendorId,
        userId,
        valid.map((l) => ({
          product_id: l.product_id,
          quantity: Number(l.quantity),
          cost_price: Number(l.cost_price),
        })),
        purchaseIsReturn,
      );
      await loadAll();
      setPurchaseOpen(false);
      Alert.alert(
        purchaseIsReturn ? "Return recorded" : "Purchase recorded",
        purchaseIsReturn
          ? "Stock has been decreased for the returned items."
          : "Stock has been increased for the purchased items.",
      );
    } catch {
      Alert.alert("Error", "Could not save purchase. Please try again.");
    } finally { setPurchaseSaving(false); }
  };

  // Expense handlers
  const handleAddExpense = async () => {
    if (!expenseLabel.trim() || !Number(expenseAmount) || !shopId) return;
    setExpenseSaving(true);
    try {
      await addExpense(shopId, expenseLabel, Number(expenseAmount));
      await loadAll();
      setExpenseLabel(""); setExpenseAmount(""); setAddExpenseOpen(false);
    } catch {
      Alert.alert("Error", "Could not save expense. Please try again.");
    } finally { setExpenseSaving(false); }
  };

  const selectedVendor = vendors.find((v) => v.id === selectedVendorId);

  return (
    <View className="flex-1 bg-zinc-50">
      {/* Sub-tab bar */}
      <View className="flex-row bg-white border-b border-zinc-200 px-4 pt-3 pb-0">
        {(["vendors", "purchases", "expenses"] as SubTab[]).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            className={"mr-5 pb-3 border-b-2 " + (tab === t ? "border-indigo-600" : "border-transparent")}
          >
            <Text className={"font-semibold capitalize text-sm " + (tab === t ? "text-indigo-600" : "text-zinc-500")}>
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* VENDORS TAB */}
      {tab === "vendors" && (
        <View className="flex-1">
          <FlatList
            data={vendors}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => (
              <View className="bg-white p-4 rounded-xl mb-3 border border-zinc-100">
                <Text className="font-semibold text-zinc-900 text-base">{item.name}</Text>
                <Text className="text-zinc-500 text-sm mt-0.5">{item.phone || "No phone"}</Text>
              </View>
            )}
            ListEmptyComponent={
              <View className="items-center justify-center py-16">
                <Package size={40} color="#a1a1aa" />
                <Text className="text-zinc-400 mt-3">No vendors yet.</Text>
              </View>
            }
          />
          <TouchableOpacity
            onPress={() => setAddVendorOpen(true)}
            className="absolute bottom-6 right-6 bg-indigo-600 rounded-full p-4 shadow-lg"
          >
            <Plus color="white" size={24} />
          </TouchableOpacity>
        </View>
      )}

      {/* PURCHASES TAB */}
      {tab === "purchases" && (
        <View className="flex-1">
          <FlatList
            data={purchases}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => (
              <View className={"p-4 rounded-xl mb-3 border " + (item.is_return ? "bg-red-50 border-red-100" : "bg-white border-zinc-100")}>
                <View className="flex-row justify-between items-start">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 flex-wrap">
                      <Text className="font-semibold text-zinc-900">{item.vendor_name || "Walk-in vendor"}</Text>
                      {item.is_return ? (
                        <View className="bg-red-100 px-2 py-0.5 rounded-full">
                          <Text className="text-red-600 text-xs font-medium">Return</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="text-zinc-400 text-xs mt-1">{fmtDate(item.created_at)}</Text>
                  </View>
                  <Text className={"font-bold text-base " + (item.is_return ? "text-red-600" : "text-zinc-900")}>
                    {item.is_return ? "-" : "+"}{money(item.total_amount)}
                  </Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View className="items-center justify-center py-16">
                <Package size={40} color="#a1a1aa" />
                <Text className="text-zinc-400 mt-3">No purchases yet.</Text>
              </View>
            }
          />
          <View className="absolute bottom-6 right-6" style={{ gap: 12 }}>
            <TouchableOpacity
              onPress={() => openNewPurchase(true)}
              className="bg-red-500 rounded-full p-4 shadow-lg self-end"
            >
              <RotateCcw color="white" size={22} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => openNewPurchase(false)}
              className="bg-indigo-600 rounded-full p-4 shadow-lg self-end"
            >
              <Plus color="white" size={24} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* EXPENSES TAB */}
      {tab === "expenses" && (
        <View className="flex-1">
          <FlatList
            data={expenses}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => (
              <View className="bg-white p-4 rounded-xl mb-3 border border-zinc-100 flex-row justify-between items-center">
                <View>
                  <Text className="font-semibold text-zinc-900">{item.label}</Text>
                  <Text className="text-zinc-400 text-xs mt-0.5">{fmtDate(item.created_at)}</Text>
                </View>
                <Text className="font-bold text-zinc-900 text-base">{money(item.amount)}</Text>
              </View>
            )}
            ListEmptyComponent={
              <View className="items-center justify-center py-16">
                <Package size={40} color="#a1a1aa" />
                <Text className="text-zinc-400 mt-3">No expenses yet.</Text>
              </View>
            }
          />
          <TouchableOpacity
            onPress={() => setAddExpenseOpen(true)}
            className="absolute bottom-6 right-6 bg-indigo-600 rounded-full p-4 shadow-lg"
          >
            <Plus color="white" size={24} />
          </TouchableOpacity>
        </View>
      )}

      {/* ADD VENDOR MODAL */}
      <Modal visible={addVendorOpen} transparent animationType="slide" onRequestClose={() => setAddVendorOpen(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-2xl p-6">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-zinc-900">Add Vendor</Text>
              <TouchableOpacity onPress={() => setAddVendorOpen(false)}><X size={20} color="#71717a" /></TouchableOpacity>
            </View>
            <Text className="text-zinc-500 text-sm mb-1">Name *</Text>
            <TextInput className="bg-zinc-100 rounded-xl px-4 py-3 mb-3 text-zinc-900" placeholder="Vendor name" value={vendorName} onChangeText={setVendorName} />
            <Text className="text-zinc-500 text-sm mb-1">Phone</Text>
            <TextInput className="bg-zinc-100 rounded-xl px-4 py-3 mb-5 text-zinc-900" placeholder="Phone number (optional)" keyboardType="phone-pad" value={vendorPhone} onChangeText={setVendorPhone} />
            <TouchableOpacity
              onPress={handleAddVendor}
              disabled={vendorSaving || !vendorName.trim()}
              className={"py-4 rounded-xl items-center " + (vendorName.trim() ? "bg-indigo-600" : "bg-zinc-300")}
            >
              <Text className="text-white font-bold">{vendorSaving ? "Saving..." : "Save Vendor"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* RECORD PURCHASE / RETURN MODAL */}
      <Modal visible={purchaseOpen} transparent animationType="slide" onRequestClose={() => setPurchaseOpen(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-2xl" style={{ maxHeight: "90%" }}>
            <View className="flex-row justify-between items-center px-6 pt-6 pb-4 border-b border-zinc-100">
              <Text className="text-lg font-bold text-zinc-900">
                {purchaseIsReturn ? "Record Return" : "Record Purchase"}
              </Text>
              <TouchableOpacity onPress={() => setPurchaseOpen(false)}><X size={20} color="#71717a" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
              <Text className="text-zinc-500 text-sm mb-1">Vendor</Text>
              <TouchableOpacity onPress={() => setVendorPickerOpen(true)} className="bg-zinc-100 rounded-xl px-4 py-3 mb-4">
                <Text className={selectedVendor ? "text-zinc-900" : "text-zinc-400"}>
                  {selectedVendor ? selectedVendor.name : "Select vendor (optional)"}
                </Text>
              </TouchableOpacity>

              <Text className="text-zinc-500 text-sm mb-2">Products *</Text>
              {lineItems.map((line, idx) => (
                <View key={idx} className="bg-zinc-50 rounded-xl p-3 mb-3 border border-zinc-200">
                  <View className="flex-row items-center justify-between mb-2">
                    <TouchableOpacity onPress={() => openProductPicker(idx)} className="flex-1 bg-white rounded-lg px-3 py-2 border border-zinc-200 mr-2">
                      <Text className={(line.product_id ? "text-zinc-900" : "text-zinc-400") + " text-sm"} numberOfLines={1}>
                        {line.product_name || "Pick product"}
                      </Text>
                    </TouchableOpacity>
                    {lineItems.length > 1 && (
                      <TouchableOpacity onPress={() => removeLine(idx)}><X size={18} color="#ef4444" /></TouchableOpacity>
                    )}
                  </View>
                  <View className="flex-row" style={{ gap: 8 }}>
                    <View className="flex-1">
                      <Text className="text-zinc-400 text-xs mb-1">Qty</Text>
                      <TextInput className="bg-white border border-zinc-200 rounded-lg px-3 py-2 text-zinc-900" keyboardType="number-pad" value={line.quantity} onChangeText={(v) => updateLine(idx, "quantity", v)} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-zinc-400 text-xs mb-1">Cost price (Rs.)</Text>
                      <TextInput className="bg-white border border-zinc-200 rounded-lg px-3 py-2 text-zinc-900" keyboardType="decimal-pad" placeholder="0.00" value={line.cost_price} onChangeText={(v) => updateLine(idx, "cost_price", v)} />
                    </View>
                  </View>
                </View>
              ))}

              <TouchableOpacity onPress={addLine} className="flex-row items-center mb-6" style={{ gap: 8 }}>
                <Plus size={16} color="#4f46e5" />
                <Text className="text-indigo-600 font-medium text-sm">Add another product</Text>
              </TouchableOpacity>

              <View className="flex-row justify-between items-center mb-6 py-3 border-t border-zinc-200">
                <Text className="text-zinc-500">Total</Text>
                <Text className="font-bold text-zinc-900 text-lg">
                  {money(lineItems.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.cost_price) || 0), 0))}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleSavePurchase}
                disabled={purchaseSaving}
                className={"py-4 rounded-xl items-center " + (purchaseIsReturn ? "bg-red-500" : "bg-indigo-600")}
              >
                <Text className="text-white font-bold">
                  {purchaseSaving ? "Saving..." : purchaseIsReturn ? "Record Return" : "Record Purchase"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* VENDOR PICKER MODAL */}
      <Modal visible={vendorPickerOpen} transparent animationType="slide" onRequestClose={() => setVendorPickerOpen(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-2xl p-5" style={{ maxHeight: "60%" }}>
            <Text className="text-lg font-bold mb-3 text-zinc-900">Choose Vendor</Text>
            <FlatList
              data={vendors}
              keyExtractor={(v) => v.id}
              renderItem={({ item }) => (
                <TouchableOpacity className="py-3 border-b border-zinc-100" onPress={() => { setSelectedVendorId(item.id); setVendorPickerOpen(false); }}>
                  <Text className="font-medium text-zinc-900">{item.name}</Text>
                  <Text className="text-zinc-500 text-xs">{item.phone || "No phone"}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text className="text-zinc-400 text-center py-4">No vendors added yet.</Text>}
            />
            <TouchableOpacity className="mt-3 py-3 items-center" onPress={() => { setSelectedVendorId(null); setVendorPickerOpen(false); }}>
              <Text className="text-indigo-600 font-semibold">No vendor</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* PRODUCT PICKER MODAL */}
      <Modal visible={productPickerOpen} transparent animationType="slide" onRequestClose={() => setProductPickerOpen(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-2xl p-5" style={{ maxHeight: "65%" }}>
            <Text className="text-lg font-bold mb-3 text-zinc-900">Choose Product</Text>
            <FlatList
              data={products}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => (
                <TouchableOpacity className="py-3 border-b border-zinc-100" onPress={() => selectProduct(item)}>
                  <Text className="font-medium text-zinc-900">{item.name}</Text>
                  <Text className="text-zinc-500 text-xs">Current stock: {item.stock_qty}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text className="text-zinc-400 text-center py-4">No products found.</Text>}
            />
          </View>
        </View>
      </Modal>

      {/* ADD EXPENSE MODAL */}
      <Modal visible={addExpenseOpen} transparent animationType="slide" onRequestClose={() => setAddExpenseOpen(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-2xl p-6">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-zinc-900">Add Expense</Text>
              <TouchableOpacity onPress={() => setAddExpenseOpen(false)}><X size={20} color="#71717a" /></TouchableOpacity>
            </View>
            <Text className="text-zinc-500 text-sm mb-1">Label *</Text>
            <TextInput className="bg-zinc-100 rounded-xl px-4 py-3 mb-3 text-zinc-900" placeholder="e.g. Electricity bill, Rent" value={expenseLabel} onChangeText={setExpenseLabel} />
            <Text className="text-zinc-500 text-sm mb-1">Amount (Rs.) *</Text>
            <TextInput className="bg-zinc-100 rounded-xl px-4 py-3 mb-5 text-zinc-900" placeholder="0.00" keyboardType="decimal-pad" value={expenseAmount} onChangeText={setExpenseAmount} />
            <TouchableOpacity
              onPress={handleAddExpense}
              disabled={expenseSaving || !expenseLabel.trim() || !Number(expenseAmount)}
              className={"py-4 rounded-xl items-center " + (expenseLabel.trim() && Number(expenseAmount) ? "bg-indigo-600" : "bg-zinc-300")}
            >
              <Text className="text-white font-bold">{expenseSaving ? "Saving..." : "Save Expense"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
