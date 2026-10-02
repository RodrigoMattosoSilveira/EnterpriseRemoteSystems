package main

import "testing"

func TestNormalizeProvisioningEnvironmentAllowsOnlyNonProductionTestContexts(t *testing.T) {
	tests := []struct {
		value    string
		expected string
		allowed  bool
	}{
		{value: "local", expected: "development", allowed: true},
		{value: "dev", expected: "development", allowed: true},
		{value: "development", expected: "development", allowed: true},
		{value: "test", expected: "test", allowed: true},
		{value: "testing", expected: "test", allowed: true},
		{value: "ci", expected: "test", allowed: true},
		{value: "production", allowed: false},
		{value: "prod", allowed: false},
		{value: "", allowed: false},
		{value: "staging", allowed: false},
	}
	for _, test := range tests {
		t.Run(test.value, func(t *testing.T) {
			actual, allowed := normalizeProvisioningEnvironment(test.value)
			if allowed != test.allowed {
				t.Fatalf("allowed=%v, want %v", allowed, test.allowed)
			}
			if actual != test.expected {
				t.Fatalf("normalized=%q, want %q", actual, test.expected)
			}
		})
	}
}
