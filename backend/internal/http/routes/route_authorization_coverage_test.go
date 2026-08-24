package routes

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"
)

func TestEveryRegisteredAPIRouteHasAuthorizationCoverage(t *testing.T) {
	t.Parallel()

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve route test directory")
	}
	dir := filepath.Dir(currentFile)

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read route directory: %v", err)
	}

	allowedGuards := map[string]struct{}{
		"requirePermission":                   {},
		"requireApplicationPermission":        {},
		"requireTenantPermission":             {},
		"requireTenantAdministrator":          {},
		"requirePermissionOrSelfPerson":       {},
		"requirePermissionOrSelfCollaborator": {},
		"authorizationHandledByHandler":       {},
		"authenticationPublic":                {},
		"requireAuthenticatedSession":         {},
	}
	handlerAuthorizedMethods := map[string]struct{}{
		"BackfillDebitLedgerReceipts":      {},
		"GetSecondPersonApprovalPolicy":    {},
		"UpdateSecondPersonApprovalPolicy": {},
		"GetSelfPrintableReceipt":          {},
		"PrintReceipt":                     {},
		"ReturnReceipt":                    {},
		"AcceptReceipt":                    {},
		"ReverseEntry":                     {},
		"ReplaceEntry":                     {},
		"ZeroGold":                         {},
		"PartialPayout":                    {},
		"FinalTenantPayment":               {},
		"FinalCollaboratorPayment":         {},
		"CloseJourney":                     {},
	}
	routeMethods := map[string]struct{}{
		"Get":    {},
		"Post":   {},
		"Put":    {},
		"Patch":  {},
		"Delete": {},
	}

	var uncovered []string
	filesChecked := 0
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		if name == "health.go" || name == "authorization.go" || name == "dependencies.go" || name == "routes.go" {
			continue
		}

		path := filepath.Join(dir, name)
		fset := token.NewFileSet()
		file, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			t.Fatalf("parse %s: %v", name, err)
		}
		filesChecked++

		ast.Inspect(file, func(node ast.Node) bool {
			call, ok := node.(*ast.CallExpr)
			if !ok {
				return true
			}
			selector, ok := call.Fun.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			if _, ok := routeMethods[selector.Sel.Name]; !ok {
				return true
			}
			guard := authorizationGuardName(call.Args, allowedGuards)
			if guard != "" {
				if guard != "authorizationHandledByHandler" || handlerMethodAllowed(call.Args, handlerAuthorizedMethods) {
					return true
				}
			}

			position := fset.Position(call.Pos())
			uncovered = append(uncovered, position.String()+" "+selector.Sel.Name)
			return true
		})
	}

	if filesChecked == 0 {
		t.Fatal("no API route registration files were audited")
	}
	if len(uncovered) > 0 {
		sort.Strings(uncovered)
		t.Fatalf("API route registrations without authorization coverage:\n%s", strings.Join(uncovered, "\n"))
	}
}

func authorizationGuardName(args []ast.Expr, allowed map[string]struct{}) string {
	if len(args) < 2 {
		return ""
	}
	for _, arg := range args[:len(args)-1] {
		call, ok := arg.(*ast.CallExpr)
		if !ok {
			continue
		}
		ident, ok := call.Fun.(*ast.Ident)
		if !ok {
			continue
		}
		if _, ok := allowed[ident.Name]; ok {
			return ident.Name
		}
	}
	return ""
}

func handlerMethodAllowed(args []ast.Expr, allowed map[string]struct{}) bool {
	if len(args) == 0 {
		return false
	}
	selector, ok := args[len(args)-1].(*ast.SelectorExpr)
	if !ok {
		return false
	}
	_, ok = allowed[selector.Sel.Name]
	return ok
}

