import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { hostSlug, setStoreSlug } from "./api";
import { Toasts, prefetch, warmStore } from "./ui";
import { PageSkeleton, StoreSkeleton } from "./kit";
import Landing from "./pages/Landing";
import Market from "./pages/Market";
import CookieConsent from "./CookieConsent";
import { About, Contact, Delivery, Faq, Help, HowItWorks, CookiePolicy, NotFound, Privacy, Sell, SellerTerms, Terms } from "./pages/Info";

// Admin and seller code is only downloaded after a successful role check (it is not shipped to customers / visitors).
const Admin = lazy(() => import("./admin/Admin"));
const Account = lazy(() => import("./pages/Account"));
const loadStore = () => import("./store/Store");
const Store = lazy(loadStore);
const named = (name) => lazy(() => import("./pages/Auth").then((m) => ({ default: m[name] })));
const Login = named("Login"), CustomerSignup = named("CustomerSignup"), SellerSignup = named("SellerSignup"), ForgotPassword = named("ForgotPassword");
const Seller = lazy(() => import("./seller/Seller"));

// On a seller subdomain (shop.<your-domain>) the whole site is the store: start downloading the store code AND its data
// right now, in parallel, instead of waiting for React to render and discover them one after another.
if (hostSlug() && ["", "/"].includes(location.pathname)) { setStoreSlug(hostSlug()); loadStore(); prefetch("/store"); warmStore(); }

const homeOf = (u) => (u?.role === "admin" ? "/admin" : u?.role === "seller" ? "/seller" : u?.role === "customer" ? "/account" : "/");

// Role-based route guard (the server enforces the same roles on every API call; this only decides what to show).
//  - not logged in  -> /login (and come back after login)
//  - wrong role     -> that user's own dashboard (a customer typing /admin lands on /account)
function Guard({ role, children }) {
  const { user, loading } = useAuth(); const loc = useLocation();
  if (loading) return <PageSkeleton />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return user.role === role ? children : <Navigate to={homeOf(user)} replace />;
}
const PathStore = () => { const { slug } = useParams(); return <Store key={slug} slug={slug} base={"/s/" + slug} />; };

export default function App() {
  const slug = hostSlug(); // on shop.<your-domain> the whole site IS the store
  return (
    <AuthProvider>
      <Toasts />
      <CookieConsent />
      {slug ? (
        <Suspense fallback={<StoreSkeleton />}><Routes><Route path="/*" element={<Store slug={slug} base="" />} /></Routes></Suspense>
      ) : (
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<CustomerSignup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/stores" element={<Market />} />
            <Route path="/account/*" element={<Guard role="customer"><Account /></Guard>} />
            <Route path="/seller-signup" element={<SellerSignup />} />
            <Route path="/seller/*" element={<Guard role="seller"><Seller /></Guard>} />
            <Route path="/admin/*" element={<Guard role="admin"><Admin /></Guard>} />
            <Route path="/s/:slug/*" element={<PathStore />} />
            <Route path="/about" element={<About />} /><Route path="/how-it-works" element={<HowItWorks />} /><Route path="/sell" element={<Sell />} />
            <Route path="/contact" element={<Contact />} /><Route path="/faq" element={<Faq />} /><Route path="/help" element={<Help />} />
            <Route path="/delivery" element={<Delivery />} /><Route path="/privacy" element={<Privacy />} /><Route path="/terms" element={<Terms />} /><Route path="/seller-terms" element={<SellerTerms />} /><Route path="/cookies" element={<CookiePolicy />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      )}
    </AuthProvider>
  );
}
