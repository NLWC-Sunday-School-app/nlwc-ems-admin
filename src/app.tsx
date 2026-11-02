import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, RouterProvider, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { SessionProvider, useSession } from "./lib/session";
import { MfaGate, SignIn } from "./components/Auth";
import { Shell } from "./components/Shell";
import { Dashboard } from "./pages/Dashboard";
import { EditionDetail, EditionsPage } from "./pages/Editions";
import { PricingPage } from "./pages/Pricing";
import { CampReviewPage } from "./pages/CampReview";
import { PeoplePage } from "./pages/People";
import { RegistrationsPage } from "./pages/Registrations";
import { StaffPage } from "./pages/Staff";
import { AuditPage } from "./pages/Audit";
import { Loading } from "./components/ui";

function Gate() {
  const { status } = useSession();
  if (status === "loading") return <main className="auth-wrap"><Loading what="Checking your session" /></main>;
  if (status === "signedOut") return <SignIn />;
  if (status === "needsMfa") return <MfaGate />;
  return <Shell />;
}

const root = createRootRoute({
  component: Gate,
  notFoundComponent: () => <section><h1>Page not found</h1><p><Link to="/">Back to the dashboard</Link></p></section>,
});
const dashboard = createRoute({ getParentRoute: () => root, path: "/", component: Dashboard });
const editions = createRoute({ getParentRoute: () => root, path: "/editions", component: EditionsPage });
const editionDetail = createRoute({ getParentRoute: () => root, path: "/editions/$editionId", component: EditionDetail });
const pricing = createRoute({ getParentRoute: () => root, path: "/pricing", component: PricingPage });
const registrations = createRoute({ getParentRoute: () => root, path: "/registrations", component: RegistrationsPage });
const people = createRoute({ getParentRoute: () => root, path: "/people", component: PeoplePage });
const camp = createRoute({ getParentRoute: () => root, path: "/camp", component: CampReviewPage });
const staff = createRoute({ getParentRoute: () => root, path: "/staff", component: StaffPage });
const audit = createRoute({ getParentRoute: () => root, path: "/audit", component: AuditPage });

const routeTree = root.addChildren([dashboard, editions, editionDetail, pricing, registrations, camp, people, staff, audit]);

const router = createRouter({ routeTree });
declare module "@tanstack/react-router" { interface Register { router: typeof router } }

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: (n, e) => n < 1 && !(e as { status?: number })?.status } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider><RouterProvider router={router} /></SessionProvider>
    </QueryClientProvider>
  );
}
