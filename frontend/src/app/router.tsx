import {
  createBrowserRouter,
  isRouteErrorResponse,
  Link,
  useRouteError,
} from "react-router-dom";
import { PeopleListPage }   from "../features/people/PeopleListPage";
import { CreatePersonPage } from "../features/people/CreatePersonPage";
import { PersonDetailPage } from "../features/people/PersonDetailPage";
import { ReferenceDataAdminPage } from "../features/reference-data/ReferenceDataAdminPage";

function RouteErrorPage() {
  const error = useRouteError();

  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message = "The requested page could not be found.";
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-gray-600">{message}</p>
      <Link className="mt-4 inline-block underline" to="/people">
        Go to People
      </Link>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link className="mt-4 inline-block underline" to="/people">
        Go to People
      </Link>
    </main>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <PeopleListPage /> },
      { path: "people", element: <PeopleListPage /> },
      { path: "people/new", element: <CreatePersonPage /> },
      { path: "people/:id", element: <PersonDetailPage /> },
      { path: "admin/reference-data", element: <ReferenceDataAdminPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);