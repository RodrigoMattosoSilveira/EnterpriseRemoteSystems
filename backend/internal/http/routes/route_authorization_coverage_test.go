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
		"requirePermission":             {},
		"requireApplicationPermission":  {},
		"requireTenantPermission":       {},
		"requirePermissionOrSelfPerson": {},
		"authorizationHandledByHandler": {},
	}
	handlerAuthorizedMethods := map[string]struct{}{
		"BackfillDebitLedgerReceipts":      {},
		"GetSecondPersonApprovalPolicy":    {},
		"UpdateSecondPersonApprovalPolicy": {},
		"PrintReceipt":                     {},
		"ReturnReceipt":                    {},
		"ReverseEntry":                     {},
		"ReplaceEntry":                     {},
		"ZeroGold":                         {},
		"PartialPayout":                    {},
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
