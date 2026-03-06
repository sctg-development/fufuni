import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

/**
 * Minimal cart implementation stored in localStorage.  Several components
 * (navbar, product cards, cart page) access the same shared state via
 * context.
 */

type CartItem = {
  sku: string;
  title: string;
  price_cents: number;
  image_url?: string;
  qty: number;
};

type CartContextType = {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  updateQuantity: (sku: string, qty: number) => void;
  removeItem: (sku: string) => void;
  clear: () => void;
  count: number;
  totalCents: number;
};

const STORAGE_KEY = "merchant_cart";

function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeCart(items: CartItem[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [items, setItems] = useState<CartItem[]>(() => readCart());

  useEffect(() => {
    writeCart(items);
  }, [items]);

  const addItem = useCallback((item: CartItem) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.sku === item.sku);
      if (existing) {
        return prev.map((i) =>
          i.sku === item.sku ? { ...i, qty: i.qty + item.qty } : i,
        );
      }
      return [...prev, item];
    });
  }, []);

  const updateQuantity = useCallback((sku: string, qty: number) => {
    setItems((prev) => {
      if (qty <= 0) {
        return prev.filter((i) => i.sku !== sku);
      }
      return prev.map((i) => (i.sku === sku ? { ...i, qty } : i));
    });
  }, []);

  const removeItem = useCallback((sku: string) => {
    setItems((prev) => prev.filter((i) => i.sku !== sku));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const count = items.reduce((sum, i) => sum + i.qty, 0);
  const totalCents = items.reduce((sum, i) => sum + i.price_cents * i.qty, 0);

  const value: CartContextType = {
    items,
    addItem,
    updateQuantity,
    removeItem,
    clear,
    count,
    totalCents,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export function useCart(): CartContextType {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return ctx;
}
