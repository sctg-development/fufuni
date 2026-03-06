import { useQuery } from "@tanstack/react-query";
import { getProducts, StoreProduct } from "@/lib/store-api";

/**
 * Hook that fetches storefront products (active, with variants).
 *
 * Usage:
 * const { data, isLoading, isError } = useStoreProducts();
 */
export const useStoreProducts = () => {
  return useQuery<StoreProduct[], Error>({
    queryKey: ["products"],
    queryFn: () => getProducts(),
  });
};
