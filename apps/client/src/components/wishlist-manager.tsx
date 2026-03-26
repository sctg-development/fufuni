/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useMemo } from "react";
import {
  Card,
  Button,
  Link as HeroUILink,
  Input} from "@heroui/react";
import { useWishlist } from "@/hooks/useWishlist";
import { useState } from "react";
import { Link } from "react-router-dom";

/**
 * WishlistManager - Modern wishlist interface
 * Displays favorite products with search and management actions
 */
export function WishlistManager() {
  const { wishlist, toggle, isLoading } = useWishlist();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredWishlist = useMemo(() => {
    if (!searchTerm.trim()) return wishlist;
    return wishlist.filter((id) =>
      id.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [wishlist, searchTerm]);

  if (wishlist.length === 0) {
    return (
      <Card className="border border-default-200 bg-default-50">
        <Card.Content className="py-12 text-center">
          <div className="space-y-4">
            <p className="text-5xl">❤️</p>
            <p className="text-lg font-semibold text-default-700">
              Aucun favori pour le moment
            </p>
            <p className="text-sm text-default-500">
              Ajoutez des produits à vos favoris pour les retrouver facilement
            </p>
            <HeroUILink href="/" className="mt-4">
              <Button variant="primary">
                Découvrir nos produits
              </Button>
            </HeroUILink>
          </div>
        </Card.Content>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card className="bg-linear-to-br from-pink-500/10 to-pink-600/10 border border-pink-200">
        <Card.Content>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-default-600 font-medium">Favoris</p>
              <p className="text-3xl font-bold text-pink-600 mt-1">
                {wishlist.length}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-default-600 font-medium">
                Produits sauvegardés
              </p>
              <p className="text-2xl font-bold text-pink-600 mt-1">
                ⭐
              </p>
            </div>
          </div>
        </Card.Content>
      </Card>

      {/* Search Bar */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-default-400">🔍</span>
        <Input
          className="rounded-lg pl-10"
          placeholder="Rechercher dans vos favoris..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Results Info */}
      <div className="flex justify-between items-center px-2">
        <p className="text-sm text-default-600">
          {filteredWishlist.length} produit
          {filteredWishlist.length !== 1 ? "s" : ""} trouvé
          {filteredWishlist.length !== 1 ? "s" : ""}
        </p>
        {searchTerm && (
          <Button
            size="sm"
            variant="tertiary"
            onPress={() => setSearchTerm("")}
          >
            Réinitialiser
          </Button>
        )}
      </div>

      {/* Wishlist Items */}
      <div className="space-y-3">
        {filteredWishlist.length > 0 ? (
          filteredWishlist.map((productId, idx) => (
            <Card
              key={idx}
              className="border border-default-200 hover:border-pink-300 transition-colors"
            >
              <Card.Content className="flex-row justify-between items-center py-4">
                <div className="flex items-center gap-4 flex-1">
                  {/* Product Icon */}
                  <div className="shrink-0 w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center">
                    <span className="text-xl">🏷️</span>
                  </div>

                  {/* Product Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-default-900 truncate">
                      Produit #{productId}
                    </p>
                    <p className="text-xs text-default-500 mt-1">
                      Ajouté à vos favoris
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 ml-3 shrink-0">
                  <Link to={`/products/${productId}`}>
                    <Button
                      isIconOnly
                      variant="tertiary"
                      size="sm"
                    >
                      👁️
                    </Button>
                  </Link>
                  <Button
                    isIconOnly
                    variant="danger"
                    size="sm"
                    isPending={isLoading}
                    onPress={() => toggle(productId)}
                  >
                    💔
                  </Button>
                </div>
              </Card.Content>
            </Card>
          ))
        ) : (
          <Card className="border border-default-200 bg-default-50">
            <Card.Content className="py-8 text-center">
              <p className="text-default-500">
                Aucun produit ne correspond à votre recherche
              </p>
              <Button
                size="sm"
                variant="tertiary"
                onPress={() => setSearchTerm("")}
                className="mt-3"
              >
                Réinitialiser la recherche
              </Button>
            </Card.Content>
          </Card>
        )}
      </div>

      {/* Actions Footer */}
      <Card className="bg-default-50 border border-default-200">
        <Card.Content className="py-4">
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium text-default-700">
              Gérer vos favoris
            </p>
            <HeroUILink href="/">
              <Button size="sm" variant="primary">
                Ajouter plus de produits
              </Button>
            </HeroUILink>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
