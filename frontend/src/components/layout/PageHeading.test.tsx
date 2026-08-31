import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageContextHeading, PageTitle } from "./PageHeading";

describe("PageHeading", () => {
  it("renders the page title as the major heading and entity context as subordinate", () => {
    const markup = renderToStaticMarkup(
      <>
        <PageTitle>Tenant Administration</PageTitle>
        <PageContextHeading>Default Tenant</PageContextHeading>
      </>,
    );

    expect(markup).toContain('<h1 class="text-3xl font-bold text-gray-950">Tenant Administration</h1>');
    expect(markup).toContain('<h2 class="mt-1 text-lg font-semibold text-gray-800">Default Tenant</h2>');
  });

  it("preserves layout-only classes without changing the heading scale", () => {
    const markup = renderToStaticMarkup(<PageTitle className="mt-3">New Person</PageTitle>);

    expect(markup).toContain('class="text-3xl font-bold text-gray-950 mt-3"');
  });
});
