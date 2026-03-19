/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { Route, Routes } from "react-router-dom";
import { Suspense } from "react";

import { SiteLoading } from "./components/site-loading";
import { PageNotFound } from "./pages/404";
import { AuthenticationGuard, AuthenticationGuardWithPermission, useAuth } from "./authentication";

import IndexPage from "@/pages/index";
import ApiPage from "@/pages/api";
import PricingPage from "@/pages/pricing";
import BlogPage from "@/pages/blog";
import AboutPage from "@/pages/about";
import UsersAndPermissionsPage from "@/pages/admin/users-and-permissions";
import ProductsPage from "@/pages/admin/products";
import CustomersPage from "@/pages/admin/customers";
import InventoryPage from "@/pages/admin/inventory";
import OrdersPage from "@/pages/admin/orders";
import WebhooksPage from "@/pages/admin/webhooks";
import RegionsPage from "@/pages/admin/regions";
import CurrenciesPage from "@/pages/admin/currencies";
import CountriesPage from "@/pages/admin/countries";
import WarehousesPage from "@/pages/admin/warehouses";
import ShippingRatesPage from "@/pages/admin/shipping-rates";
import ShippingClassesPage from "@/pages/admin/shipping-classes";
import TaxRatesPage from "@/pages/admin/tax-rates";
import { SwaggerPage } from "@/pages/swagger";
import CartPage from "@/pages/cart";
import ProductPage from "@/pages/product";
import SuccessPage from "@/pages/success";
import OrderPage from "@/pages/order";

function App() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return <SiteLoading />;
  }

  // Gérer les erreurs
  // Note: we no longer block the whole app when the user is unauthenticated.
  // Individual routes that require auth use <AuthenticationGuard> instead.
  // The landing page should be accessible to everyone, otherwise GitHub
  // Pages visitors just see an "authentication error" message.

  return (
    <Suspense fallback={<SiteLoading />}>
      <Routes>
        <Route element={<IndexPage />} path="/" />
        <Route element={<CartPage />} path="/cart" />
        <Route element={<SuccessPage />} path="/success" />
        <Route element={<OrderPage />} path="/order/:id" />
        <Route element={<ProductPage />} path="/product/:id" />
        <Route
          element={<AuthenticationGuard component={ApiPage} />}
          path="/api"
        />
        <Route
          element={<AuthenticationGuard component={PricingPage} />}
          path="/pricing"
        />
        <Route
          element={<AuthenticationGuard component={BlogPage} />}
          path="/blog"
        />
        <Route element={<AboutPage />} path="/about" />
        <Route
          element={<AuthenticationGuardWithPermission permission={import.meta.env.ADMIN_AUTH0_PERMISSION}><UsersAndPermissionsPage /></AuthenticationGuardWithPermission>}
          path="/admin/users"
        />
        <Route
          element={<AuthenticationGuardWithPermission permission={import.meta.env.ADMIN_STORE_PERMISSION}><ProductsPage /></AuthenticationGuardWithPermission>}
          path="/admin/products"
        />
        <Route
          element={<AuthenticationGuardWithPermission permission={import.meta.env.ADMIN_STORE_PERMISSION}><CustomersPage /></AuthenticationGuardWithPermission>}
          path="/admin/customers"
        />
        <Route
          element={<AuthenticationGuardWithPermission permission={import.meta.env.ADMIN_STORE_PERMISSION}><InventoryPage /></AuthenticationGuardWithPermission>}
          path="/admin/inventory"
        />
        <Route
          element={<AuthenticationGuardWithPermission permission={import.meta.env.ADMIN_STORE_PERMISSION}><OrdersPage /></AuthenticationGuardWithPermission>}
          path="/admin/orders"
        />
        <Route
          element={<AuthenticationGuardWithPermission permission={import.meta.env.ADMIN_STORE_PERMISSION}><WebhooksPage /></AuthenticationGuardWithPermission>}
          path="/admin/webhooks"
        />
        <Route
          element={<AuthenticationGuardWithPermission permission={import.meta.env.ADMIN_STORE_PERMISSION}><RegionsPage /></AuthenticationGuardWithPermission>}
          path="/admin/regions"
        />
        <Route
          element={<AuthenticationGuardWithPermission permission={import.meta.env.ADMIN_STORE_PERMISSION}><CurrenciesPage /></AuthenticationGuardWithPermission>}
          path="/admin/currencies"
        />
        <Route
          element={<AuthenticationGuardWithPermission permission={import.meta.env.ADMIN_STORE_PERMISSION}><CountriesPage /></AuthenticationGuardWithPermission>}
          path="/admin/countries"
        />
        <Route
          element={<AuthenticationGuardWithPermission permission={import.meta.env.ADMIN_STORE_PERMISSION}><WarehousesPage /></AuthenticationGuardWithPermission>}
          path="/admin/warehouses"
        />
        <Route
          element={<AuthenticationGuardWithPermission permission={import.meta.env.ADMIN_STORE_PERMISSION}><ShippingRatesPage /></AuthenticationGuardWithPermission>}
          path="/admin/shipping-rates"
        />
        <Route
          element={<AuthenticationGuardWithPermission permission={import.meta.env.ADMIN_STORE_PERMISSION}><ShippingClassesPage /></AuthenticationGuardWithPermission>}
          path="/admin/shipping-classes"
        />
        <Route
          element={<AuthenticationGuardWithPermission permission={import.meta.env.ADMIN_STORE_PERMISSION}><TaxRatesPage /></AuthenticationGuardWithPermission>}
          path="/admin/tax-rates"
        />
        <Route
          element={<AuthenticationGuard component={SwaggerPage} />}
          path="/openapi"
        />
        <Route element={<PageNotFound />} path="*" />
        </Routes>
    </Suspense>
  );
}

export default App;