func TestAuthenticationAccountRoutesRequireApplicationScope(t *testing.T) {
	t.Parallel()

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve route test directory")
	}
	contents, err := os.ReadFile(filepath.Join(filepath.Dir(currentFile), "authentication.go"))
	if err != nil {
		t.Fatalf("read authentication routes: %v", err)
	}
	source := string(contents)
	for _, route := range []string{
		`r.Get("/accounts", requireApplicationPermission`,
		`r.Post("/accounts", requireApplicationPermission`,
		`r.Patch("/accounts/:id/active", requireApplicationPermission`,
		`r.Post("/accounts/:id/password-reset-tokens", requireApplicationPermission`,
		`r.Get("/reactivation-requests", requireApplicationPermission`,
		`r.Post("/reactivation-requests/:id/decision", requireApplicationPermission`,
	} {
		if !strings.Contains(source, route) {
			t.Fatalf("authentication account administration route must require application scope: %s", route)
		}
	}
}

func TestTenantAuthenticationProvisioningRoutesRequireTenantAdministrator(t *testing.T) {
	t.Parallel()

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve route test directory")
	}
	contents, err := os.ReadFile(filepath.Join(filepath.Dir(currentFile), "people.go"))
	if err != nil {
		t.Fatalf("read People routes: %v", err)
	}
	source := string(contents)
	for _, route := range []string{
		`r.Get("/:id/authentication", requireTenantAdministrator`,
		`r.Post("/:id/authentication/enable", requireTenantAdministrator`,
		`r.Post("/:id/authentication/reactivation-request", requireTenantAdministrator`,
	} {
		if !strings.Contains(source, route) {
			t.Fatalf("tenant authentication route must require Tenant Administrator scope: %s", route)
		}
	}
}

func TestAuthenticationSessionMiddlewareCoversBusinessRoutesAfterCutover(t *testing.T) {
	t.Parallel()

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve route test directory")
	}
	dir := filepath.Dir(currentFile)

	routesContents, err := os.ReadFile(filepath.Join(dir, "routes.go"))
	if err != nil {
		t.Fatalf("read root routes: %v", err)
	}
	routesSource := string(routesContents)
	for _, required := range []string{
		"v1.Use(authenticationMiddleware(deps))",
		"v1.Use(rejectInvalidAuthenticationSession(deps))",
		"v1.Use(authorizationMiddleware(deps))",
	} {
		if !strings.Contains(routesSource, required) {
			t.Fatalf("Bite 28C requires global session-backed authorization middleware: %s", required)
		}
	}
	if strings.Index(routesSource, "v1.Use(authenticationMiddleware(deps))") > strings.Index(routesSource, "v1.Use(authorizationMiddleware(deps))") {
		t.Fatal("authentication session resolution must run before authorization actor resolution")
	}

	authenticationContents, err := os.ReadFile(filepath.Join(dir, "authentication.go"))
	if err != nil {
		t.Fatalf("read authentication routes: %v", err)
	}
	if !strings.Contains(string(authenticationContents), `r.Use(authenticationMiddleware(deps))`) {
		t.Fatal("authentication routes must continue resolving their own session cookie before session-protected handlers")
	}
}

func TestGoldPriceAdministrationRequiresDedicatedTenantAdminPermission(t *testing.T) {
	t.Parallel()

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve route test directory")
	}
	contents, err := os.ReadFile(filepath.Join(filepath.Dir(currentFile), "price_lists.go"))
	if err != nil {
		t.Fatalf("read price-list routes: %v", err)
	}
	source := string(contents)

	for _, route := range []string{
		`goldPrices.Get("/", requirePermission(deps, authz.PermissionGoldPricesManage)`,
		`goldPrices.Post("/", requirePermission(deps, authz.PermissionGoldPricesManage)`,
		`goldPrices.Patch("/:id/deactivate", requirePermission(deps, authz.PermissionGoldPricesManage)`,
	} {
		if !strings.Contains(source, route) {
			t.Fatalf("gold-price administration route must require dedicated Tenant Administrator authority: %s", route)
		}
	}

	if !strings.Contains(source, `goldPrices.Get("/latest", requirePermission(deps, authz.PermissionPriceListsRead)`) {
		t.Fatal("latest active gold price must remain readable to expense workflows without granting gold-price administration")
	}
}
